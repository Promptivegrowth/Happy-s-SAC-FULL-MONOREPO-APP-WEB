'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  codigo: z.string().min(1, 'Código requerido').max(20),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(100),
  descripcion: z.string().optional().or(z.literal('')),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones').optional().or(z.literal('')),
  icono: z.string().optional().or(z.literal('')),
  publicar_en_web: z.boolean().default(true),
  orden_web: z.coerce.number().int().min(0).default(100),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return schema.parse({
    codigo: fd.get('codigo'),
    nombre: fd.get('nombre'),
    descripcion: fd.get('descripcion') || '',
    slug: fd.get('slug') || '',
    icono: fd.get('icono') || '',
    publicar_en_web: fd.get('publicar_en_web') === 'on',
    orden_web: fd.get('orden_web') || 100,
    activo: fd.get('activo') === 'on',
  });
}

export async function crearCategoria(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { data: row, error } = await sb.from('categorias').insert({
      ...data,
      slug: data.slug || data.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      descripcion: data.descripcion || null,
      icono: data.icono || null,
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok) {
    await bumpPaths('/categorias', '/web-catalogo');
    redirect('/categorias');
  }
  return r;
}

export async function actualizarCategoria(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('categorias').update({
      ...data,
      slug: data.slug || data.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      descripcion: data.descripcion || null,
      icono: data.icono || null,
    }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/categorias', `/categorias/${id}`, '/web-catalogo');
    redirect('/categorias');
  }
  return r;
}

/**
 * Toggle inline rápido para activar/desactivar una categoría.
 * Cuando se desactiva, los productos de la categoría dejan de aparecer en la web
 * (la web filtra por categorias.activo en loadPublicaciones / categoria/[slug]).
 * No toca productos_publicacion.publicado, así al reactivar la categoría todos
 * vuelven a aparecer sin tener que re-publicar uno por uno.
 */
export async function toggleCategoriaActivo(id: string, activo: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('categorias').update({ activo }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo');
  return r;
}

/**
 * Acción masiva: publica TODOS los productos activos de una categoría.
 * Hace upsert en productos_publicacion con publicado=true para cada uno.
 * Retorna el número de productos efectivamente publicados (excluye los que ya estaban).
 */
export async function publicarTodosCategoria(categoriaId: string): Promise<ActionResult<{ afectados: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();

    // Traer todos los productos activos de la categoría
    const { data: prods, error: errProds } = await sb
      .from('productos')
      .select('id')
      .eq('categoria_id', categoriaId)
      .eq('activo', true);
    if (errProds) throw new Error(errProds.message);
    if (!prods || prods.length === 0) return { afectados: 0 };

    const ahora = new Date().toISOString();
    const filas = prods.map((p) => ({
      producto_id: p.id,
      publicado: true,
      publicado_por: userId,
      publicado_en: ahora,
    }));

    // Upsert por producto_id (PK de productos_publicacion). El trigger
    // tg_publicacion_set_slug se encarga de generar slug si falta.
    const { error } = await sb
      .from('productos_publicacion')
      .upsert(filas, { onConflict: 'producto_id' });
    if (error) throw new Error(error.message);

    return { afectados: prods.length };
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo', '/productos');
  return r;
}

/** Despublica TODOS los productos de una categoría (publicado=false). */
export async function despublicarTodosCategoria(categoriaId: string): Promise<ActionResult<{ afectados: number }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { data: prods, error: errProds } = await sb
      .from('productos')
      .select('id')
      .eq('categoria_id', categoriaId);
    if (errProds) throw new Error(errProds.message);
    if (!prods || prods.length === 0) return { afectados: 0 };

    const { error } = await sb
      .from('productos_publicacion')
      .update({ publicado: false })
      .in('producto_id', prods.map((p) => p.id));
    if (error) throw new Error(error.message);
    return { afectados: prods.length };
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo', '/productos');
  return r;
}

export async function eliminarCategoria(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('categorias').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/categorias', '/web-catalogo');
  return r;
}
