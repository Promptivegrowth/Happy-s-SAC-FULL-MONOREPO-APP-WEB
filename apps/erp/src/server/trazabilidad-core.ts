/**
 * Trazabilidad de producto terminado: de dónde vino, dónde está y quién lo
 * compró. Pedido de Javier (13/10/2026): ver los 3 almacenes (Santa Bárbara,
 * Huallaga, La Quinta), filtrar por fechas, buscar por producto y ver cada
 * venta (vendedor, comprobante, medio de pago, fecha, monto y cliente), para
 * validar contra las existencias.
 *
 * Se arma con el kárdex, que registra cada entrada y salida por almacén:
 * producción (cierre de OT), traslados, ventas, devoluciones, ajustes y
 * anulaciones. Todo se consulta en tandas y paginado: con una sola consulta
 * larga la base respondía "Bad Request" y el reporte quedaba vacío, y sin
 * paginar se leían solo las primeras 1.000 filas.
 */

import { etiquetaPago } from '@happy/lib/pagos/etiqueta';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type FiltrosTraza = { q?: string; desde?: string; hasta?: string; almacenId?: string };
export type AlmacenPT = { id: string; codigo: string; nombre: string };

export type TrazaRow = {
  variante_id: string; sku: string; producto_id: string; producto_nombre: string; talla: string;
  /** OT de las que salió (ingresos de producción del período). */
  ots: string;
  producido: number;
  traslado_entra: number;
  traslado_sale: number;
  /** Vendido menos lo que volvió por ventas anuladas. */
  vendido: number;
  devuelto: number;
  /** Ajustes de conteo netos (sin las anulaciones de venta). */
  ajustes: number;
  /** Stock de hoy por almacén (id → cantidad). */
  stock: Record<string, number>;
  stock_total: number;
};
export type ReporteTrazabilidadResult = {
  almacenes: AlmacenPT[];
  metricas: { modelos: number; variantes: number; producido: number; vendido: number; stock: number };
  rows: TrazaRow[];
  /** El buscador encontró más de lo que se muestra. */
  recortado: boolean;
};

const MAX_VARIANTES = 400;

/** Todas las filas, de 1.000 en 1.000 (la base corta ahí sin avisar). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todas<T>(armar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < 1000) return out;
  }
}

/** Listas largas de ids en tandas de 150: con cientos, la dirección se vuelve demasiado larga. */
async function enTandas<T>(ids: string[], leer: (tanda: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(await leer(ids.slice(i, i + 150))));
  return out;
}

const iniDia = (d: string) => `${d}T00:00:00-05:00`;
const finDia = (d: string) => `${d}T23:59:59.999-05:00`;
const valido = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

/** Los almacenes de producto terminado: Santa Bárbara y las tiendas. */
export async function almacenesPT(sb: Sb): Promise<AlmacenPT[]> {
  const { data, error } = await sb.from('almacenes').select('id, codigo, nombre, tipo')
    .in('tipo', ['PRODUCTO_TERMINADO', 'TIENDA']).eq('activo', true).order('codigo');
  if (error) throw new Error(error.message);
  return ((data ?? []) as AlmacenPT[]).map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));
}

/** Variantes que coinciden con lo buscado: nombre del modelo, código, SKU o código de barras. */
async function buscarVariantes(sb: Sb, q: string): Promise<string[]> {
  const t = q.trim().replace(/[%_,()]/g, ' ');
  const patron = `%${t}%`;
  const { data: prods } = await sb.from('productos').select('id').or(`nombre.ilike.${patron},codigo.ilike.${patron}`).limit(300);
  const prodIds = ((prods ?? []) as { id: string }[]).map((p) => p.id);
  const filtro = [`sku.ilike.${patron}`, `codigo_barras.ilike.${patron}`];
  const ids = new Set<string>();
  const { data: porCodigo } = await sb.from('productos_variantes').select('id').or(filtro.join(',')).limit(MAX_VARIANTES + 1);
  for (const v of (porCodigo ?? []) as { id: string }[]) ids.add(v.id);
  for (const v of await enTandas<{ id: string }>(prodIds, async (tanda) => {
    const { data } = await sb.from('productos_variantes').select('id').in('producto_id', tanda).limit(2000);
    return (data ?? []) as { id: string }[];
  })) ids.add(v.id);
  return [...ids];
}

export async function armarTrazabilidad(sb: Sb, f: FiltrosTraza = {}): Promise<ReporteTrazabilidadResult> {
  const desde = valido(f.desde), hasta = valido(f.hasta);
  const almacenes = await almacenesPT(sb);
  const enRango = (q: { gte: Function; lte: Function }) => { // eslint-disable-line @typescript-eslint/ban-types
    let x = q as unknown as { gte: Function; lte: Function }; // eslint-disable-line @typescript-eslint/ban-types
    if (desde) x = x.gte('fecha', iniDia(desde));
    if (hasta) x = x.lte('fecha', finDia(hasta));
    return x;
  };

  // 1) Qué tallas se muestran: lo buscado, o lo producido en el período.
  let ids: string[];
  if (f.q?.trim()) {
    ids = await buscarVariantes(sb, f.q);
  } else {
    const prod = await todas<{ variante_id: string }>(() => enRango(sb.from('kardex_movimientos')
      .select('variante_id').eq('tipo', 'ENTRADA_PRODUCCION').not('variante_id', 'is', null)) as never);
    ids = [...new Set(prod.map((p) => p.variante_id))];
  }
  const recortado = ids.length > MAX_VARIANTES;
  ids = ids.slice(0, MAX_VARIANTES);
  const vacio: ReporteTrazabilidadResult = { almacenes, metricas: { modelos: 0, variantes: 0, producido: 0, vendido: 0, stock: 0 }, rows: [], recortado };
  if (ids.length === 0) return vacio;

  // 2) Movimientos del período (y del almacén elegido).
  type K = { variante_id: string; tipo: string; referencia_tipo: string | null; cantidad: number | string | null; observacion: string | null };
  const movs = await enTandas<K>(ids, (t) => todas<K>(() => {
    let q = enRango(sb.from('kardex_movimientos')
      .select('variante_id, tipo, referencia_tipo, cantidad, observacion').in('variante_id', t)) as unknown as { eq: Function; order: Function }; // eslint-disable-line @typescript-eslint/ban-types
    if (f.almacenId) q = q.eq('almacen_id', f.almacenId);
    return q.order('id', { ascending: true });
  }));

  const acc = new Map<string, Omit<TrazaRow, 'variante_id' | 'sku' | 'producto_id' | 'producto_nombre' | 'talla' | 'stock' | 'stock_total' | 'ots'> & { ots: Set<string> }>();
  for (const m of movs) {
    const a = acc.get(m.variante_id) ?? { producido: 0, traslado_entra: 0, traslado_sale: 0, vendido: 0, devuelto: 0, ajustes: 0, ots: new Set<string>() };
    const c = Number(m.cantidad ?? 0);
    switch (m.tipo) {
      case 'ENTRADA_PRODUCCION': {
        a.producido += c;
        const ot = /OT-[\d-]+/.exec(m.observacion ?? '')?.[0];
        if (ot) a.ots.add(ot);
        break;
      }
      case 'ENTRADA_TRASLADO': a.traslado_entra += c; break;
      case 'SALIDA_TRASLADO': a.traslado_sale += c; break;
      case 'SALIDA_VENTA': a.vendido += c; break;
      case 'ENTRADA_DEVOLUCION_CLIENTE': a.devuelto += c; break;
      case 'ENTRADA_AJUSTE':
        // La venta anulada devuelve el stock como ajuste: se descuenta de lo vendido.
        if (m.referencia_tipo === 'ANULACION') a.vendido -= c; else a.ajustes += c;
        break;
      case 'SALIDA_AJUSTE': case 'SALIDA_MERMA': a.ajustes -= c; break;
    }
    acc.set(m.variante_id, a);
  }

  // 3) Modelo, talla y stock de hoy por almacén.
  type V = { id: string; sku: string; talla: string; producto_id: string; productos: { nombre: string } | null };
  const vars = await enTandas<V>(ids, async (t) => {
    const { data, error } = await sb.from('productos_variantes').select('id, sku, talla, producto_id, productos:producto_id(nombre)').in('id', t);
    if (error) throw new Error(error.message);
    return (data ?? []) as V[];
  });
  const idsAlm = new Set(almacenes.map((a) => a.id));
  const stock = new Map<string, Record<string, number>>();
  for (const s of await enTandas<{ variante_id: string; almacen_id: string; cantidad: number | string | null }>(ids, async (t) => {
    const { data, error } = await sb.from('stock_actual').select('variante_id, almacen_id, cantidad').in('variante_id', t);
    if (error) throw new Error(error.message);
    return data ?? [];
  })) {
    if (!idsAlm.has(s.almacen_id)) continue;
    const r = stock.get(s.variante_id) ?? {};
    r[s.almacen_id] = (r[s.almacen_id] ?? 0) + Number(s.cantidad ?? 0);
    stock.set(s.variante_id, r);
  }

  const rows: TrazaRow[] = vars.map((v) => {
    const a = acc.get(v.id) ?? { producido: 0, traslado_entra: 0, traslado_sale: 0, vendido: 0, devuelto: 0, ajustes: 0, ots: new Set<string>() };
    const st = stock.get(v.id) ?? {};
    const stTotal = f.almacenId ? (st[f.almacenId] ?? 0) : Object.values(st).reduce((x, y) => x + y, 0);
    return {
      variante_id: v.id, sku: v.sku, producto_id: v.producto_id, producto_nombre: v.productos?.nombre ?? '—', talla: v.talla,
      ots: [...a.ots].join(', '), producido: a.producido, traslado_entra: a.traslado_entra, traslado_sale: a.traslado_sale,
      vendido: a.vendido, devuelto: a.devuelto, ajustes: a.ajustes, stock: st, stock_total: stTotal,
    };
  }).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre, 'es') || a.talla.localeCompare(b.talla, 'es', { numeric: true }));

  return {
    almacenes,
    metricas: {
      modelos: new Set(rows.map((r) => r.producto_id)).size,
      variantes: rows.length,
      producido: rows.reduce((s, r) => s + r.producido, 0),
      vendido: rows.reduce((s, r) => s + r.vendido, 0),
      stock: rows.reduce((s, r) => s + r.stock_total, 0),
    },
    rows,
    recortado,
  };
}

// ============================================================================
// Detalle de una talla: cada movimiento con su saldo, y cada venta.
// ============================================================================

export type MovimientoTraza = {
  fecha: string; almacen: string; tipo: string; detalle: string; cantidad: number; saldo: number; usuario: string;
};
export type VentaTraza = {
  fecha: string; venta: string; estado: string; tienda: string; vendedor: string; comprobante: string;
  pago: string; cantidad: number; precio: number; monto: number; total_venta: number; cliente: string; documento: string;
};
export type DetalleTraza = {
  variante: { id: string; sku: string; talla: string; producto_nombre: string };
  almacenes: AlmacenPT[];
  /** Stock de hoy y lo que da el kárdex sumando todos sus movimientos: deben coincidir. */
  control: { almacen_id: string; almacen: string; stock: number; kardex: number }[];
  movimientos: MovimientoTraza[];
  ventas: VentaTraza[];
};

const TIPO_LEGIBLE: Record<string, string> = {
  ENTRADA_PRODUCCION: 'Ingreso de producción', ENTRADA_TRASLADO: 'Traslado recibido', SALIDA_TRASLADO: 'Traslado enviado',
  SALIDA_VENTA: 'Venta', ENTRADA_DEVOLUCION_CLIENTE: 'Devolución de cliente', ENTRADA_AJUSTE: 'Ajuste (+)',
  SALIDA_AJUSTE: 'Ajuste (−)', SALIDA_MERMA: 'Merma', ENTRADA_COMPRA: 'Compra',
};
const ES_SALIDA = (tipo: string) => tipo.startsWith('SALIDA');

export async function armarTrazabilidadDetalle(sb: Sb, varianteId: string, f: FiltrosTraza = {}): Promise<DetalleTraza | null> {
  const desde = valido(f.desde), hasta = valido(f.hasta);
  const { data: v } = await sb.from('productos_variantes').select('id, sku, talla, productos:producto_id(nombre)').eq('id', varianteId).maybeSingle();
  if (!v) return null;
  const almacenes = await almacenesPT(sb);
  const nombreAlm = new Map(almacenes.map((a) => [a.id, a.nombre]));
  const { data: todosAlm } = await sb.from('almacenes').select('id, nombre');
  for (const a of (todosAlm ?? []) as { id: string; nombre: string }[]) if (!nombreAlm.has(a.id)) nombreAlm.set(a.id, a.nombre);

  // Todo el kárdex de la talla, desde el principio: el saldo se arrastra.
  type K = { id: number; fecha: string; tipo: string; referencia_tipo: string | null; almacen_id: string; almacen_contraparte: string | null; cantidad: number | string | null; observacion: string | null; usuario_id: string | null };
  const kdx = await todas<K>(() => sb.from('kardex_movimientos')
    .select('id, fecha, tipo, referencia_tipo, almacen_id, almacen_contraparte, cantidad, observacion, usuario_id')
    .eq('variante_id', varianteId).order('fecha', { ascending: true }).order('id', { ascending: true }));
  const usuarios = new Map<string, string>();
  const idsUsu = [...new Set(kdx.map((k) => k.usuario_id).filter(Boolean))] as string[];
  for (const p of await enTandas<{ id: string; nombre_completo: string | null }>(idsUsu, async (t) => {
    const { data } = await sb.from('perfiles').select('id, nombre_completo').in('id', t);
    return data ?? [];
  })) usuarios.set(p.id, p.nombre_completo ?? '');

  const saldo = new Map<string, number>();
  const movimientos: MovimientoTraza[] = [];
  const ini = desde ? new Date(iniDia(desde)) : null;
  const fin = hasta ? new Date(finDia(hasta)) : null;
  for (const k of kdx) {
    const c = Number(k.cantidad ?? 0) * (ES_SALIDA(k.tipo) ? -1 : 1);
    const s = (saldo.get(k.almacen_id) ?? 0) + c;
    saldo.set(k.almacen_id, s);
    const fe = new Date(k.fecha);
    if ((ini && fe < ini) || (fin && fe > fin) || (f.almacenId && k.almacen_id !== f.almacenId)) continue;
    const contra = k.almacen_contraparte ? nombreAlm.get(k.almacen_contraparte) : null;
    const tipo = k.referencia_tipo === 'ANULACION' ? 'Anulación de venta' : (TIPO_LEGIBLE[k.tipo] ?? k.tipo);
    const detalle = [contra ? (k.tipo === 'SALIDA_TRASLADO' ? `a ${contra}` : `de ${contra}`) : '', k.observacion ?? ''].filter(Boolean).join(' · ');
    movimientos.push({
      fecha: k.fecha, almacen: nombreAlm.get(k.almacen_id) ?? '—', tipo, detalle, cantidad: c, saldo: s,
      usuario: (k.usuario_id && usuarios.get(k.usuario_id)) || '',
    });
  }

  const { data: st } = await sb.from('stock_actual').select('almacen_id, cantidad').eq('variante_id', varianteId);
  const stockHoy = new Map<string, number>();
  for (const r of (st ?? []) as { almacen_id: string; cantidad: number | string | null }[]) stockHoy.set(r.almacen_id, Number(r.cantidad ?? 0));
  const control = almacenes.map((a) => ({ almacen_id: a.id, almacen: a.nombre, stock: stockHoy.get(a.id) ?? 0, kardex: saldo.get(a.id) ?? 0 }));

  // Ventas de la talla.
  type L = { venta_id: string; cantidad: number | string | null; precio_unitario: number | string | null; descuento_monto: number | string | null };
  const lineas = await todas<L>(() => sb.from('ventas_lineas').select('venta_id, cantidad, precio_unitario, descuento_monto')
    .eq('variante_id', varianteId).order('id', { ascending: true }));
  const idsVenta = [...new Set(lineas.map((l) => l.venta_id))];
  type VV = { id: string; numero: string; fecha: string; estado: string; canal: string | null; almacen_id: string | null; vendedor_usuario_id: string | null; cliente_id: string | null; nombre_cliente_rapido: string | null; documento_cliente: string | null; tipo_documento_cliente: string | null; total: number | string | null; comprobante_id: string | null };
  const ventas = await enTandas<VV>(idsVenta, async (t) => {
    let q = sb.from('ventas').select('id, numero, fecha, estado, canal, almacen_id, vendedor_usuario_id, cliente_id, nombre_cliente_rapido, documento_cliente, tipo_documento_cliente, total, comprobante_id').in('id', t);
    if (desde) q = q.gte('fecha', iniDia(desde));
    if (hasta) q = q.lte('fecha', finDia(hasta));
    if (f.almacenId) q = q.eq('almacen_id', f.almacenId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as VV[];
  });
  const ventaDe = new Map(ventas.map((x) => [x.id, x]));
  const ids = (sel: (x: VV) => string | null) => [...new Set(ventas.map(sel).filter(Boolean))] as string[];
  const [vendedores, comps, pagos, clientes] = await Promise.all([
    enTandas<{ id: string; nombre_completo: string | null }>(ids((x) => x.vendedor_usuario_id), async (t) => (await sb.from('perfiles').select('id, nombre_completo').in('id', t)).data ?? []),
    enTandas<{ id: string; tipo: string; numero_completo: string }>(ids((x) => x.comprobante_id), async (t) => (await sb.from('comprobantes').select('id, tipo, numero_completo').in('id', t)).data ?? []),
    enTandas<{ venta_id: string; metodo: string; referencia: string | null; monto: number | string | null }>(ventas.map((x) => x.id), async (t) => (await sb.from('ventas_pagos').select('venta_id, metodo, referencia, monto').in('venta_id', t)).data ?? []),
    enTandas<{ id: string; razon_social: string | null; nombres: string | null; apellido_paterno: string | null; apellido_materno: string | null; numero_documento: string | null }>(ids((x) => x.cliente_id), async (t) => (await sb.from('clientes').select('id, razon_social, nombres, apellido_paterno, apellido_materno, numero_documento').in('id', t)).data ?? []),
  ]);
  const vendDe = new Map(vendedores.map((p) => [p.id, p.nombre_completo ?? '']));
  const compDe = new Map(comps.map((c) => [c.id, `${c.tipo === 'NOTA_VENTA' ? 'Nota de venta' : c.tipo === 'FACTURA' ? 'Factura' : c.tipo === 'BOLETA' ? 'Boleta' : c.tipo} ${c.numero_completo}`]));
  const pagosDe = new Map<string, string[]>();
  for (const p of pagos) {
    const l = pagosDe.get(p.venta_id) ?? [];
    l.push(`${etiquetaPago(p.metodo, p.referencia)} S/ ${Number(p.monto ?? 0).toFixed(2)}`);
    pagosDe.set(p.venta_id, l);
  }
  const cliDe = new Map(clientes.map((c) => [c.id, {
    nombre: c.razon_social || [c.nombres, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' '),
    doc: c.numero_documento ?? '',
  }]));

  const ventasTraza: VentaTraza[] = lineas.filter((l) => ventaDe.has(l.venta_id)).map((l) => {
    const x = ventaDe.get(l.venta_id)!;
    const cant = Number(l.cantidad ?? 0), precio = Number(l.precio_unitario ?? 0);
    const cli = x.cliente_id ? cliDe.get(x.cliente_id) : undefined;
    return {
      fecha: x.fecha, venta: x.numero, estado: x.estado,
      tienda: x.canal === 'WEB' ? 'Web' : (x.almacen_id ? nombreAlm.get(x.almacen_id) ?? '—' : '—'),
      vendedor: (x.vendedor_usuario_id && vendDe.get(x.vendedor_usuario_id)) || '—',
      comprobante: (x.comprobante_id && compDe.get(x.comprobante_id)) || '—',
      pago: (pagosDe.get(x.id) ?? []).join(' + ') || '—',
      cantidad: cant, precio, monto: +(cant * precio - Number(l.descuento_monto ?? 0)).toFixed(2), total_venta: Number(x.total ?? 0),
      cliente: x.nombre_cliente_rapido?.trim() || cli?.nombre || 'Cliente varios',
      documento: [x.tipo_documento_cliente, x.documento_cliente || cli?.doc].filter(Boolean).join(' '),
    };
  }).sort((a, b) => b.fecha.localeCompare(a.fecha));

  return {
    variante: { id: v.id, sku: v.sku, talla: v.talla, producto_nombre: (v.productos as { nombre?: string } | null)?.nombre ?? '—' },
    almacenes, control, movimientos: movimientos.reverse(), ventas: ventasTraza,
  };
}
