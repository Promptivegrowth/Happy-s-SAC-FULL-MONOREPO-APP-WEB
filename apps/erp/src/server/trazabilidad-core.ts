/**
 * Trazabilidad producción → venta, por modelo y talla.
 *
 * Parte de lo PRODUCIDO (ingresos de PT por cierre de OT) y sigue qué pasó
 * después: cuánto se vendió desde ese ingreso, cuánto volvió y cuánto queda.
 *
 * Antes partía de todo lo producido o vendido (1.022 tallas) y lo pedía en una
 * sola consulta: la base la rechazaba por larga ("Bad Request"), el reporte
 * quedaba vacío y decía "Aún no hay producción registrada" aunque la OT-26-00003
 * ya había ingresado 180 prendas (13/10/2026). Además leía solo las primeras
 * 1.000 filas del kárdex. Ahora consulta en tandas y lee todo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

export type TrazaRow = {
  variante_id: string; sku: string; producto_id: string; producto_nombre: string; talla: string;
  /** OT de las que salió (las de su ingreso a almacén). */
  ots: string;
  /** Primer ingreso de producción de esa talla (YYYY-MM-DD, hora de Lima). */
  desde: string;
  producido: number;
  /** Vendido desde el primer ingreso de producción. */
  vendido: number;
  /** Vendido en toda la historia del sistema (incluye stock anterior a la OT). */
  vendido_total: number;
  /** Devuelto por clientes desde el primer ingreso. */
  devuelto: number;
  stock: number;
};
export type ReporteTrazabilidadResult = {
  metricas: { producido: number; vendido: number; stock: number; variantes: number; modelos: number };
  rows: TrazaRow[];
};

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

const diaLima = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export async function armarTrazabilidad(sb: Sb, f: { producto_id?: string } = {}): Promise<ReporteTrazabilidadResult> {
  // 1) Lo producido: cada ingreso de PT por cierre de OT.
  type P = { variante_id: string; cantidad: number | string | null; fecha: string; observacion: string | null };
  const prod = await todas<P>(() => sb.from('kardex_movimientos')
    .select('variante_id, cantidad, fecha, observacion')
    .eq('tipo', 'ENTRADA_PRODUCCION').not('variante_id', 'is', null)
    .order('fecha', { ascending: true }).order('id', { ascending: true }));

  const porVar = new Map<string, { producido: number; desde: string; ots: Set<string> }>();
  for (const p of prod) {
    const x = porVar.get(p.variante_id) ?? { producido: 0, desde: p.fecha, ots: new Set<string>() };
    x.producido += Number(p.cantidad ?? 0);
    if (new Date(p.fecha) < new Date(x.desde)) x.desde = p.fecha;
    const ot = /OT-[\d-]+/.exec(p.observacion ?? '')?.[0];
    if (ot) x.ots.add(ot);
    porVar.set(p.variante_id, x);
  }
  const ids = [...porVar.keys()];
  const vacio = { metricas: { producido: 0, vendido: 0, stock: 0, variantes: 0, modelos: 0 }, rows: [] };
  if (ids.length === 0) return vacio;

  // 2) Ventas y devoluciones de esas tallas.
  type K = { variante_id: string; tipo: string; cantidad: number | string | null; fecha: string };
  const movs = await enTandas<K>(ids, (t) => todas<K>(() => sb.from('kardex_movimientos')
    .select('variante_id, tipo, cantidad, fecha')
    .in('variante_id', t).in('tipo', ['SALIDA_VENTA', 'ENTRADA_DEVOLUCION_CLIENTE'])
    .order('id', { ascending: true })));
  const vend = new Map<string, number>(), vendTot = new Map<string, number>(), dev = new Map<string, number>();
  for (const m of movs) {
    const c = Number(m.cantidad ?? 0);
    const despues = new Date(m.fecha) >= new Date(porVar.get(m.variante_id)!.desde);
    if (m.tipo === 'SALIDA_VENTA') {
      vendTot.set(m.variante_id, (vendTot.get(m.variante_id) ?? 0) + c);
      if (despues) vend.set(m.variante_id, (vend.get(m.variante_id) ?? 0) + c);
    } else if (despues) {
      dev.set(m.variante_id, (dev.get(m.variante_id) ?? 0) + c);
    }
  }

  // 3) Modelo, talla y stock.
  type V = { id: string; sku: string; talla: string; producto_id: string; productos: { nombre: string } | null };
  const vars = await enTandas<V>(ids, async (t) => {
    let q = sb.from('productos_variantes').select('id, sku, talla, producto_id, productos:producto_id(nombre)').in('id', t);
    if (f.producto_id) q = q.eq('producto_id', f.producto_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as V[];
  });
  const stock = new Map<string, number>();
  for (const s of await enTandas<{ variante_id: string; stock_total: number | string | null }>(ids, async (t) => {
    const { data, error } = await sb.from('v_stock_variante_total').select('variante_id, stock_total').in('variante_id', t);
    if (error) throw new Error(error.message);
    return data ?? [];
  })) stock.set(s.variante_id, Number(s.stock_total ?? 0));

  const rows: TrazaRow[] = vars.map((v) => {
    const p = porVar.get(v.id)!;
    return {
      variante_id: v.id, sku: v.sku, producto_id: v.producto_id, producto_nombre: v.productos?.nombre ?? '—', talla: v.talla,
      ots: [...p.ots].join(', '), desde: diaLima(p.desde),
      producido: p.producido, vendido: vend.get(v.id) ?? 0, vendido_total: vendTot.get(v.id) ?? 0,
      devuelto: dev.get(v.id) ?? 0, stock: stock.get(v.id) ?? 0,
    };
  }).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre, 'es')
    || a.talla.localeCompare(b.talla, 'es', { numeric: true }));

  return {
    metricas: {
      producido: rows.reduce((s, r) => s + r.producido, 0),
      vendido: rows.reduce((s, r) => s + r.vendido, 0),
      stock: rows.reduce((s, r) => s + r.stock, 0),
      variantes: rows.length,
      modelos: new Set(rows.map((r) => r.producto_id)).size,
    },
    rows,
  };
}
