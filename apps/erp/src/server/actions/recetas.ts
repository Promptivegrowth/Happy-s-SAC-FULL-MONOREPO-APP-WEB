'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

// ============================================================================
// Versionado: detección de "producto en producción"
// ============================================================================

/**
 * Devuelve true si el producto ya entró a producción (existe al menos una OT).
 * Se usa para bloquear ediciones a la receta vigente — el usuario debe
 * crear una versión nueva (v2.0, v3.0…) en lugar de modificar la actual.
 *
 * Definición operativa acordada con el cliente:
 *   Las OTs nacen en estado PLANIFICADA desde un plan APROBADO. Apenas
 *   existe una OT ya hay compromiso de producción real → bloquear edición.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function productoEnProduccion(sb: any, productoId: string): Promise<boolean> {
  const { count } = await sb
    .from('ot_lineas')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', productoId);
  return (count ?? 0) > 0;
}

/**
 * Siguiente versión de receta: "v1.0" → "v2.0", "v2.0" → "v3.0", etc.
 * Si el formato es raro, cae al siguiente entero después del último número
 * encontrado en cualquier versión existente.
 */
function siguienteVersion(versionesExistentes: string[]): string {
  let max = 0;
  for (const v of versionesExistentes) {
    const m = v.match(/v?(\d+)/);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `v${max + 1}.0`;
}

const MSG_CONGELADA =
  'La receta de este producto está congelada porque ya entró a producción (hay OTs generadas). ' +
  'Para hacer cambios, creá una nueva versión desde el botón "Versionar" en el detalle de la receta.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiProductoEnProduccion(sb: any, productoId: string) {
  if (await productoEnProduccion(sb, productoId)) throw new Error(MSG_CONGELADA);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiRecetaEnProduccion(sb: any, recetaId: string) {
  const { data } = await sb.from('recetas').select('producto_id').eq('id', recetaId).maybeSingle();
  const pid = (data?.producto_id as string | undefined) ?? '';
  if (!pid) return; // no encontrada, dejamos que el insert/update reviente con error real
  await bloquearSiProductoEnProduccion(sb, pid);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiLineaEnProduccion(sb: any, lineaId: string) {
  const { data } = await sb
    .from('recetas_lineas')
    .select('recetas(producto_id)')
    .eq('id', lineaId)
    .maybeSingle();
  const pid = (data?.recetas?.producto_id as string | undefined) ?? '';
  if (!pid) return;
  await bloquearSiProductoEnProduccion(sb, pid);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiProcesoEnProduccion(sb: any, procesoId: string) {
  const { data } = await sb
    .from('productos_procesos')
    .select('producto_id')
    .eq('id', procesoId)
    .maybeSingle();
  const pid = (data?.producto_id as string | undefined) ?? '';
  if (!pid) return;
  await bloquearSiProductoEnProduccion(sb, pid);
}

const lineaSchema = z.object({
  receta_id: z.string().uuid(),
  material_id: z.string().uuid(),
  talla: z.enum(TALLAS),
  cantidad: z.coerce.number().min(0),
  sale_a_servicio: z.boolean().default(true),
  cantidad_almacen: z.coerce.number().min(0).default(0),
  unidad_id: z.string().uuid().optional().or(z.literal('')),
  observacion: z.string().optional().or(z.literal('')),
});

/**
 * Crea una receta vacía v1.0 activa para un producto que aún no tiene
 * receta activa. Si ya tiene una, retorna error explícito (el usuario
 * debe abrir la existente o duplicarla).
 */
export async function crearReceta(productoId: string): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    if (!productoId) throw new Error('Producto requerido');
    const { sb } = await requireUser();

    // Verificar que el producto no tenga ya una receta activa
    const { data: existente } = await sb
      .from('recetas')
      .select('id')
      .eq('producto_id', productoId)
      .eq('activa', true)
      .maybeSingle();
    if (existente) {
      throw new Error('Este producto ya tiene una receta activa. Abrila desde el listado o duplicala.');
    }

    const { data: row, error } = await sb
      .from('recetas')
      .insert({ producto_id: productoId, version: 'v1.0', activa: true })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

export async function upsertReceta(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = lineaSchema.parse({
      receta_id: fd.get('receta_id'),
      material_id: fd.get('material_id'),
      talla: fd.get('talla'),
      cantidad: fd.get('cantidad'),
      sale_a_servicio: fd.get('sale_a_servicio') === 'on',
      cantidad_almacen: fd.get('cantidad_almacen') || 0,
      unidad_id: fd.get('unidad_id') || '',
      observacion: fd.get('observacion') || '',
    });
    // Bloquear si el producto de esta receta ya está en producción.
    // upsertReceta puede ejecutarse desde formularios legacy — aplicamos
    // la guarda igual que el resto.
    const { sb } = await requireUser();
    await bloquearSiRecetaEnProduccion(sb, data.receta_id);
    const { error } = await sb.from('recetas_lineas').upsert({
      receta_id: data.receta_id,
      material_id: data.material_id,
      talla: data.talla,
      cantidad: data.cantidad,
      sale_a_servicio: data.sale_a_servicio,
      cantidad_almacen: data.cantidad_almacen,
      unidad_id: data.unidad_id || null,
      observacion: data.observacion || null,
    }, { onConflict: 'receta_id,material_id,talla' });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/**
 * Inserta la misma línea (mismo material+cantidad+config) en MÚLTIPLES tallas
 * de una sola vez. Si una talla ya tenía esa línea, se hace upsert (sobrescribe).
 * Útil para evitar el ingreso uno por uno cuando el material aplica igual a
 * varias tallas (ej. botón en T6, T8, T10, T12).
 */
const upsertMultiSchema = z.object({
  receta_id: z.string().uuid(),
  material_id: z.string().uuid(),
  tallas: z.array(z.enum(TALLAS)).min(1, 'Seleccioná al menos una talla'),
  cantidad: z.coerce.number().min(0),
  sale_a_servicio: z.boolean().default(false),
  cantidad_almacen: z.coerce.number().min(0).default(0),
  unidad_id: z.string().uuid().optional().or(z.literal('')),
  observacion: z.string().optional().or(z.literal('')),
});
export async function upsertRecetaMulti(
  input: z.input<typeof upsertMultiSchema>,
): Promise<ActionResult<{ insertadas: number }>> {
  const r = await runAction(async () => {
    const data = upsertMultiSchema.parse(input);
    const { sb } = await requireUser();
    await bloquearSiRecetaEnProduccion(sb, data.receta_id);
    const filas = data.tallas.map((t) => ({
      receta_id: data.receta_id,
      material_id: data.material_id,
      talla: t,
      cantidad: data.cantidad,
      sale_a_servicio: data.sale_a_servicio,
      cantidad_almacen: data.cantidad_almacen,
      unidad_id: data.unidad_id || null,
      observacion: data.observacion || null,
    }));
    const { error } = await sb
      .from('recetas_lineas')
      .upsert(filas, { onConflict: 'receta_id,material_id,talla' });
    if (error) throw new Error(error.message);
    return { insertadas: filas.length };
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

export async function eliminarLinea(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    await bloquearSiLineaEnProduccion(sb, id);
    const { error } = await sb.from('recetas_lineas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/** Toggle inline rápido del flag sale_a_servicio en una línea. */
export async function toggleSaleAServicio(id: string, valor: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    await bloquearSiLineaEnProduccion(sb, id);
    const { error } = await sb.from('recetas_lineas').update({ sale_a_servicio: valor }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/**
 * Duplica las líneas de una receta hacia el producto destino.
 * Acepta filtro opcional por talla origen y override opcional de talla destino:
 * - Sin filtros: copia todas las líneas tal cual (mismo talla cada una).
 * - tallaOrigen seteada: solo copia líneas de esa talla.
 * - tallaDestino seteada: todas las líneas copiadas reciben esa talla (útil
 *   para crear T8 a partir de T6 en otro producto y luego ajustar cantidades).
 *
 * Si el producto destino ya tiene receta activa, hace upsert (no destruye).
 */
export async function duplicarReceta(
  recetaOrigenId: string,
  productoDestinoId: string,
  tallaOrigen?: string,
  tallaDestino?: string,
): Promise<ActionResult<{ lineas: number }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();

    // 1. Cargar líneas de la receta origen (filtradas por talla si aplica)
    let q = sb
      .from('recetas_lineas')
      .select('material_id, talla, cantidad, sale_a_servicio, cantidad_almacen, unidad_id, observacion')
      .eq('receta_id', recetaOrigenId);
    if (tallaOrigen) q = q.eq('talla', tallaOrigen as (typeof TALLAS)[number]);
    const { data: lineas, error: errL } = await q;
    if (errL) throw new Error(errL.message);
    if (!lineas || lineas.length === 0) {
      throw new Error(
        tallaOrigen
          ? `La receta origen no tiene líneas en la talla ${tallaOrigen.replace('T', '')}`
          : 'La receta origen no tiene líneas que duplicar',
      );
    }

    // 2. Buscar/crear receta activa del producto destino
    const { data: recetaDest } = await sb
      .from('recetas')
      .select('id')
      .eq('producto_id', productoDestinoId)
      .eq('activa', true)
      .maybeSingle();

    let recetaDestId = recetaDest?.id;
    if (!recetaDestId) {
      const { data: nueva, error: errR } = await sb
        .from('recetas')
        .insert({ producto_id: productoDestinoId, version: 'v1.0', activa: true })
        .select('id')
        .single();
      if (errR) throw new Error(errR.message);
      recetaDestId = nueva.id;
    } else {
      // Si el destino YA tenía receta activa, chequear que no esté en producción.
      // Sino, duplicar líneas equivale a editar una receta congelada.
      await bloquearSiProductoEnProduccion(sb, productoDestinoId);
    }

    // 3. Insertar líneas con la nueva receta_id (override talla destino si aplica)
    const filas = lineas.map((l) => ({
      receta_id: recetaDestId!,
      material_id: l.material_id,
      talla: (tallaDestino || l.talla) as (typeof TALLAS)[number],
      cantidad: l.cantidad,
      sale_a_servicio: l.sale_a_servicio,
      cantidad_almacen: l.cantidad_almacen,
      unidad_id: l.unidad_id,
      observacion: l.observacion,
    }));
    const { error: errInsert } = await sb
      .from('recetas_lineas')
      .upsert(filas, { onConflict: 'receta_id,material_id,talla' });
    if (errInsert) throw new Error(errInsert.message);

    return { lineas: filas.length };
  });
  if (r.ok) await bumpPaths('/recetas', `/productos/${productoDestinoId}`);
  return r;
}

/**
 * Edición inline de campos de una línea de receta (cantidad, cantidad_almacen,
 * observación, sale_a_servicio). No permite cambiar material/talla porque eso
 * rompe la unique key — para eso eliminar y agregar de nuevo.
 */
export async function actualizarLineaReceta(
  id: string,
  patch: Partial<{
    cantidad: number;
    cantidad_almacen: number;
    sale_a_servicio: boolean;
    observacion: string;
  }>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    // chequeo de versionado: bloquear si el producto está en producción
    const { sb } = await requireUser();
    await bloquearSiLineaEnProduccion(sb, id);
    const { error } = await sb.from('recetas_lineas').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/**
 * Duplica las líneas de una talla a otra dentro de la MISMA receta.
 * Útil cuando ya tenés T6 hecha y querés copiarla a T8 para luego ajustar
 * cantidades. Si la talla destino ya tiene líneas con el mismo material,
 * no se duplican (upsert).
 */
export async function duplicarLineasTalla(
  recetaId: string,
  tallaOrigen: string,
  tallaDestino: string,
): Promise<ActionResult<{ lineas: number }>> {
  const r = await runAction(async () => {
    if (tallaOrigen === tallaDestino) throw new Error('Talla origen y destino son iguales');
    const { sb } = await requireUser();
    await bloquearSiRecetaEnProduccion(sb, recetaId);
    const { data: lineas, error: errL } = await sb
      .from('recetas_lineas')
      .select('material_id, cantidad, sale_a_servicio, cantidad_almacen, unidad_id, observacion')
      .eq('receta_id', recetaId)
      .eq('talla', tallaOrigen as (typeof TALLAS)[number]);
    if (errL) throw new Error(errL.message);
    if (!lineas || lineas.length === 0) throw new Error(`La talla ${tallaOrigen.replace('T', '')} no tiene líneas`);

    const filas = lineas.map((l) => ({
      receta_id: recetaId,
      material_id: l.material_id,
      talla: tallaDestino as (typeof TALLAS)[number],
      cantidad: l.cantidad,
      sale_a_servicio: l.sale_a_servicio,
      cantidad_almacen: l.cantidad_almacen,
      unidad_id: l.unidad_id,
      observacion: l.observacion,
    }));
    const { error: errIns } = await sb
      .from('recetas_lineas')
      .upsert(filas, { onConflict: 'receta_id,material_id,talla' });
    if (errIns) throw new Error(errIns.message);
    return { lineas: filas.length };
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

// ============================================================================
// Procesos (productos_procesos): secuencia de operaciones por producto
// ============================================================================

const procesoSchema = z.object({
  producto_id: z.string().uuid(),
  proceso: z.enum(PROCESOS),
  area_id: z.string().uuid().optional().or(z.literal('')),
  talla: z.enum(TALLAS).optional().or(z.literal('')),
  orden: z.coerce.number().int().min(0).default(0),
  tiempo_estandar_min: z.coerce.number().min(0).optional().or(z.literal('')),
  es_tercerizado: z.boolean().default(false),
  observacion: z.string().optional().or(z.literal('')),
});

export async function agregarProceso(
  productoId: string,
  input: z.input<typeof procesoSchema>,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = procesoSchema.parse({ ...input, producto_id: productoId });
    const { sb } = await requireUser();
    await bloquearSiProductoEnProduccion(sb, productoId);

    // orden auto: el siguiente disponible para ese producto (solo procesos activos)
    let orden = data.orden;
    if (orden === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sbAny = sb as unknown as { from: (t: string) => any };
      const { data: maxRow } = await sbAny
        .from('productos_procesos')
        .select('orden')
        .eq('producto_id', productoId)
        .eq('activo', true)
        .order('orden', { ascending: false })
        .limit(1)
        .maybeSingle();
      orden = ((maxRow?.orden as number | undefined) ?? 0) + 10;
    }

    const { data: row, error } = await sb
      .from('productos_procesos')
      .insert({
        producto_id: productoId,
        proceso: data.proceso,
        area_id: data.area_id || null,
        talla: (data.talla || null) as (typeof TALLAS)[number] | null,
        orden,
        tiempo_estandar_min: data.tiempo_estandar_min === '' ? null : Number(data.tiempo_estandar_min),
        es_tercerizado: data.es_tercerizado,
        observacion: data.observacion || null,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths(`/productos/${productoId}`, '/recetas');
  return r;
}

export async function actualizarProceso(
  id: string,
  patch: Partial<{ tiempo_estandar_min: number; orden: number; es_tercerizado: boolean; observacion: string; area_id: string }>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    await bloquearSiProcesoEnProduccion(sb, id);
    const { error } = await sb.from('productos_procesos').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/**
 * Reordena las operaciones de un producto. Recibe los ids en el orden
 * deseado; les asigna orden = 10, 20, 30, … (con espacios para futuras
 * inserciones manuales).
 */
export async function reordenarProcesos(
  productoId: string,
  idsEnOrden: string[],
): Promise<ActionResult<{ actualizadas: number }>> {
  const r = await runAction(async () => {
    if (idsEnOrden.length === 0) return { actualizadas: 0 };
    const { sb } = await requireUser();
    await bloquearSiProductoEnProduccion(sb, productoId);
    let count = 0;
    // Una transacción real requiere PL/pgSQL; acá hacemos updates secuenciales
    // que son seguros porque solo tocan el campo `orden` y no hay constraints
    // de unicidad en él.
    for (let i = 0; i < idsEnOrden.length; i++) {
      const id = idsEnOrden[i]!;
      const orden = (i + 1) * 10;
      const { error } = await sb
        .from('productos_procesos')
        .update({ orden })
        .eq('id', id)
        .eq('producto_id', productoId); // doble check para que no se reordenen procesos de otro producto
      if (error) throw new Error(`reorder ${id}: ${error.message}`);
      count++;
    }
    return { actualizadas: count };
  });
  if (r.ok) await bumpPaths(`/productos/${productoId}`, '/recetas');
  return r;
}

export async function eliminarProceso(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    await bloquearSiProcesoEnProduccion(sb, id);
    const { error } = await sb.from('productos_procesos').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/**
 * Duplica la SECUENCIA DE PROCESOS de un producto a otro.
 *
 * - Copia todos los productos_procesos del origen al destino preservando
 *   proceso, area_id, talla, tiempo_estandar_min, es_tercerizado y
 *   observacion.
 * - Los órdenes se re-asignan a partir del último orden del destino (+10 c/u)
 *   para no chocar con procesos existentes.
 * - Por diseño NO sobrescribe: si el destino ya tenía procesos, los del
 *   origen se agregan al final. Si el cliente quiere "reemplazar todo",
 *   debe eliminar manualmente los del destino primero.
 */
export async function duplicarProcesos(
  productoOrigenId: string,
  productoDestinoId: string,
): Promise<ActionResult<{ procesos: number }>> {
  const r = await runAction(async () => {
    if (productoOrigenId === productoDestinoId) {
      throw new Error('El producto origen y destino no pueden ser el mismo.');
    }
    const { sb } = await requireUser();
    // El destino es el que se va a modificar — bloquear si está en producción.
    await bloquearSiProductoEnProduccion(sb, productoDestinoId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    // 1) Cargar todos los procesos ACTIVOS del origen (no copiar versiones viejas)
    const { data: origen, error: errO } = await sbAny
      .from('productos_procesos')
      .select('proceso, area_id, talla, tiempo_estandar_min, es_tercerizado, observacion')
      .eq('producto_id', productoOrigenId)
      .eq('activo', true)
      .order('orden');
    if (errO) throw new Error(errO.message);
    if (!origen || origen.length === 0) {
      throw new Error('El producto origen no tiene operaciones que duplicar.');
    }

    // 2) Calcular el orden base del destino (siguiente disponible entre activos)
    const { data: maxRow } = await sbAny
      .from('productos_procesos')
      .select('orden')
      .eq('producto_id', productoDestinoId)
      .eq('activo', true)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle();
    const ordenBase = ((maxRow?.orden as number | undefined) ?? 0);

    // 3) Insertar copias con orden incremental
    type OrigenRow = { proceso: string; area_id: string | null; talla: string | null; tiempo_estandar_min: number | null; es_tercerizado: boolean; observacion: string | null };
    const filas = (origen as OrigenRow[]).map((p, i) => ({
      producto_id: productoDestinoId,
      proceso: p.proceso,
      area_id: p.area_id,
      talla: p.talla,
      orden: ordenBase + (i + 1) * 10,
      tiempo_estandar_min: p.tiempo_estandar_min,
      es_tercerizado: p.es_tercerizado,
      observacion: p.observacion,
    }));
    const { error: errIns } = await sbAny.from('productos_procesos').insert(filas);
    if (errIns) throw new Error(errIns.message);

    return { procesos: filas.length };
  });
  if (r.ok) await bumpPaths(`/productos/${productoDestinoId}`, '/recetas');
  return r;
}

// ============================================================================
// Versionado
// ============================================================================

/**
 * Crea una nueva versión (v2.0, v3.0…) de la receta de MATERIALES de un
 * producto. La versión anterior queda inactiva (preservada para histórico).
 * La nueva queda como copia exacta de la anterior — el usuario edita lo que
 * necesite sobre esa copia.
 *
 * Devuelve el id de la nueva receta para que el cliente navegue a ella.
 */
export async function versionarRecetaMateriales(
  productoId: string,
): Promise<ActionResult<{ recetaId: string; version: string; lineas: number }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();

    // 1) Receta activa actual
    const { data: actual, error: errA } = await sb
      .from('recetas')
      .select('id, version')
      .eq('producto_id', productoId)
      .eq('activa', true)
      .maybeSingle();
    if (errA) throw new Error(errA.message);
    if (!actual) throw new Error('Este producto no tiene receta activa para versionar.');

    // 2) Todas las versiones existentes (activas + históricas) para calcular siguiente
    const { data: todas } = await sb
      .from('recetas')
      .select('version')
      .eq('producto_id', productoId);
    const nuevaVersion = siguienteVersion((todas ?? []).map((r) => r.version as string));

    // 3) Líneas a copiar
    const { data: lineas, error: errL } = await sb
      .from('recetas_lineas')
      .select('material_id, talla, cantidad, sale_a_servicio, cantidad_almacen, unidad_id, observacion, orden')
      .eq('receta_id', actual.id);
    if (errL) throw new Error(errL.message);

    // 4) Desactivar la vigente. IMPORTANTE: hacerlo ANTES de insertar la nueva
    //    porque hay un índice único parcial recetas_unica_activa_idx (mig 09)
    //    que solo permite UNA fila con activa=true por producto.
    {
      const { error } = await sb
        .from('recetas')
        .update({ activa: false })
        .eq('id', actual.id);
      if (error) throw new Error(`desactivar v anterior: ${error.message}`);
    }

    // 5) Crear receta nueva activa
    const { data: nueva, error: errN } = await sb
      .from('recetas')
      .insert({
        producto_id: productoId,
        version: nuevaVersion,
        activa: true,
        notas: `Clonada desde ${actual.version}`,
      })
      .select('id')
      .single();
    if (errN) throw new Error(`crear v nueva: ${errN.message}`);

    // 6) Copiar líneas (si la receta vieja tenía)
    if (lineas && lineas.length > 0) {
      const copias = lineas.map((l) => ({
        receta_id: nueva.id,
        material_id: l.material_id,
        talla: l.talla as (typeof TALLAS)[number],
        cantidad: l.cantidad,
        sale_a_servicio: l.sale_a_servicio,
        cantidad_almacen: l.cantidad_almacen,
        unidad_id: l.unidad_id,
        observacion: l.observacion,
        orden: l.orden,
      }));
      const { error: errIns } = await sb.from('recetas_lineas').insert(copias);
      if (errIns) throw new Error(`copiar líneas: ${errIns.message}`);
    }

    return { recetaId: nueva.id as string, version: nuevaVersion, lineas: lineas?.length ?? 0 };
  });
  if (r.ok) await bumpPaths('/recetas', `/productos/${productoId}`);
  return r;
}

/**
 * Crea una nueva versión de la receta de PROCESOS de un producto. Las filas
 * vigentes se duplican con la nueva versión y las viejas pasan a activo=false.
 * No cambia de "tabla" — es la misma productos_procesos con campo version.
 */
export async function versionarProcesosProducto(
  productoId: string,
): Promise<ActionResult<{ procesos: number; version: string }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();

    // 1) Procesos vigentes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: vigentes, error: errV } = await sbAny
      .from('productos_procesos')
      .select('proceso, area_id, talla, orden, tiempo_estandar_min, es_tercerizado, observacion, version')
      .eq('producto_id', productoId)
      .eq('activo', true);
    if (errV) throw new Error(errV.message);
    if (!vigentes || vigentes.length === 0) {
      throw new Error('Este producto no tiene procesos activos para versionar.');
    }

    // 2) Todas las versiones (vigentes + históricas) para calcular siguiente
    const { data: todas } = await sbAny
      .from('productos_procesos')
      .select('version')
      .eq('producto_id', productoId);
    const nuevaVersion = siguienteVersion(((todas ?? []) as { version: string }[]).map((p) => p.version));

    // 3) Desactivar vigentes
    {
      const { error } = await sbAny
        .from('productos_procesos')
        .update({ activo: false })
        .eq('producto_id', productoId)
        .eq('activo', true);
      if (error) throw new Error(`desactivar vigentes: ${error.message}`);
    }

    // 4) Insertar copias con nueva versión
    type Fila = { proceso: string; area_id: string | null; talla: string | null; orden: number; tiempo_estandar_min: number | null; es_tercerizado: boolean; observacion: string | null };
    const copias = (vigentes as Fila[]).map((p) => ({
      producto_id: productoId,
      proceso: p.proceso,
      area_id: p.area_id,
      talla: p.talla,
      orden: p.orden,
      tiempo_estandar_min: p.tiempo_estandar_min,
      es_tercerizado: p.es_tercerizado,
      observacion: p.observacion,
      version: nuevaVersion,
      activo: true,
    }));
    const { error: errIns } = await sbAny.from('productos_procesos').insert(copias);
    if (errIns) throw new Error(`copiar procesos: ${errIns.message}`);

    return { procesos: copias.length, version: nuevaVersion };
  });
  if (r.ok) await bumpPaths('/recetas', `/productos/${productoId}`);
  return r;
}

/**
 * Indica si una receta puede editarse libremente. Devuelve el motivo del
 * bloqueo si no se puede (para mostrar en UI).
 */
export async function estadoEditabilidadReceta(
  productoId: string,
): Promise<{ editable: boolean; motivo: string | null; cantidadOts: number }> {
  const { sb } = await requireUser();
  const { count } = await sb
    .from('ot_lineas')
    .select('id', { count: 'exact', head: true })
    .eq('producto_id', productoId);
  const cantidadOts = count ?? 0;
  if (cantidadOts > 0) {
    return {
      editable: false,
      motivo: `Hay ${cantidadOts} línea(s) de OT generadas con esta receta. Para cambiarla, creá una versión nueva.`,
      cantidadOts,
    };
  }
  return { editable: true, motivo: null, cantidadOts: 0 };
}
