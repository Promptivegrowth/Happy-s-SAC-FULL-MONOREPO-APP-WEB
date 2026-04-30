'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

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
    const { sb } = await requireUser();
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

export async function eliminarLinea(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
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
    const { error } = await sb.from('recetas_lineas').update({ sale_a_servicio: valor }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

/**
 * Duplica todas las líneas de una receta hacia el producto destino.
 * Si el producto destino ya tiene receta activa, agrega/actualiza sus líneas
 * (upsert por unique key receta_id+material_id+talla); no destruye lo previo.
 */
export async function duplicarReceta(
  recetaOrigenId: string,
  productoDestinoId: string,
): Promise<ActionResult<{ lineas: number }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();

    // 1. Cargar líneas de la receta origen
    const { data: lineas, error: errL } = await sb
      .from('recetas_lineas')
      .select('material_id, talla, cantidad, sale_a_servicio, cantidad_almacen, unidad_id, observacion')
      .eq('receta_id', recetaOrigenId);
    if (errL) throw new Error(errL.message);
    if (!lineas || lineas.length === 0) throw new Error('La receta origen no tiene líneas que duplicar');

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
    }

    // 3. Insertar líneas con la nueva receta_id
    const filas = lineas.map((l) => ({
      receta_id: recetaDestId!,
      material_id: l.material_id,
      talla: l.talla,
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

    // orden auto: el siguiente disponible para ese producto
    let orden = data.orden;
    if (orden === 0) {
      const { data: maxRow } = await sb
        .from('productos_procesos')
        .select('orden')
        .eq('producto_id', productoId)
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
    const { error } = await sb.from('productos_procesos').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}

export async function eliminarProceso(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('productos_procesos').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/recetas');
  return r;
}
