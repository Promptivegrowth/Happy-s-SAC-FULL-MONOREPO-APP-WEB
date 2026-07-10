'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * CRUD del catálogo de pasos operativos por área.
 *
 * Tabla creada en migración 61. La lista inicial vino del Excel del cliente
 * (2026-07-10). Ahora es editable desde /configuracion/catalogo-procesos y
 * alimenta el dropdown "Paso operativo" del editor de recetas.
 *
 * Reglas:
 *  - No se puede duplicar (area_id + nombre único).
 *  - No se puede eliminar un paso que ya esté referenciado en un
 *    productos_procesos.descripcion_operativa vigente — desactivá con el
 *    toggle en su lugar.
 *  - Los inactivos NO aparecen en el dropdown del editor pero siguen
 *    existiendo para no perder la data histórica ni bloquear reportes.
 */

const schema = z.object({
  area_id: z.string().uuid('area_id inválido'),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(120, 'Máximo 120 caracteres'),
  orden: z.coerce.number().int().min(0).default(0),
  activo: z.boolean().default(true),
});

export async function crearPasoCatalogo(
  input: z.input<typeof schema>,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny
      .from('catalogo_pasos_operativos')
      .insert({
        area_id: data.area_id,
        nombre: data.nombre.trim(),
        orden: data.orden,
        activo: data.activo,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe un paso con ese nombre en esa área');
      throw new Error(error.message);
    }
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths('/configuracion/catalogo-procesos', '/recetas');
  return r;
}

export async function actualizarPasoCatalogo(
  id: string,
  input: z.input<typeof schema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = schema.parse(input);
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny
      .from('catalogo_pasos_operativos')
      .update({
        area_id: data.area_id,
        nombre: data.nombre.trim(),
        orden: data.orden,
        activo: data.activo,
      })
      .eq('id', id);
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe otro paso con ese nombre en esa área');
      throw new Error(error.message);
    }
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/catalogo-procesos', '/recetas');
  return r;
}

/**
 * Elimina un paso del catálogo. Solo permitido si NINGÚN productos_procesos
 * vigente lo referencia por descripcion_operativa. Si está en uso, sugerir
 * desactivar con el toggle.
 */
export async function eliminarPasoCatalogo(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    // Traer nombre + area para saber si está en uso.
    const { data: paso, error: errPaso } = await sbAny
      .from('catalogo_pasos_operativos')
      .select('nombre, area_id')
      .eq('id', id)
      .single();
    if (errPaso) throw new Error(errPaso.message);
    const { count } = await sbAny
      .from('productos_procesos')
      .select('id', { count: 'exact', head: true })
      .eq('area_id', paso.area_id)
      .eq('descripcion_operativa', paso.nombre)
      .eq('activo', true);
    if ((count ?? 0) > 0) {
      throw new Error(
        `No se puede eliminar: ${count} operación(es) en recetas usan este paso. Desactivalo con el toggle.`,
      );
    }
    const { error } = await sbAny.from('catalogo_pasos_operativos').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/catalogo-procesos', '/recetas');
  return r;
}

export async function togglePasoCatalogoActivo(id: string, activo: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny
      .from('catalogo_pasos_operativos')
      .update({ activo })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/configuracion/catalogo-procesos', '/recetas');
  return r;
}
