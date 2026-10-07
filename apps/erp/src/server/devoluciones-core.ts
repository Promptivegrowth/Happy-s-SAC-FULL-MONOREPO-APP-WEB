/**
 * Devoluciones y cambios, para revisarlos desde el ERP.
 *
 * Pedido del cliente (06/10/2026): desde otro punto no tenía cómo comprobar que
 * una salida de caja de "S/ 65" fuera de verdad una devolución, que la prenda
 * hubiera vuelto al almacén, ni de qué cuenta se devolvió el dinero. Acá está
 * cada una con lo que la respalda:
 *   · la prenda: unidades devueltas y unidades que entraron al stock (kardex);
 *   · el dinero: monto, medio y cuenta, y si la salida quedó registrada en la
 *     caja (la registra el sistema y no se puede borrar);
 *   · en un cambio, la venta nueva que se pagó con lo ya cobrado.
 */

import { medioDeDevolucion } from '@happy/lib/pagos/etiqueta';
import { formatTallaChip } from '@happy/lib';

export type DevolucionErp = {
  id: string;
  numero: string;
  fecha: string;
  tipo: 'DEVOLUCION' | 'CAMBIO' | string;
  tienda: string;
  atendido_por: string;
  venta_original: string | null;
  motivo: string;
  prendas: string;
  unidades: number;
  /** Unidades que entraron al stock por esta devolución (kardex). */
  unidades_reingresadas: number;
  almacen_reingreso: string | null;
  monto_devuelto: number;
  /** "Efectivo", "INTERBANK JAVIER", "Saldo a favor", o null si no salió dinero. */
  medio: string | null;
  /** La salida de dinero quedó en la caja del turno (automática, no se borra). */
  salida_en_caja: boolean;
  /** En un cambio: la venta que se pagó con lo ya cobrado. */
  venta_nueva: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export async function listarDevolucionesErp(
  sb: Sb,
  f: { desde: string | null; hasta: string | null; q: string; desdeFila: number; hastaFila: number },
): Promise<{ filas: DevolucionErp[]; total: number }> {
  let q = sb
    .from('devoluciones')
    .select(
      'id, numero, fecha, tipo, motivo, monto_devuelto, metodo_devolucion, cuenta_devolucion, atendido_por, ' +
        'ventas:venta_id(numero), almacenes:almacen_id(nombre)',
      { count: 'exact' },
    )
    .order('fecha', { ascending: false });
  if (f.desde) q = q.gte('fecha', f.desde);
  if (f.hasta) q = q.lt('fecha', f.hasta);
  if (f.q) q = q.or(`numero.ilike.%${f.q}%,motivo.ilike.%${f.q}%`);
  const { data, count, error } = await q.range(f.desdeFila, f.hastaFila);
  if (error) throw new Error(error.message);

  type D = {
    id: string; numero: string; fecha: string; tipo: string; motivo: string | null;
    monto_devuelto: number | string | null; metodo_devolucion: string | null; cuenta_devolucion: string | null;
    atendido_por: string | null; ventas: { numero: string } | null; almacenes: { nombre: string } | null;
  };
  const devs = (data ?? []) as D[];
  if (devs.length === 0) return { filas: [], total: count ?? 0 };
  const ids = devs.map((d) => d.id);

  const [lineas, kardex, caja, nuevas, perfiles] = await Promise.all([
    sb.from('devoluciones_lineas')
      .select('devolucion_id, cantidad, productos_variantes:variante_id(talla, productos:producto_id(nombre))')
      .in('devolucion_id', ids),
    sb.from('kardex_movimientos')
      .select('referencia_id, cantidad, almacenes:almacen_id(nombre)')
      .eq('tipo', 'ENTRADA_DEVOLUCION_CLIENTE')
      .in('referencia_id', ids),
    sb.from('caja_chica_movimientos').select('devolucion_id').in('devolucion_id', ids),
    sb.from('ventas_pagos')
      .select('referencia, ventas:venta_id(numero)')
      .in('referencia', devs.map((d) => `Aplicado de devolución ${d.numero}`)),
    sb.from('perfiles').select('id, nombre_completo')
      .in('id', [...new Set(devs.map((d) => d.atendido_por).filter(Boolean))] as string[]),
  ]);

  const prendas = new Map<string, string[]>();
  const unidades = new Map<string, number>();
  for (const l of (lineas.data ?? []) as Array<{ devolucion_id: string; cantidad: number | string; productos_variantes: { talla: string | null; productos: { nombre: string } | null } | null }>) {
    const n = Number(l.cantidad ?? 0);
    const v = l.productos_variantes;
    prendas.set(l.devolucion_id, [
      ...(prendas.get(l.devolucion_id) ?? []),
      `${n}× ${v?.productos?.nombre ?? 'Producto'}${v?.talla ? ` ${formatTallaChip(v.talla)}` : ''}`,
    ]);
    unidades.set(l.devolucion_id, (unidades.get(l.devolucion_id) ?? 0) + n);
  }
  const reingreso = new Map<string, { und: number; almacen: string | null }>();
  for (const k of (kardex.data ?? []) as Array<{ referencia_id: string; cantidad: number | string; almacenes: { nombre: string } | null }>) {
    const r = reingreso.get(k.referencia_id) ?? { und: 0, almacen: k.almacenes?.nombre ?? null };
    r.und += Number(k.cantidad ?? 0);
    reingreso.set(k.referencia_id, r);
  }
  const conSalida = new Set(((caja.data ?? []) as Array<{ devolucion_id: string }>).map((m) => m.devolucion_id));
  const ventaNueva = new Map<string, string>();
  for (const p of (nuevas.data ?? []) as Array<{ referencia: string; ventas: { numero: string } | null }>) {
    if (p.ventas?.numero) ventaNueva.set(p.referencia.replace('Aplicado de devolución ', ''), p.ventas.numero);
  }
  const nombre = new Map(((perfiles.data ?? []) as Array<{ id: string; nombre_completo: string | null }>).map((p) => [p.id, p.nombre_completo ?? '—']));

  const filas = devs.map((d): DevolucionErp => {
    const monto = Number(d.monto_devuelto ?? 0);
    const metodo = (d.metodo_devolucion ?? '').toUpperCase();
    return {
      id: d.id,
      numero: d.numero,
      fecha: d.fecha,
      tipo: d.tipo,
      tienda: d.almacenes?.nombre ?? '—',
      atendido_por: d.atendido_por ? (nombre.get(d.atendido_por) ?? '—') : '—',
      venta_original: d.ventas?.numero ?? null,
      motivo: d.motivo ?? '',
      prendas: (prendas.get(d.id) ?? []).join(', ') || '—',
      unidades: unidades.get(d.id) ?? 0,
      unidades_reingresadas: reingreso.get(d.id)?.und ?? 0,
      almacen_reingreso: reingreso.get(d.id)?.almacen ?? null,
      monto_devuelto: monto,
      medio: monto > 0
        ? (metodo === 'CREDITO' ? 'Saldo a favor' : medioDeDevolucion(metodo, d.cuenta_devolucion))
        : null,
      salida_en_caja: conSalida.has(d.id),
      venta_nueva: ventaNueva.get(d.numero) ?? null,
    };
  });
  return { filas, total: count ?? filas.length };
}
