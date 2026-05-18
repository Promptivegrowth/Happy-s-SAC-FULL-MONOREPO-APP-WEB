'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  codigo: z
    .string()
    .min(1, 'Código requerido')
    .max(20)
    .regex(/^[A-Z0-9_]+$/, 'Solo mayúsculas, números y guion bajo (ej. CORTE, TALLER, OJAL_BOTON)'),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(60),
  valor_minuto: z.coerce.number().min(0, 'Debe ser ≥ 0').optional().or(z.nan()),
  activa: z.boolean().default(true),
});

export async function crearArea(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string; codigo: string; nombre: string; valor_minuto: number | null }>> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    const valor =
      typeof data.valor_minuto === 'number' && !Number.isNaN(data.valor_minuto)
        ? data.valor_minuto
        : undefined;
    const { data: row, error } = await sb
      .from('areas_produccion')
      .insert({
        codigo: data.codigo.trim().toUpperCase(),
        nombre: data.nombre.trim(),
        valor_minuto: valor,
        activa: data.activa,
      })
      .select('id, codigo, nombre, valor_minuto')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe un área con ese código');
      throw new Error(error.message);
    }
    return {
      id: row.id as string,
      codigo: row.codigo as string,
      nombre: row.nombre as string,
      valor_minuto: row.valor_minuto as number | null,
    };
  });
  if (r.ok) await bumpPaths('/configuracion/areas', '/recetas');
  return r;
}

export async function actualizarArea(id: string, input: z.input<typeof schema>): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    const valor =
      typeof data.valor_minuto === 'number' && !Number.isNaN(data.valor_minuto)
        ? data.valor_minuto
        : undefined;
    const { error } = await sb
      .from('areas_produccion')
      .update({
        codigo: data.codigo.trim().toUpperCase(),
        nombre: data.nombre.trim(),
        valor_minuto: valor,
        activa: data.activa,
      })
      .eq('id', id);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe otra área con ese código');
      throw new Error(error.message);
    }
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/areas', '/recetas');
  return r;
}

/**
 * Eliminar área. Solo permitido si no la referencia ningún proceso activo.
 * Si está en uso, recomienda desactivarla en su lugar.
 */
export async function eliminarArea(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { count } = await sbAny
      .from('productos_procesos')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', id)
      .eq('activo', true); // solo bloquea eliminar si hay procesos VIGENTES
    if ((count ?? 0) > 0) {
      throw new Error(
        `No se puede eliminar: ${count} proceso(s) la usan. Desactivala con el toggle en su lugar.`,
      );
    }
    const { error } = await sb.from('areas_produccion').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/areas');
  return r;
}

/** Toggle inline del flag activa. */
export async function toggleAreaActiva(id: string, activa: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('areas_produccion').update({ activa }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/areas', '/recetas');
  return r;
}
