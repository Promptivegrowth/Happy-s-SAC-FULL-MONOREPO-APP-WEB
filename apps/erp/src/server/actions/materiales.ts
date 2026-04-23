'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  codigo: z.string().min(1).max(40),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().optional().or(z.literal('')),
  categoria: z.enum(['TELA','AVIO','INSUMO','EMPAQUE']),
  sub_categoria: z.string().optional().or(z.literal('')),
  color_nombre: z.string().optional().or(z.literal('')),
  unidad_compra_id: z.string().uuid().optional().or(z.literal('')),
  unidad_consumo_id: z.string().uuid().optional().or(z.literal('')),
  factor_conversion: z.coerce.number().min(0).default(1),
  precio_unitario: z.coerce.number().min(0).default(0),
  precio_incluye_igv: z.boolean().default(true),
  stock_minimo: z.coerce.number().min(0).default(0),
  es_importado: z.boolean().default(false),
  requiere_lote: z.boolean().default(false),
  proveedor_preferido_id: z.string().uuid().optional().or(z.literal('')),
  notas: z.string().optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return schema.parse({
    codigo: fd.get('codigo'),
    nombre: fd.get('nombre'),
    descripcion: fd.get('descripcion') || '',
    categoria: fd.get('categoria') || 'INSUMO',
    sub_categoria: fd.get('sub_categoria') || '',
    color_nombre: fd.get('color_nombre') || '',
    unidad_compra_id: fd.get('unidad_compra_id') || '',
    unidad_consumo_id: fd.get('unidad_consumo_id') || '',
    factor_conversion: fd.get('factor_conversion') || 1,
    precio_unitario: fd.get('precio_unitario') || 0,
    precio_incluye_igv: fd.get('precio_incluye_igv') === 'on',
    stock_minimo: fd.get('stock_minimo') || 0,
    es_importado: fd.get('es_importado') === 'on',
    requiere_lote: fd.get('requiere_lote') === 'on',
    proveedor_preferido_id: fd.get('proveedor_preferido_id') || '',
    notas: fd.get('notas') || '',
    activo: fd.get('activo') !== 'off',
  });
}

function clean(d: ReturnType<typeof parseForm>) {
  return {
    codigo: d.codigo.trim().toUpperCase(),
    nombre: d.nombre.trim(),
    descripcion: d.descripcion || null,
    categoria: d.categoria,
    sub_categoria: d.sub_categoria || null,
    color_nombre: d.color_nombre || null,
    unidad_compra_id: d.unidad_compra_id || null,
    unidad_consumo_id: d.unidad_consumo_id || d.unidad_compra_id || null,
    factor_conversion: d.factor_conversion,
    precio_unitario: d.precio_unitario,
    precio_incluye_igv: d.precio_incluye_igv,
    stock_minimo: d.stock_minimo,
    es_importado: d.es_importado,
    requiere_lote: d.requiere_lote,
    proveedor_preferido_id: d.proveedor_preferido_id || null,
    notas: d.notas || null,
    activo: d.activo,
  };
}

export async function crearMaterial(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { data: row, error } = await sb.from('materiales').insert(clean(data)).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok) {
    await bumpPaths('/materiales');
    redirect('/materiales');
  }
  return r;
}

export async function actualizarMaterial(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('materiales').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/materiales', `/materiales/${id}`);
    redirect('/materiales');
  }
  return r;
}

export async function eliminarMaterial(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('materiales').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/materiales');
    redirect('/materiales');
  }
  return r;
}
