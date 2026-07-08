'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Cliente pidió (reunión post-2026-07-08): las recetas son sensibles al costo
 * de producción, no pueden ser modificadas por cualquier usuario. Solo el
 * gerente o el jefe de producción pueden editar/eliminar/agregar líneas y
 * procesos. Los demás roles pueden VER (via requireUser normal en lecturas)
 * pero no mutar.
 */
async function requireEditorReceta() {
  const { sb, userId } = await requireUser();
  const { data: roles } = await sb.from('usuarios_roles').select('rol').eq('usuario_id', userId);
  const arr = ((roles ?? []) as { rol: string }[]).map((r) => r.rol);
  const puedeEditar = arr.includes('gerente') || arr.includes('jefe_produccion');
  if (!puedeEditar) {
    throw new Error(
      'Solo el gerente o el jefe de producción pueden modificar recetas. ' +
      'Pedile a alguien con ese rol que lo haga.',
    );
  }
  return { sb, userId };
}

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

// ============================================================================
// Versionado: detección de "tallas en producción"
// ============================================================================

/**
 * Devuelve el SET de tallas del producto que ya tienen al menos una línea OT.
 * El bloqueo es POR TALLA, no por receta entera: agregar receta para una talla
 * que jamás se produjo NO afecta trazabilidad de OTs viejas, así que debe
 * permitirse aunque otras tallas del mismo producto sí tengan OTs.
 *
 * Definición operativa acordada con el cliente:
 *   Las OTs nacen en estado PLANIFICADA desde un plan APROBADO. Apenas
 *   existe una línea OT con esa talla, hay compromiso de producción real
 *   sobre esa talla → se bloquea edición de líneas de receta para esa talla.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tallasEnProduccion(sb: any, productoId: string): Promise<Set<string>> {
  const { data } = await sb
    .from('ot_lineas')
    .select('talla')
    .eq('producto_id', productoId);
  const set = new Set<string>();
  for (const r of (data ?? []) as { talla?: string | null }[]) {
    if (r.talla) set.add(String(r.talla));
  }
  return set;
}

/**
 * Tallas del producto con OTs creadas DESPUÉS de la receta indicada.
 * Las OTs anteriores corresponden a versiones previas y NO deben bloquear
 * esta receta (sirve para que una v2.0 recién creada quede editable
 * aunque la v1.0 vieja tenga OTs históricas).
 *
 * Implementación: 2 queries separadas en lugar de un embed PostgREST.
 * El embed `ot:ot_id(created_at)` a veces devuelve null por RLS sobre el
 * parent y entonces el fallback antiguo contaba esas OTs como "posteriores",
 * lo que CONGELABA versiones nuevas erróneamente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tallasEnProduccionPosterior(sb: any, recetaId: string, productoId: string): Promise<Set<string>> {
  const { data: rec } = await sb
    .from('recetas')
    .select('created_at')
    .eq('id', recetaId)
    .maybeSingle();
  const createdAt = rec?.created_at as string | undefined;
  if (!createdAt) return await tallasEnProduccion(sb, productoId);

  // OTs del producto con sus tallas y ot_id.
  const { data: lineas } = await sb
    .from('ot_lineas')
    .select('talla, ot_id')
    .eq('producto_id', productoId)
    .limit(5000);
  const otIds = Array.from(
    new Set((lineas ?? []).map((l: { ot_id?: string | null }) => l.ot_id).filter(Boolean) as string[]),
  );
  if (otIds.length === 0) return new Set();

  // Fechas de creación de esas OTs (query separada, sin embed problemático).
  const { data: ots } = await sb
    .from('ot')
    .select('id, created_at')
    .in('id', otIds);
  const posteriores = new Set<string>();
  for (const o of (ots ?? []) as { id: string; created_at?: string | null }[]) {
    if (o.created_at && o.created_at >= createdAt) posteriores.add(o.id);
  }

  const set = new Set<string>();
  for (const l of (lineas ?? []) as { talla?: string | null; ot_id?: string | null }[]) {
    if (l.talla && l.ot_id && posteriores.has(l.ot_id)) set.add(String(l.talla));
  }
  return set;
}

/**
 * Exportado para el page.tsx — devuelve las tallas congeladas de una receta
 * (las que tienen OTs posteriores a la creación de la receta).
 */
export async function obtenerTallasCongeladas(
  recetaId: string,
  productoId: string,
): Promise<string[]> {
  const { sb } = await requireUser();
  const set = await tallasEnProduccionPosterior(sb, recetaId, productoId);
  return Array.from(set);
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

function msgTallaCongelada(talla: string) {
  return (
    `La talla ${talla.replace('T', '')} de este producto ya entró a producción (hay OTs generadas para esa talla). ` +
    'No se puede modificar la receta de esa talla específica. ' +
    'Las tallas que aún no tuvieron OTs sí podés editarlas libremente. ' +
    'Para cambiar una talla congelada, creá una nueva versión desde el banner.'
  );
}

const MSG_HISTORICA =
  'Esta receta es una versión histórica (solo lectura). No se puede editar para preservar la trazabilidad ' +
  'de costos y movimientos de OTs pasadas que la consumieron. Andá a la versión vigente del producto para hacer cambios.';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recetaActiva(sb: any, recetaId: string): Promise<boolean> {
  const { data } = await sb.from('recetas').select('activa').eq('id', recetaId).maybeSingle();
  return !!data?.activa;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiTallaEnRecetaPosterior(sb: any, recetaId: string, talla: string) {
  // 1) Histórica → bloqueada siempre, independiente de talla.
  if (!(await recetaActiva(sb, recetaId))) throw new Error(MSG_HISTORICA);
  // 2) Activa: solo bloquear si esta talla tiene OTs posteriores.
  const { data } = await sb.from('recetas').select('producto_id').eq('id', recetaId).maybeSingle();
  const pid = (data?.producto_id as string | undefined) ?? '';
  if (!pid) return;
  const tallasCong = await tallasEnProduccionPosterior(sb, recetaId, pid);
  if (tallasCong.has(talla)) throw new Error(msgTallaCongelada(talla));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiLineaEnProduccion(sb: any, lineaId: string) {
  const { data } = await sb
    .from('recetas_lineas')
    .select('talla, receta_id, recetas(producto_id, activa)')
    .eq('id', lineaId)
    .maybeSingle();
  const rec = data?.recetas as { producto_id?: string; activa?: boolean } | null;
  const recId = data?.receta_id as string | undefined;
  const talla = data?.talla as string | undefined;
  if (!rec) return;
  if (rec.activa === false) throw new Error(MSG_HISTORICA);
  const pid = rec.producto_id ?? '';
  if (!pid || !recId || !talla) return;
  const tallasCong = await tallasEnProduccionPosterior(sb, recId, pid);
  if (tallasCong.has(talla)) throw new Error(msgTallaCongelada(talla));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiProcesoEnProduccion(sb: any, procesoId: string) {
  const { data } = await sb
    .from('productos_procesos')
    .select('producto_id, talla')
    .eq('id', procesoId)
    .maybeSingle();
  const pid = (data?.producto_id as string | undefined) ?? '';
  if (!pid) return;
  // Procesos no están atados a receta — usar el set global por producto.
  const tallas = await tallasEnProduccion(sb, pid);
  const talla = data?.talla as string | undefined;
  // Sin talla específica = aplica a todas; bloquear si hay CUALQUIER talla en producción.
  if (!talla) {
    if (tallas.size > 0) throw new Error(msgTallaCongelada(Array.from(tallas)[0] ?? 'T?'));
    return;
  }
  if (tallas.has(talla)) throw new Error(msgTallaCongelada(talla));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiProductoEnProduccion(sb: any, productoId: string) {
  // Reemplazo retrocompatible: si CUALQUIER talla del producto entró a producción,
  // bloquea acciones globales (reorder, duplicar masivo). Para acciones por talla
  // específica usá bloquearSiTallaEnRecetaPosterior o bloquearSiTallaEnProductoProduccion.
  const tallas = await tallasEnProduccion(sb, productoId);
  if (tallas.size > 0) throw new Error(msgTallaCongelada(Array.from(tallas)[0] ?? 'T?'));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bloquearSiTallaEnProductoProduccion(sb: any, productoId: string, talla: string | null | undefined) {
  // Para procesos: si no hay talla específica (aplica a todas), bloquear si hay CUALQUIER
  // talla en producción. Si hay talla específica, bloquear solo esa.
  const tallas = await tallasEnProduccion(sb, productoId);
  if (!talla) {
    if (tallas.size > 0) throw new Error(msgTallaCongelada(Array.from(tallas)[0] ?? 'T?'));
    return;
  }
  if (tallas.has(talla)) throw new Error(msgTallaCongelada(talla));
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
    const { sb } = await requireEditorReceta();

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
    // Bloquear solo si la TALLA específica ya entró a producción.
    // upsertReceta puede ejecutarse desde formularios legacy — aplicamos
    // la guarda igual que el resto.
    const { sb } = await requireEditorReceta();
    await bloquearSiTallaEnRecetaPosterior(sb, data.receta_id, data.talla);
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
    const { sb } = await requireEditorReceta();
    // Validar talla por talla: rechazamos solo las que están congeladas y
    // dejamos pasar el resto, o abortamos si TODAS están congeladas. Para
    // evitar inserciones parciales sorpresivas, abortamos si CUALQUIERA
    // está congelada y reportamos cuáles.
    if (!(await recetaActiva(sb, data.receta_id))) throw new Error(MSG_HISTORICA);
    const { data: rec } = await sb.from('recetas').select('producto_id').eq('id', data.receta_id).maybeSingle();
    const pid = (rec?.producto_id as string | undefined) ?? '';
    if (pid) {
      const tallasCong = await tallasEnProduccionPosterior(sb, data.receta_id, pid);
      const conflictos = data.tallas.filter((t) => tallasCong.has(t));
      if (conflictos.length > 0) {
        const lista = conflictos.map((t) => t.replace('T', '')).join(', ');
        throw new Error(
          `Las tallas ${lista} ya tienen OTs generadas y no se pueden modificar. ` +
          `Desmarcalas o creá una nueva versión de la receta.`,
        );
      }
    }
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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();

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
      // Si el destino YA tenía receta activa, chequear talla por talla que no
      // tenga OTs posteriores. Las tallas en producción se bloquean para no
      // sobreescribir lo que ya se cortó.
      const tallasACopiar = new Set(lineas.map((l) => (tallaDestino || l.talla) as string));
      const tallasCong = await tallasEnProduccionPosterior(sb, recetaDestId, productoDestinoId);
      const conflictos = Array.from(tallasACopiar).filter((t) => tallasCong.has(t));
      if (conflictos.length > 0) {
        const lista = conflictos.map((t) => t.replace('T', '')).join(', ');
        throw new Error(
          `El producto destino ya tiene OTs para las tallas ${lista}. ` +
          `No se pueden sobreescribir esas líneas. Creá una nueva versión en el destino o filtrá por tallas libres.`,
        );
      }
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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();
    // Solo bloquear si la TALLA DESTINO ya está en producción (la origen no se toca).
    await bloquearSiTallaEnRecetaPosterior(sb, recetaId, tallaDestino);
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
    const { sb } = await requireEditorReceta();
    // Bloquear solo si la talla específica está en producción (o cualquiera si talla es null).
    await bloquearSiTallaEnProductoProduccion(sb, productoId, data.talla || null);

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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();
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
    const { sb } = await requireEditorReceta();

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
    const { sb } = await requireEditorReceta();

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
