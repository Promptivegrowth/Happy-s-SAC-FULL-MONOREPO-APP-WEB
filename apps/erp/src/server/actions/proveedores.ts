'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  tipo_documento: z.enum(['DNI','RUC','CE','PASAPORTE']).default('RUC'),
  numero_documento: z.string().min(8).max(20),
  razon_social: z.string().min(2).max(200),
  nombre_comercial: z.string().optional().or(z.literal('')),
  direccion: z.string().optional().or(z.literal('')),
  ubigeo: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  contacto_nombre: z.string().optional().or(z.literal('')),
  contacto_telefono: z.string().optional().or(z.literal('')),
  dias_pago_default: z.coerce.number().int().min(0).default(0),
  moneda: z.enum(['PEN','USD']).default('PEN'),
  es_importacion: z.boolean().default(false),
  notas: z.string().optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return schema.parse({
    tipo_documento: fd.get('tipo_documento') || 'RUC',
    numero_documento: fd.get('numero_documento'),
    razon_social: fd.get('razon_social'),
    nombre_comercial: fd.get('nombre_comercial') || '',
    direccion: fd.get('direccion') || '',
    ubigeo: fd.get('ubigeo') || '',
    telefono: fd.get('telefono') || '',
    email: fd.get('email') || '',
    contacto_nombre: fd.get('contacto_nombre') || '',
    contacto_telefono: fd.get('contacto_telefono') || '',
    dias_pago_default: fd.get('dias_pago_default') || 0,
    moneda: fd.get('moneda') || 'PEN',
    es_importacion: fd.get('es_importacion') === 'on',
    notas: fd.get('notas') || '',
    activo: fd.get('activo') !== 'off',
  });
}

function clean(d: ReturnType<typeof parseForm>) {
  return {
    tipo_documento: d.tipo_documento,
    numero_documento: d.numero_documento.trim(),
    razon_social: d.razon_social.trim(),
    nombre_comercial: d.nombre_comercial || null,
    direccion: d.direccion || null,
    ubigeo: d.ubigeo || null,
    telefono: d.telefono || null,
    email: d.email || null,
    contacto_nombre: d.contacto_nombre || null,
    contacto_telefono: d.contacto_telefono || null,
    dias_pago_default: d.dias_pago_default,
    moneda: d.moneda,
    es_importacion: d.es_importacion,
    tipo_suministro: ['TELA','AVIOS','INSUMO'],
    notas: d.notas || null,
    activo: d.activo,
  };
}

export async function crearProveedor(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { data: row, error } = await sb.from('proveedores').insert(clean(data)).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok) { await bumpPaths('/proveedores'); redirect('/proveedores'); }
  return r;
}

export async function actualizarProveedor(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('proveedores').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) { await bumpPaths('/proveedores', `/proveedores/${id}`); redirect('/proveedores'); }
  return r;
}

export async function eliminarProveedor(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('proveedores').update({ activo: false }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) { await bumpPaths('/proveedores'); redirect('/proveedores'); }
  return r;
}
