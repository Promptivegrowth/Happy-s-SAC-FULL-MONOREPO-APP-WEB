'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

// ============================================================================
// HISTORIAL DE COMPRAS DE UN CLIENTE
// ============================================================================
export type CompraClienteRow = {
  venta_id: string;
  numero: string;
  fecha: string;
  canal: string;
  total: number;
  estado: string;
  almacen: string | null;
  vendedor: string | null;
  metodos: string[];
  comprobante: { tipo: string; numero_completo: string } | null;
  cantidad_items: number;
};

export type HistorialCliente = {
  rows: CompraClienteRow[];
  metricas: {
    total_compras: number;
    monto_total: number;
    ticket_promedio: number;
    primera_compra: string | null;
    ultima_compra: string | null;
  };
};

export async function obtenerHistorialCliente(clienteId: string): Promise<HistorialCliente> {
  const sb = await createClient();

  const { data: ventas } = await sb
    .from('ventas')
    .select(
      'id, numero, fecha, canal, total, estado, almacen:almacen_id(codigo, nombre), vendedor_usuario_id',
    )
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
    .limit(500);

  type VR = {
    id: string;
    numero: string;
    fecha: string;
    canal: string;
    total: string | number;
    estado: string;
    almacen: { codigo: string; nombre: string } | null;
    vendedor_usuario_id: string | null;
  };
  const filas = (ventas ?? []) as unknown as VR[];
  const ids = filas.map((v) => v.id);

  // Pagos, comprobantes, items_count, vendedor nombre en paralelo
  const [pagosRes, compRes, itemsRes, vendRes] = await Promise.all([
    ids.length
      ? sb.from('ventas_pagos').select('venta_id, metodo').in('venta_id', ids)
      : Promise.resolve({ data: [] }),
    ids.length
      ? sb
          .from('comprobantes')
          .select('venta_id, tipo, numero_completo')
          .in('venta_id', ids)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    ids.length
      ? sb.from('ventas_lineas').select('venta_id, cantidad').in('venta_id', ids)
      : Promise.resolve({ data: [] }),
    (async () => {
      const vendIds = Array.from(new Set(filas.map((v) => v.vendedor_usuario_id).filter(Boolean) as string[]));
      if (vendIds.length === 0) return { data: [] };
      return sb.from('perfiles').select('id, nombre_completo').in('id', vendIds);
    })(),
  ]);

  const pagosMap = new Map<string, string[]>();
  for (const p of (pagosRes.data ?? []) as { venta_id: string; metodo: string }[]) {
    const a = pagosMap.get(p.venta_id) ?? [];
    a.push(p.metodo);
    pagosMap.set(p.venta_id, a);
  }
  const compMap = new Map<string, { tipo: string; numero_completo: string }>();
  for (const c of (compRes.data ?? []) as { venta_id: string; tipo: string; numero_completo: string }[]) {
    if (!compMap.has(c.venta_id)) compMap.set(c.venta_id, { tipo: c.tipo, numero_completo: c.numero_completo });
  }
  const itemsMap = new Map<string, number>();
  for (const l of (itemsRes.data ?? []) as { venta_id: string; cantidad: number | string }[]) {
    itemsMap.set(l.venta_id, (itemsMap.get(l.venta_id) ?? 0) + Number(l.cantidad));
  }
  const vendMap = new Map<string, string>();
  for (const v of (vendRes.data ?? []) as { id: string; nombre_completo: string | null }[]) {
    if (v.nombre_completo) vendMap.set(v.id, v.nombre_completo);
  }

  const rows: CompraClienteRow[] = filas.map((v) => ({
    venta_id: v.id,
    numero: v.numero,
    fecha: v.fecha,
    canal: v.canal,
    total: Number(v.total ?? 0),
    estado: v.estado,
    almacen: v.almacen ? `${v.almacen.codigo} · ${v.almacen.nombre}` : null,
    vendedor: v.vendedor_usuario_id ? vendMap.get(v.vendedor_usuario_id) ?? null : null,
    metodos: Array.from(new Set(pagosMap.get(v.id) ?? [])),
    comprobante: compMap.get(v.id) ?? null,
    cantidad_items: itemsMap.get(v.id) ?? 0,
  }));

  const completadas = rows.filter((r) => r.estado !== 'ANULADA');
  const monto_total = completadas.reduce((s, r) => s + r.total, 0);

  return {
    rows,
    metricas: {
      total_compras: completadas.length,
      monto_total,
      ticket_promedio: completadas.length ? monto_total / completadas.length : 0,
      primera_compra: rows.length ? rows[rows.length - 1]!.fecha : null,
      ultima_compra: rows.length ? rows[0]!.fecha : null,
    },
  };
}

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
