'use server';

/**
 * El historial de cuadres de caja, para gerencia.
 *
 * El cuadre existía sólo dentro del POS: la cajera lo veía al cerrar su turno y
 * después se perdía. Desde el ERP no había forma de revisar los turnos pasados,
 * ni de reimprimir el arqueo de un día, ni de ver por qué faltaron S/ 20 el
 * martes. Los datos estaban guardados todo el tiempo —`cajas_sesiones` se
 * escribe en cada cierre— pero ninguna pantalla del ERP los leía.
 *
 * Lo que importa acá es el DESGLOSE. Un cuadre que dice "Transferencia S/ 810"
 * no sirve para conciliar: hay dos cuentas de transferencia y cada una es un
 * estado de cuenta distinto. Por eso el arqueo se arma con `arqueoPorCuenta`,
 * el mismo que usa el POS, y sale con los mismos renglones que los botones de
 * cobro. Si el papel del turno y esta pantalla no dicen lo mismo, no sirve
 * ninguno de los dos.
 */

import { createClient } from '@happy/db/server';
import { redirect } from 'next/navigation';
import { arqueoPorCuenta, etiquetaPago, type CuentaPos } from '@happy/lib/pagos/etiqueta';
import { formatPEN } from '@happy/lib';

import type {
  CuadreRow, CuadreDetalle, MovimientoCaja, VentaDelCuadre, CierreParcialRow,
} from './cuadres-caja-tipos';

async function sbReadonly() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as { from: (t: string) => any };
}

/** Los botones de cobro del POS, que son los renglones del arqueo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cuentasDelPos(sb: { from: (t: string) => any }): Promise<CuentaPos[]> {
  const { data } = await sb
    .from('cuentas_bancarias')
    .select('nombre_corto, metodo_default')
    .eq('activo', true)
    .eq('visible_pos', true)
    .order('orden');
  return (data ?? []) as CuentaPos[];
}

/** Nombres de usuario por id, en una sola consulta. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function nombresDe(sb: { from: (t: string) => any }, ids: string[]): Promise<Map<string, string>> {
  const limpios = [...new Set(ids.filter(Boolean))];
  const mapa = new Map<string, string>();
  if (limpios.length === 0) return mapa;

  const { data } = await sb.from('perfiles').select('id, nombre_completo').in('id', limpios);
  for (const p of (data ?? []) as Array<{ id: string; nombre_completo: string | null }>) {
    mapa.set(p.id, p.nombre_completo ?? `Usuario ${p.id.slice(0, 8)}`);
  }
  return mapa;
}

type PagoFila = { venta_id: string; metodo: string; monto: number | string; referencia: string | null };

export type FiltrosCuadres = { desde: string; hasta: string; caja_id?: string };

/**
 * Los turnos de caja del período, con su cuadre resuelto.
 *
 * Los totales se recalculan desde las ventas y no se leen de las columnas que
 * dejó el cierre. Son dos cosas distintas: esas columnas son la foto del
 * momento en que la cajera cerró, y un turno todavía abierto las tiene en cero.
 * Recalcular hace que la lista diga la verdad en los dos casos.
 */
export async function listarCuadres(f: FiltrosCuadres): Promise<CuadreRow[]> {
  const sb = await sbReadonly();

  /*
   * El rango se corta en hora de Lima, con el -05:00 explícito.
   *
   * Sin eso, un turno abierto un sábado a las 21:26 figura como domingo —en UTC
   * ya son las 02:26 del día siguiente— y al filtrar por el sábado no aparece.
   * En caja eso es grave: el turno de la noche es justo el que alguien quiere
   * revisar.
   */
  let q = sb
    .from('cajas_sesiones')
    .select('id, caja_id, abierta_por, abierta_en, monto_apertura, cerrada_por, cerrada_en, monto_cierre_efectivo, diferencia, observaciones')
    .gte('abierta_en', `${f.desde}T00:00:00-05:00`)
    .lte('abierta_en', `${f.hasta}T23:59:59-05:00`)
    .order('abierta_en', { ascending: false })
    .limit(500);
  if (f.caja_id) q = q.eq('caja_id', f.caja_id);

  const { data: sesiones, error } = await q;
  if (error) throw new Error(error.message);

  type Ses = {
    id: string; caja_id: string; abierta_por: string; abierta_en: string;
    monto_apertura: number | string; cerrada_por: string | null; cerrada_en: string | null;
    monto_cierre_efectivo: number | string | null; diferencia: number | string | null;
    observaciones: string | null;
  };
  const filas = (sesiones ?? []) as Ses[];
  if (filas.length === 0) return [];

  const ids = filas.map((s) => s.id);
  const [cajas, ventasRes, gastosRes, nombres] = await Promise.all([
    sb.from('cajas').select('id, nombre, almacenes(nombre)').in('id', [...new Set(filas.map((s) => s.caja_id))]),
    sb.from('ventas').select('id, caja_sesion_id, total, estado').in('caja_sesion_id', ids).limit(20000),
    sb.from('caja_chica_movimientos').select('sesion_id, tipo, monto').in('sesion_id', ids).limit(5000),
    nombresDe(sb, filas.flatMap((s) => [s.abierta_por, s.cerrada_por ?? ''])),
  ]);

  const caja = new Map<string, { nombre: string; almacen: string }>();
  for (const c of (cajas.data ?? []) as Array<{ id: string; nombre: string; almacenes?: { nombre?: string } }>) {
    caja.set(c.id, { nombre: c.nombre, almacen: c.almacenes?.nombre ?? '—' });
  }

  // Ventas por sesión, y la lista de ids para poder pedir sus pagos.
  type V = { id: string; caja_sesion_id: string; total: number | string; estado: string };
  const ventas = (ventasRes.data ?? []) as V[];
  const porSesion = new Map<string, { cantidad: number; total: number; ventaIds: string[] }>();
  for (const v of ventas) {
    if (v.estado === 'ANULADA') continue;
    const cur = porSesion.get(v.caja_sesion_id) ?? { cantidad: 0, total: 0, ventaIds: [] };
    cur.cantidad += 1;
    cur.total += Number(v.total ?? 0);
    cur.ventaIds.push(v.id);
    porSesion.set(v.caja_sesion_id, cur);
  }

  /*
   * El efectivo se saca de los pagos, no del total de la venta: una venta de
   * S/ 100 pagada mitad en efectivo y mitad en Yape aporta S/ 50 a lo que hay
   * que contar en el cajón, no S/ 100.
   */
  const idsVentas = ventas.filter((v) => v.estado !== 'ANULADA').map((v) => v.id);
  const efectivoPorSesion = new Map<string, number>();
  if (idsVentas.length > 0) {
    const sesionDeVenta = new Map(ventas.map((v) => [v.id, v.caja_sesion_id]));
    for (let i = 0; i < idsVentas.length; i += 800) {
      const { data } = await sb
        .from('ventas_pagos')
        .select('venta_id, metodo, monto')
        .in('venta_id', idsVentas.slice(i, i + 800));
      for (const p of (data ?? []) as PagoFila[]) {
        if (String(p.metodo).toUpperCase() !== 'EFECTIVO') continue;
        const ses = sesionDeVenta.get(p.venta_id);
        if (ses) efectivoPorSesion.set(ses, (efectivoPorSesion.get(ses) ?? 0) + Number(p.monto ?? 0));
      }
    }
  }

  const gastosPorSesion = new Map<string, number>();
  for (const g of (gastosRes.data ?? []) as Array<{ sesion_id: string; tipo: string; monto: number | string }>) {
    // Un ingreso de caja chica suma al cajón; un gasto lo resta.
    const signo = String(g.tipo).toUpperCase() === 'INGRESO' ? 1 : -1;
    gastosPorSesion.set(g.sesion_id, (gastosPorSesion.get(g.sesion_id) ?? 0) + signo * Number(g.monto ?? 0));
  }

  return filas.map((s) => {
    const v = porSesion.get(s.id) ?? { cantidad: 0, total: 0, ventaIds: [] };
    const efectivo = efectivoPorSesion.get(s.id) ?? 0;
    const neto = gastosPorSesion.get(s.id) ?? 0;
    const apertura = Number(s.monto_apertura ?? 0);
    const esperado = apertura + efectivo + neto;
    const contado = s.cerrada_en ? Number(s.monto_cierre_efectivo ?? 0) : null;

    return {
      id: s.id,
      caja_nombre: caja.get(s.caja_id)?.nombre ?? '—',
      almacen_nombre: caja.get(s.caja_id)?.almacen ?? '—',
      abierta_en: s.abierta_en,
      cerrada_en: s.cerrada_en,
      abierta_por: nombres.get(s.abierta_por) ?? '—',
      cerrada_por: s.cerrada_por ? (nombres.get(s.cerrada_por) ?? '—') : null,
      monto_apertura: apertura,
      cantidad_ventas: v.cantidad,
      total_vendido: v.total,
      total_efectivo: efectivo,
      total_gastos: neto,
      efectivo_esperado: esperado,
      efectivo_contado: contado,
      diferencia: contado === null ? null : contado - esperado,
      observaciones: s.observaciones,
      abierta: !s.cerrada_en,
    };
  });
}

/**
 * Todo el detalle de un turno: el documento que se imprime.
 *
 * Incluye el arqueo por cuenta, los movimientos de caja chica, las ventas una
 * por una y los cambios de turno. Es lo que hace falta para responder "¿por qué
 * este cuadre no cierra?" sin tener que ir a la tienda a preguntar.
 */
export async function detalleCuadre(sesionId: string): Promise<CuadreDetalle | null> {
  const sb = await sbReadonly();

  const { data: ses } = await sb
    .from('cajas_sesiones')
    .select('id, caja_id, abierta_en')
    .eq('id', sesionId)
    .maybeSingle();
  if (!ses) return null;

  // El día de Lima de ese turno, para que `listarCuadres` lo encuentre.
  const abiertaEn = String((ses as { abierta_en: string }).abierta_en);
  const diaLima = new Date(new Date(abiertaEn).getTime() - 5 * 3600 * 1000)
    .toISOString().slice(0, 10);

  const cabeceras = await listarCuadres({
    desde: diaLima,
    hasta: diaLima,
    caja_id: (ses as { caja_id: string }).caja_id,
  });
  const cabecera = cabeceras.find((c) => c.id === sesionId);
  if (!cabecera) return null;

  const { data: ventasData } = await sb
    .from('ventas')
    .select('id, numero, fecha, total, estado, vendedor_usuario_id, nombre_cliente_rapido, clientes(razon_social, nombres, apellido_paterno)')
    .eq('caja_sesion_id', sesionId)
    .order('fecha')
    .limit(5000);

  type V = {
    id: string; numero: string; fecha: string; total: number | string; estado: string;
    vendedor_usuario_id: string | null; nombre_cliente_rapido: string | null;
    clientes?: { razon_social?: string | null; nombres?: string | null; apellido_paterno?: string | null } | null;
  };
  const ventas = (ventasData ?? []) as V[];
  const ventaIds = ventas.map((v) => v.id);

  // Pagos y comprobantes de esas ventas, por lotes para no pasarnos de URL.
  const pagos: PagoFila[] = [];
  const documento = new Map<string, { numero: string; tipo: string }>();
  for (let i = 0; i < ventaIds.length; i += 800) {
    const lote = ventaIds.slice(i, i + 800);
    const [pg, cp] = await Promise.all([
      sb.from('ventas_pagos').select('venta_id, metodo, monto, referencia').in('venta_id', lote),
      sb.from('comprobantes').select('venta_id, numero_completo, tipo').in('venta_id', lote),
    ]);
    pagos.push(...((pg.data ?? []) as PagoFila[]));
    for (const c of (cp.data ?? []) as Array<{ venta_id: string; numero_completo: string; tipo: string }>) {
      if (c.tipo === 'NOTA_CREDITO' || c.tipo === 'NOTA_DEBITO') continue;
      documento.set(c.venta_id, { numero: c.numero_completo, tipo: c.tipo });
    }
  }

  const [cuentas, movData, parcialesData] = await Promise.all([
    cuentasDelPos(sb),
    sb.from('caja_chica_movimientos')
      .select('created_at, tipo, concepto, metodo, monto, registrado_por')
      .eq('sesion_id', sesionId).order('created_at').limit(500),
    sb.from('cajas_cierres_parciales')
      .select('fecha, cajero_saliente, cajero_entrante, total_ventas, efectivo_esperado, efectivo_contado, diferencia, observaciones')
      .eq('sesion_id', sesionId).order('fecha').limit(50),
  ]);

  type Mov = {
    created_at: string; tipo: string; concepto: string; metodo: string | null;
    monto: number | string; registrado_por: string | null;
  };
  type Parc = {
    fecha: string; cajero_saliente: string | null; cajero_entrante: string | null;
    total_ventas: number | string; efectivo_esperado: number | string;
    efectivo_contado: number | string; diferencia: number | string; observaciones: string | null;
  };
  const movs = (movData.data ?? []) as Mov[];
  const parciales = (parcialesData.data ?? []) as Parc[];

  const nombres = await nombresDe(sb, [
    ...ventas.map((v) => v.vendedor_usuario_id ?? ''),
    ...movs.map((m) => m.registrado_por ?? ''),
    ...parciales.flatMap((p) => [p.cajero_saliente ?? '', p.cajero_entrante ?? '']),
  ]);

  // Sólo las ventas vivas entran al arqueo: una anulada no dejó plata en caja.
  const idsVivas = new Set(ventas.filter((v) => v.estado !== 'ANULADA').map((v) => v.id));
  const arqueo = arqueoPorCuenta(cuentas, pagos.filter((p) => idsVivas.has(p.venta_id)));

  const pagosDeVenta = new Map<string, PagoFila[]>();
  for (const p of pagos) {
    const a = pagosDeVenta.get(p.venta_id);
    if (a) a.push(p);
    else pagosDeVenta.set(p.venta_id, [p]);
  }

  const ventasDetalle: VentaDelCuadre[] = ventas.map((v) => {
    const c = v.clientes;
    const cliente = c?.razon_social
      ?? [c?.nombres, c?.apellido_paterno].filter(Boolean).join(' ').trim()
      ?? '';
    const doc = documento.get(v.id);
    return {
      venta_id: v.id,
      fecha: v.fecha,
      numero: v.numero,
      documento: doc?.numero ?? '—',
      tipo_documento: doc?.tipo ?? '—',
      cliente: cliente || v.nombre_cliente_rapido || '—',
      vendedor: v.vendedor_usuario_id ? (nombres.get(v.vendedor_usuario_id) ?? '—') : '—',
      total: Number(v.total ?? 0),
      pagos: (pagosDeVenta.get(v.id) ?? [])
        .map((p) => `${etiquetaPago(p.metodo, p.referencia)} · ${formatPEN(Number(p.monto ?? 0))}`)
        .join(' + ') || '—',
      anulada: v.estado === 'ANULADA',
    };
  });

  const movimientos: MovimientoCaja[] = movs.map((m) => ({
    fecha: m.created_at,
    tipo: m.tipo,
    concepto: m.concepto,
    metodo: m.metodo,
    monto: Number(m.monto ?? 0),
    registrado_por: m.registrado_por ? (nombres.get(m.registrado_por) ?? '—') : '—',
  }));

  const cierres_parciales: CierreParcialRow[] = parciales.map((p) => ({
    fecha: p.fecha,
    cajero_saliente: p.cajero_saliente ? (nombres.get(p.cajero_saliente) ?? '—') : '—',
    cajero_entrante: p.cajero_entrante ? (nombres.get(p.cajero_entrante) ?? '—') : '—',
    total_ventas: Number(p.total_ventas ?? 0),
    efectivo_esperado: Number(p.efectivo_esperado ?? 0),
    efectivo_contado: Number(p.efectivo_contado ?? 0),
    diferencia: Number(p.diferencia ?? 0),
    observaciones: p.observaciones,
  }));

  return { cabecera, arqueo, movimientos, ventas: ventasDetalle, cierres_parciales };
}

/** Las cajas, para el filtro. */
export async function listarCajasLookup(): Promise<Array<{ id: string; nombre: string }>> {
  const sb = await sbReadonly();
  const { data } = await sb.from('cajas').select('id, nombre').eq('activo', true).order('nombre');
  return (data ?? []) as Array<{ id: string; nombre: string }>;
}
