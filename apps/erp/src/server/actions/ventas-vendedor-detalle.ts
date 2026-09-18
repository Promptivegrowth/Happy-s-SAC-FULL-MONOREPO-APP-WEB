'use server';

/**
 * El detalle detrás del ranking de vendedores.
 *
 * El reporte de ventas por vendedor contestaba "quién vendió más en el mes",
 * que sirve para la comisión y para nada más. Cuando una vendedora reclama su
 * número no alcanza con el total: hace falta poder abrir el mes y ver día por
 * día, y si hace falta venta por venta, con qué comprobante y a qué cliente.
 * Eso es lo que no existía y había que sacar a mano de la base.
 *
 * Son dos cortes del mismo período: el resumen por día —para ver la curva y
 * detectar el día flojo— y la lista de ventas —para auditar un número puntual.
 * Los dos se descargan.
 */

import { createClient } from '@happy/db/server';
import { redirect } from 'next/navigation';
import { etiquetaPago } from '@happy/lib/pagos/etiqueta';
import { formatPEN } from '@happy/lib';

import type {
  FiltrosVendedorDetalle, VentasVendedorDetalle, DiaVendedor, VentaDetalleRow,
} from './ventas-vendedor-detalle-tipos';

async function sbReadonly() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as { from: (t: string) => any };
}

export async function ventasPorVendedorDetalle(
  f: FiltrosVendedorDetalle,
): Promise<VentasVendedorDetalle> {
  const sb = await sbReadonly();

  let q = sb
    .from('ventas')
    .select('id, numero, fecha, total, estado, canal, vendedor_usuario_id, nombre_cliente_rapido, clientes(razon_social, nombres, apellido_paterno)')
    // Hora de Lima explícita: si no, las ventas de la noche caen al día siguiente.
    .gte('fecha', `${f.desde}T00:00:00-05:00`)
    .lte('fecha', `${f.hasta}T23:59:59-05:00`)
    .neq('estado', 'ANULADA')
    .not('vendedor_usuario_id', 'is', null)
    .order('fecha', { ascending: false })
    .limit(20000);
  if (f.canal) q = q.eq('canal', f.canal);
  if (f.almacen_id) q = q.eq('almacen_id', f.almacen_id);
  if (f.vendedor_id) q = q.eq('vendedor_usuario_id', f.vendedor_id);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type V = {
    id: string; numero: string; fecha: string; total: number | string; canal: string;
    vendedor_usuario_id: string; nombre_cliente_rapido: string | null;
    clientes?: { razon_social?: string | null; nombres?: string | null; apellido_paterno?: string | null } | null;
  };
  const ventas = (data ?? []) as V[];
  if (ventas.length === 0) {
    return { por_dia: [], detalle: [], total_general: 0, cantidad_ventas: 0 };
  }

  const nombres = new Map<string, string>();
  const ids = [...new Set(ventas.map((v) => v.vendedor_usuario_id))];
  const { data: perfiles } = await sb.from('perfiles').select('id, nombre_completo').in('id', ids);
  for (const p of (perfiles ?? []) as Array<{ id: string; nombre_completo: string | null }>) {
    nombres.set(p.id, p.nombre_completo ?? `Usuario ${p.id.slice(0, 8)}`);
  }

  // Comprobantes y pagos de esas ventas, por lotes.
  const ventaIds = ventas.map((v) => v.id);
  const documento = new Map<string, { numero: string; tipo: string }>();
  const pagosDeVenta = new Map<string, string[]>();
  for (let i = 0; i < ventaIds.length; i += 800) {
    const lote = ventaIds.slice(i, i + 800);
    const [cp, pg] = await Promise.all([
      sb.from('comprobantes').select('venta_id, numero_completo, tipo').in('venta_id', lote),
      sb.from('ventas_pagos').select('venta_id, metodo, monto, referencia').in('venta_id', lote),
    ]);
    for (const c of (cp.data ?? []) as Array<{ venta_id: string; numero_completo: string; tipo: string }>) {
      if (c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO') continue;
      documento.set(c.venta_id, { numero: c.numero_completo, tipo: c.tipo });
    }
    for (const p of (pg.data ?? []) as Array<{ venta_id: string; metodo: string; monto: number | string; referencia: string | null }>) {
      const linea = `${etiquetaPago(p.metodo, p.referencia)} · ${formatPEN(Number(p.monto ?? 0))}`;
      const a = pagosDeVenta.get(p.venta_id);
      if (a) a.push(linea);
      else pagosDeVenta.set(p.venta_id, [linea]);
    }
  }

  /*
   * El día se toma de la fecha en hora de Lima, no en UTC.
   *
   * Una venta de las 20:30 cae al día siguiente si se corta por UTC, y el
   * reporte le pondría la venta del sábado a la vendedora del domingo.
   */
  const diaLima = (iso: string) =>
    new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

  const porDia = new Map<string, DiaVendedor>();
  let total_general = 0;

  const detalle: VentaDetalleRow[] = ventas.map((v) => {
    const monto = Number(v.total ?? 0);
    total_general += monto;

    const vendedor = nombres.get(v.vendedor_usuario_id) ?? '—';
    const fecha_dia = diaLima(v.fecha);
    const clave = `${fecha_dia}>>${v.vendedor_usuario_id}`;
    const acum = porDia.get(clave);
    if (acum) {
      acum.cantidad_ventas += 1;
      acum.total_vendido += monto;
    } else {
      porDia.set(clave, {
        fecha: fecha_dia,
        vendedor_id: v.vendedor_usuario_id,
        vendedor_nombre: vendedor,
        cantidad_ventas: 1,
        total_vendido: monto,
        ticket_promedio: 0,
      });
    }

    const c = v.clientes;
    const cliente = c?.razon_social
      ?? [c?.nombres, c?.apellido_paterno].filter(Boolean).join(' ').trim()
      ?? '';
    const doc = documento.get(v.id);

    return {
      venta_id: v.id,
      fecha: v.fecha,
      dia: fecha_dia,
      numero: v.numero,
      documento: doc?.numero ?? '—',
      tipo_documento: doc?.tipo ?? '—',
      canal: v.canal,
      cliente: cliente || v.nombre_cliente_rapido || '—',
      vendedor_id: v.vendedor_usuario_id,
      vendedor_nombre: vendedor,
      total: monto,
      pagos: (pagosDeVenta.get(v.id) ?? []).join(' + ') || '—',
    };
  });

  const por_dia = [...porDia.values()]
    .map((d) => ({ ...d, ticket_promedio: d.cantidad_ventas > 0 ? d.total_vendido / d.cantidad_ventas : 0 }))
    .sort((a, b) => (a.fecha === b.fecha
      ? b.total_vendido - a.total_vendido
      : b.fecha.localeCompare(a.fecha)));

  return { por_dia, detalle, total_general, cantidad_ventas: ventas.length };
}

/** Los vendedores que tuvieron ventas, para el filtro. */
export async function listarVendedoresLookup(): Promise<Array<{ id: string; nombre: string }>> {
  const sb = await sbReadonly();
  const { data } = await sb
    .from('perfiles')
    .select('id, nombre_completo')
    .eq('activo', true)
    .order('nombre_completo');
  return ((data ?? []) as Array<{ id: string; nombre_completo: string | null }>)
    .map((p) => ({ id: p.id, nombre: p.nombre_completo ?? `Usuario ${p.id.slice(0, 8)}` }));
}
