'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const schema = z.object({
  tipo_documento: z.enum(['DNI','RUC','CE','PASAPORTE']),
  numero_documento: z.string().min(8).max(20),
  tipo_cliente: z.enum(['PUBLICO_FINAL','MAYORISTA_A','MAYORISTA_B','MAYORISTA_C','INDUSTRIAL']).default('PUBLICO_FINAL'),
  razon_social: z.string().optional().or(z.literal('')),
  nombres: z.string().optional().or(z.literal('')),
  apellido_paterno: z.string().optional().or(z.literal('')),
  apellido_materno: z.string().optional().or(z.literal('')),
  nombre_comercial: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  telefono: z.string().optional().or(z.literal('')),
  telefono_secundario: z.string().optional().or(z.literal('')),
  direccion: z.string().optional().or(z.literal('')),
  ubigeo: z.string().regex(/^\d{6}$/).optional().or(z.literal('')),
  lista_precio: z.enum(['PUBLICO','MAYORISTA_A','MAYORISTA_B','MAYORISTA_C','INDUSTRIAL']).optional().or(z.literal('')),
  descuento_default: z.coerce.number().min(0).max(100).default(0),
  notas: z.string().optional().or(z.literal('')),
  activo: z.boolean().default(true),
});

function parseForm(fd: FormData) {
  return schema.parse({
    tipo_documento: fd.get('tipo_documento') || 'DNI',
    numero_documento: fd.get('numero_documento'),
    tipo_cliente: fd.get('tipo_cliente') || 'PUBLICO_FINAL',
    razon_social: fd.get('razon_social') || '',
    nombres: fd.get('nombres') || '',
    apellido_paterno: fd.get('apellido_paterno') || '',
    apellido_materno: fd.get('apellido_materno') || '',
    nombre_comercial: fd.get('nombre_comercial') || '',
    email: fd.get('email') || '',
    telefono: fd.get('telefono') || '',
    telefono_secundario: fd.get('telefono_secundario') || '',
    direccion: fd.get('direccion') || '',
    ubigeo: fd.get('ubigeo') || '',
    lista_precio: fd.get('lista_precio') || '',
    descuento_default: fd.get('descuento_default') || 0,
    notas: fd.get('notas') || '',
    activo: fd.get('activo') !== 'off',
  });
}

function clean(d: ReturnType<typeof parseForm>) {
  return {
    tipo_documento: d.tipo_documento,
    numero_documento: d.numero_documento.trim(),
    tipo_cliente: d.tipo_cliente,
    razon_social: d.razon_social || null,
    nombres: d.nombres || null,
    apellido_paterno: d.apellido_paterno || null,
    apellido_materno: d.apellido_materno || null,
    nombre_comercial: d.nombre_comercial || null,
    email: d.email || null,
    telefono: d.telefono || null,
    telefono_secundario: d.telefono_secundario || null,
    direccion: d.direccion || null,
    ubigeo: d.ubigeo || null,
    lista_precio: d.lista_precio || null,
    descuento_default: d.descuento_default,
    notas: d.notas || null,
    activo: d.activo,
  };
}

export async function crearCliente(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { data: row, error } = await sb.from('clientes').insert(clean(data)).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok) {
    await bumpPaths('/clientes');
    redirect('/clientes');
  }
  return r;
}

export async function actualizarCliente(id: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = parseForm(fd);
    const { sb } = await requireUser();
    const { error } = await sb.from('clientes').update(clean(data)).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/clientes', `/clientes/${id}`);
    redirect('/clientes');
  }
  return r;
}

export async function eliminarCliente(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('clientes').update({ activo: false }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) {
    await bumpPaths('/clientes');
    redirect('/clientes');
  }
  return r;
}
