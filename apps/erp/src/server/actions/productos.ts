'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const productoSchema = z.object({
  // Opcional: si está vacío, el server lo autogenera como <CAT_CODIGO>-<NNNN>
  // (o PROD-NNNN si no hay categoría asignada).
  codigo: z.string().max(40).optional().or(z.literal('')),
  nombre: z.string().min(2).max(150),
  descripcion: z.string().optional().or(z.literal('')),
  categoria_id: z.string().uuid().optional().or(z.literal('')),
  campana_id: z.string().uuid().optional().or(z.literal('')),
  es_conjunto: z.boolean().default(true),
  piezas_descripcion: z.string().optional().or(z.literal('')),
  genero: z.enum(['MUJER','HOMBRE','UNISEX','NINO','NINA']).optional().or(z.literal('')),
  destacado: z.boolean().default(false),
  imagen_principal_url: z.string().url().optional().or(z.literal('')),
  version_ficha: z.string().default('v1.0'),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return productoSchema.parse({
    codigo: fd.get('codigo') || '',
    nombre: fd.get('nombre'),
    descripcion: fd.get('descripcion') || '',
    categoria_id: fd.get('categoria_id') || '',
    campana_id: fd.get('campana_id') || '',
    es_conjunto: fd.get('es_conjunto') === 'on',
    piezas_descripcion: fd.get('piezas_descripcion') || '',
    genero: fd.get('genero') || '',
    destacado: fd.get('destacado') === 'on',
    imagen_principal_url: fd.get('imagen_principal_url') || '',
    version_ficha: fd.get('version_ficha') || 'v1.0',
    activo: fd.get('activo') === 'on',
  });
}

function clean(data: ReturnType<typeof parseForm>) {
  return {
    codigo: (data.codigo ?? '').trim().toUpperCase(),
    nombre: data.nombre.trim(),
    descripcion: data.descripcion || null,
    categoria_id: data.categoria_id || null,
    campana_id: data.campana_id || null,
    es_conjunto: data.es_conjunto,
    piezas_descripcion: data.piezas_descripcion || null,
    genero: data.genero || null,
    destacado: data.destacado,
    imagen_principal_url: data.imagen_principal_url || null,
    version_ficha: data.version_ficha,
    activo: data.activo,
  };
}

/**
 * Autogenera código de producto desde la categoría: `<CAT_CODIGO>-<NNNN>`.
 * Ej: HALLOWEEN-0001, DANZAS-0023. Si no hay categoría, usa PROD-NNNN.
 * Usa next_correlativo (SECURITY DEFINER) para garantizar unicidad atómica.
 */
async function autogenerarCodigoProducto(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  categoriaId: string | null,
): Promise<string> {
  let prefix = 'PROD';
  if (categoriaId) {
    const { data: cat } = await sb
      .from('categorias')
      .select('codigo')
      .eq('id', categoriaId)
      .maybeSingle();
    if (cat?.codigo) prefix = cat.codigo.trim().toUpperCase();
  }
  const { data: nro, error } = await sb.rpc('next_correlativo', { p_clave: `PROD_${prefix}`, p_padding: 4 });
  if (error) throw new Error(error.message);
  return `${prefix}-${nro}`;
}

export async function crearProducto(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();

    // Si el código está vacío, autogenerar desde la categoría (CAT-NNNN).
    const cleaned = clean(data);
    if (!cleaned.codigo) {
      cleaned.codigo = await autogenerarCodigoProducto(sb, cleaned.categoria_id);
    }

    const { data: row, error } = await sb.from('productos').insert(cleaned).select('id').single();
    if (error) throw new Error(error.message);

    // Crear receta v1.0 vacía y la entrada de publicación
    await sb.from('recetas').insert({ producto_id: row.id, version: 'v1.0', activa: true });
    await sb.from('productos_publicacion').insert({
      producto_id: row.id,
      publicado: false,
      slug: data.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      titulo_web: data.nombre,
    });
    return { id: row.id };
  });
  if (r.ok && r.data) {
    await bumpPaths('/productos');
    redirect(`/productos/${r.data.id}`);
  }
  return r;
}

export async function actualizarProducto(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('productos').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/productos', `/productos/${id}`, '/web-catalogo');
  return r;
}

export async function eliminarProducto(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('productos').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/productos', '/web-catalogo');
    redirect('/productos');
  }
  return r;
}

// === Variantes (talla) ===

const varianteSchema = z.object({
  producto_id: z.string().uuid(),
  sku: z.string().min(1).max(50),
  talla: z.enum(TALLAS),
  codigo_barras: z.string().optional().or(z.literal('')),
  precio_publico: z.coerce.number().min(0),
  precio_mayorista_a: z.coerce.number().min(0).optional().or(z.literal('')),
  precio_mayorista_b: z.coerce.number().min(0).optional().or(z.literal('')),
  precio_mayorista_c: z.coerce.number().min(0).optional().or(z.literal('')),
  precio_costo_estandar: z.coerce.number().min(0).optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

export async function crearVariante(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = varianteSchema.parse({
      producto_id: fd.get('producto_id'),
      sku: fd.get('sku'),
      talla: fd.get('talla'),
      codigo_barras: fd.get('codigo_barras') || '',
      precio_publico: fd.get('precio_publico') || 0,
      precio_mayorista_a: fd.get('precio_mayorista_a') || '',
      precio_mayorista_b: fd.get('precio_mayorista_b') || '',
      precio_mayorista_c: fd.get('precio_mayorista_c') || '',
      precio_costo_estandar: fd.get('precio_costo_estandar') || '',
      activo: fd.get('activo') !== 'off',
    });
    const { sb } = await requireUser();
    const payload = {
      ...data,
      codigo_barras: data.codigo_barras || null,
      precio_mayorista_a: data.precio_mayorista_a === '' ? null : Number(data.precio_mayorista_a),
      precio_mayorista_b: data.precio_mayorista_b === '' ? null : Number(data.precio_mayorista_b),
      precio_mayorista_c: data.precio_mayorista_c === '' ? null : Number(data.precio_mayorista_c),
      precio_costo_estandar: data.precio_costo_estandar === '' ? null : Number(data.precio_costo_estandar),
    };
    const { error } = await sb.from('productos_variantes').insert(payload);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/productos/${fd.get('producto_id')}`);
  return r;
}

export async function eliminarVariante(varianteId: string, productoId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('productos_variantes').delete().eq('id', varianteId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/productos/${productoId}`);
  return r;
}

// === Publicación web ===

export async function togglePublicacionWeb(productoId: string, publicado: boolean): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    const { error } = await sb.from('productos_publicacion').upsert({
      producto_id: productoId,
      publicado,
      publicado_por: publicado ? userId : null,
      publicado_en: publicado ? new Date().toISOString() : null,
    }, { onConflict: 'producto_id' });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/web-catalogo', `/productos/${productoId}`);
  return r;
}

const publicacionSchema = z.object({
  titulo_web: z.string().optional().or(z.literal('')),
  descripcion_corta: z.string().optional().or(z.literal('')),
  descripcion_larga: z.string().optional().or(z.literal('')),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones').optional().or(z.literal('')),
  destacado_web: z.boolean().default(false),
  orden_web: z.coerce.number().int().min(0).default(100),
  precio_oferta: z.coerce.number().min(0).optional().or(z.literal('')),
});

export async function actualizarPublicacion(productoId: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = publicacionSchema.parse({
      titulo_web: fd.get('titulo_web') || '',
      descripcion_corta: fd.get('descripcion_corta') || '',
      descripcion_larga: fd.get('descripcion_larga') || '',
      slug: fd.get('slug') || '',
      destacado_web: fd.get('destacado_web') === 'on',
      orden_web: fd.get('orden_web') || 100,
      precio_oferta: fd.get('precio_oferta') || '',
    });
    const { sb } = await requireUser();
    const { error } = await sb.from('productos_publicacion').upsert({
      producto_id: productoId,
      titulo_web: data.titulo_web || null,
      descripcion_corta: data.descripcion_corta || null,
      descripcion_larga: data.descripcion_larga || null,
      slug: data.slug || null,
      destacado_web: data.destacado_web,
      orden_web: data.orden_web,
      precio_oferta: data.precio_oferta === '' ? null : Number(data.precio_oferta),
    }, { onConflict: 'producto_id' });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths('/web-catalogo', `/productos/${productoId}`);
  return r;
}
