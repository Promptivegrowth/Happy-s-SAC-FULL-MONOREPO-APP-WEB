'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TIPOS = ['LONGITUD', 'PESO', 'VOLUMEN', 'UNIDAD', 'CONJUNTO'] as const;

const schema = z.object({
  codigo: z
    .string()
    .min(1, 'Código requerido')
    .max(20)
    .regex(/^[a-z0-9_-]+$/, 'Solo minúsculas, números y guiones (ej. "kg", "cm", "rollo50")'),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(60),
  simbolo: z.string().max(10).optional().or(z.literal('')),
  tipo: z.enum(TIPOS),
  sunat_codigo: z.string().max(10).optional().or(z.literal('')),
  factor_conversion: z.coerce.number().positive().optional().or(z.literal('')).or(z.nan()),
  unidad_base: z.string().max(20).optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

export async function crearUnidad(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string; codigo: string; nombre: string }>> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    const { data: row, error } = await sb
      .from('unidades_medida')
      .insert({
        codigo: data.codigo.trim().toLowerCase(),
        nombre: data.nombre.trim(),
        simbolo: data.simbolo?.trim() || null,
        tipo: data.tipo,
        sunat_codigo: data.sunat_codigo?.trim() || null,
        factor_conversion:
          typeof data.factor_conversion === 'number' && !Number.isNaN(data.factor_conversion)
            ? data.factor_conversion
            : null,
        unidad_base: data.unidad_base?.trim() || null,
        activo: data.activo,
      })
      .select('id, codigo, nombre')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe una unidad con ese código');
      throw new Error(error.message);
    }
    return {
      id: row.id as string,
      codigo: row.codigo as string,
      nombre: row.nombre as string,
    };
  });
  if (r.ok) await bumpPaths('/configuracion/unidades', '/materiales');
  return r;
}

export async function actualizarUnidad(
  id: string,
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    const { error } = await sb
      .from('unidades_medida')
      .update({
        codigo: data.codigo.trim().toLowerCase(),
        nombre: data.nombre.trim(),
        simbolo: data.simbolo?.trim() || null,
        tipo: data.tipo,
        sunat_codigo: data.sunat_codigo?.trim() || null,
        factor_conversion:
          typeof data.factor_conversion === 'number' && !Number.isNaN(data.factor_conversion)
            ? data.factor_conversion
            : null,
        unidad_base: data.unidad_base?.trim() || null,
        activo: data.activo,
      })
      .eq('id', id);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe otra unidad con ese código');
      throw new Error(error.message);
    }
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/unidades', '/materiales');
  return r;
}

/**
 * Eliminar unidad. Solo permitido si no la referencia ningún material.
 * Si está en uso, recomienda desactivarla en su lugar.
 */
export async function eliminarUnidad(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      sb.from('materiales').select('id', { count: 'exact', head: true }).eq('unidad_compra_id', id),
      sb.from('materiales').select('id', { count: 'exact', head: true }).eq('unidad_consumo_id', id),
    ]);
    const usos = (c1 ?? 0) + (c2 ?? 0);
    if (usos > 0) {
      throw new Error(
        `No se puede eliminar: ${usos} material${usos === 1 ? '' : 'es'} la usan. Desactivala en su lugar (toggle Activo).`,
      );
    }
    const { error } = await sb.from('unidades_medida').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/unidades');
  return r;
}

/** Toggle inline rápido del flag activo. */
export async function toggleUnidadActiva(id: string, activo: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('unidades_medida').update({ activo }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/unidades', '/materiales');
  return r;
}
