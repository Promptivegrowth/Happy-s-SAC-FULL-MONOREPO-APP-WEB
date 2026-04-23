'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

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
