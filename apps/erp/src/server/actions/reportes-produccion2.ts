'use server';

/**
 * Reportes extra (pedido del cliente 22/07/2026):
 *   C) Tiempo de RECETA (estándar) vs tiempo REAL de producción — por OT.
 *   D) Trazabilidad producción → venta por modelo y talla.
 */

import { createClient } from '@happy/db/server';
import { redirect } from 'next/navigation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sbReadonly(): Promise<{ from: (t: string) => any }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as { from: (t: string) => any };
}

// ============================================================================
// C) TIEMPO RECETA (estándar) vs TIEMPO REAL
// ============================================================================
export type TiempoRvRRow = {
  ot_id: string; ot_numero: string; fecha_cierre: string;
  producto_nombre: string; unidades: number;
  estandar_min: number; real_min: number;
  diferencia_min: number; desviacion_pct: number;
  estandar_min_u: number; real_min_u: number;
};
export type ReporteTiempoRvRResult = {
  metricas: { cantidad_ots: number; estandar_min: number; real_min: number; diferencia_min: number; desviacion_pct: number };
  rows: TiempoRvRRow[];
};

export async function reporteTiempoRecetaVsReal(
  f: { desde: string; hasta: string },
): Promise<ReporteTiempoRvRResult> {
  const sb = await sbReadonly();
  const vacio: ReporteTiempoRvRResult = { metricas: { cantidad_ots: 0, estandar_min: 0, real_min: 0, diferencia_min: 0, desviacion_pct: 0 }, rows: [] };

  const { data: otsRaw } = await sb.from('ot')
    .select('id, numero, fecha_cierre')
    .gte('fecha_cierre', f.desde).lte('fecha_cierre', f.hasta)
    .not('fecha_cierre', 'is', null);
  const ots = (otsRaw ?? []) as { id: string; numero: string; fecha_cierre: string }[];
  const otIds = ots.map((o) => o.id);
  if (otIds.length === 0) return vacio;

  const { data: lineasRaw } = await sb.from('ot_lineas')
    .select('ot_id, producto_id, talla, cantidad_terminada, cantidad_cortada, productos:producto_id(nombre)')
    .in('ot_id', otIds);
  type LR = { ot_id: string; producto_id: string; talla: string; cantidad_terminada: number | null; cantidad_cortada: number | null; productos: { nombre: string } | null };
  const lineas = (lineasRaw ?? []) as unknown as LR[];
  const productoIds = Array.from(new Set(lineas.map((l) => l.producto_id)));

  // Tiempo estándar por (producto, talla). Los procesos con talla NULL aplican a
  // todas las tallas. Sumamos el tiempo_estandar_min de todos los procesos.
  const { data: procsRaw } = await sb.from('productos_procesos')
    .select('producto_id, talla, tiempo_estandar_min')
    .in('producto_id', productoIds).eq('activo', true);
  const stdPorProdTalla = new Map<string, number>(); // producto::talla → min/u
  const stdGeneralPorProd = new Map<string, number>(); // producto → min/u (talla null)
  for (const p of (procsRaw ?? []) as { producto_id: string; talla: string | null; tiempo_estandar_min: number | string | null }[]) {
    const min = Number(p.tiempo_estandar_min ?? 0);
    if (p.talla) stdPorProdTalla.set(`${p.producto_id}::${p.talla}`, (stdPorProdTalla.get(`${p.producto_id}::${p.talla}`) ?? 0) + min);
    else stdGeneralPorProd.set(p.producto_id, (stdGeneralPorProd.get(p.producto_id) ?? 0) + min);
  }

  // Tiempo real declarado en la OT (operaciones internas).
  const { data: regsRaw } = await sb.from('ot_registros_tiempo')
    .select('ot_id, tiempo_total_min').in('ot_id', otIds);
  const realPorOt = new Map<string, number>();
  for (const r of (regsRaw ?? []) as { ot_id: string; tiempo_total_min: number | string | null }[]) {
    realPorOt.set(r.ot_id, (realPorOt.get(r.ot_id) ?? 0) + Number(r.tiempo_total_min ?? 0));
  }
  // Tiempo real de CORTE (liquidación por tela) → sumar a la OT del corte.
  const { data: cortesRaw } = await sb.from('ot_corte').select('id, ot_id').in('ot_id', otIds);
  const corteToOt = new Map<string, string>();
  for (const c of (cortesRaw ?? []) as { id: string; ot_id: string }[]) corteToOt.set(c.id, c.ot_id);
  const corteIds = [...corteToOt.keys()];
  if (corteIds.length > 0) {
    const { data: ctRaw } = await sb.from('ot_corte_tiempos')
      .select('corte_id, tiempo_tendido_min, tiempo_corte_min, tiempo_habilitado_min').in('corte_id', corteIds);
    for (const t of (ctRaw ?? []) as { corte_id: string; tiempo_tendido_min: number | string | null; tiempo_corte_min: number | string | null; tiempo_habilitado_min: number | string | null }[]) {
      const otId = corteToOt.get(t.corte_id);
      if (!otId) continue;
      const min = Number(t.tiempo_tendido_min ?? 0) + Number(t.tiempo_corte_min ?? 0) + Number(t.tiempo_habilitado_min ?? 0);
      realPorOt.set(otId, (realPorOt.get(otId) ?? 0) + min);
    }
  }

  // Consolidar por OT.
  type Acc = { ot_id: string; ot_numero: string; fecha_cierre: string; nombre: string; unidades: number; estandar: number };
  const acc = new Map<string, Acc>();
  for (const l of lineas) {
    const otMeta = ots.find((o) => o.id === l.ot_id);
    if (!otMeta) continue;
    const cur = acc.get(l.ot_id) ?? { ot_id: l.ot_id, ot_numero: otMeta.numero, fecha_cierre: otMeta.fecha_cierre, nombre: l.productos?.nombre ?? '—', unidades: 0, estandar: 0 };
    const u = Number(l.cantidad_terminada ?? l.cantidad_cortada ?? 0);
    const stdU = (stdGeneralPorProd.get(l.producto_id) ?? 0) + (stdPorProdTalla.get(`${l.producto_id}::${l.talla}`) ?? 0);
    cur.unidades += u;
    cur.estandar += stdU * u;
    acc.set(l.ot_id, cur);
  }

  const rows: TiempoRvRRow[] = [...acc.values()].map((a) => {
    const real = realPorOt.get(a.ot_id) ?? 0;
    const dif = real - a.estandar;
    return {
      ot_id: a.ot_id, ot_numero: a.ot_numero, fecha_cierre: a.fecha_cierre,
      producto_nombre: a.nombre, unidades: a.unidades,
      estandar_min: Math.round(a.estandar * 100) / 100,
      real_min: Math.round(real * 100) / 100,
      diferencia_min: Math.round(dif * 100) / 100,
      desviacion_pct: a.estandar > 0 ? (dif / a.estandar) * 100 : 0,
      estandar_min_u: a.unidades > 0 ? Math.round((a.estandar / a.unidades) * 100) / 100 : 0,
      real_min_u: a.unidades > 0 ? Math.round((real / a.unidades) * 100) / 100 : 0,
    };
  }).sort((x, y) => Math.abs(y.desviacion_pct) - Math.abs(x.desviacion_pct));

  const estandarTot = rows.reduce((s, r) => s + r.estandar_min, 0);
  const realTot = rows.reduce((s, r) => s + r.real_min, 0);
  return {
    metricas: {
      cantidad_ots: rows.length,
      estandar_min: Math.round(estandarTot * 100) / 100,
      real_min: Math.round(realTot * 100) / 100,
      diferencia_min: Math.round((realTot - estandarTot) * 100) / 100,
      desviacion_pct: estandarTot > 0 ? ((realTot - estandarTot) / estandarTot) * 100 : 0,
    },
    rows,
  };
}

// ============================================================================
// D) TRAZABILIDAD producción → venta por MODELO y TALLA
// ============================================================================
export type TrazaRow = {
  variante_id: string; sku: string; producto_id: string; producto_nombre: string; talla: string;
  producido: number; vendido: number; devuelto: number; stock: number;
};
export type ReporteTrazabilidadResult = {
  metricas: { producido: number; vendido: number; stock: number; variantes: number };
  rows: TrazaRow[];
};

export async function reporteTrazabilidadProduccionVenta(
  f: { producto_id?: string } = {},
): Promise<ReporteTrazabilidadResult> {
  const sb = await sbReadonly();

  // Movimientos de kardex por variante: producción y ventas.
  let q = sb.from('kardex_movimientos')
    .select('variante_id, tipo, cantidad')
    .in('tipo', ['ENTRADA_PRODUCCION', 'SALIDA_VENTA', 'ENTRADA_DEVOLUCION_CLIENTE']);
  const { data: kdxRaw } = await q;
  type K = { variante_id: string; tipo: string; cantidad: number | string | null };
  const kdx = (kdxRaw ?? []) as K[];

  const prod = new Map<string, number>();
  const vend = new Map<string, number>();
  const dev = new Map<string, number>();
  for (const m of kdx) {
    const c = Number(m.cantidad ?? 0);
    if (m.tipo === 'ENTRADA_PRODUCCION') prod.set(m.variante_id, (prod.get(m.variante_id) ?? 0) + c);
    else if (m.tipo === 'SALIDA_VENTA') vend.set(m.variante_id, (vend.get(m.variante_id) ?? 0) + c);
    else if (m.tipo === 'ENTRADA_DEVOLUCION_CLIENTE') dev.set(m.variante_id, (dev.get(m.variante_id) ?? 0) + c);
  }

  // Variantes producidas (base del reporte) + info del modelo/talla.
  const variantesIds = Array.from(new Set([...prod.keys(), ...vend.keys()]));
  if (variantesIds.length === 0) return { metricas: { producido: 0, vendido: 0, stock: 0, variantes: 0 }, rows: [] };

  let vq = sb.from('productos_variantes')
    .select('id, sku, talla, producto_id, productos:producto_id(nombre)')
    .in('id', variantesIds);
  if (f.producto_id) vq = vq.eq('producto_id', f.producto_id);
  const { data: varsRaw } = await vq;
  type V = { id: string; sku: string; talla: string; producto_id: string; productos: { nombre: string } | null };
  const vars = (varsRaw ?? []) as unknown as V[];

  // Stock actual por variante.
  const { data: stockRaw } = await sb.from('v_stock_variante_total').select('variante_id, stock_total').in('variante_id', variantesIds);
  const stockMap = new Map<string, number>();
  for (const s of (stockRaw ?? []) as { variante_id: string; stock_total: number | string | null }[]) {
    stockMap.set(s.variante_id, Number(s.stock_total ?? 0));
  }

  const rows: TrazaRow[] = vars.map((v) => ({
    variante_id: v.id, sku: v.sku, producto_id: v.producto_id,
    producto_nombre: v.productos?.nombre ?? '—', talla: v.talla,
    producido: prod.get(v.id) ?? 0,
    vendido: vend.get(v.id) ?? 0,
    devuelto: dev.get(v.id) ?? 0,
    stock: stockMap.get(v.id) ?? 0,
  })).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre, 'es') || a.talla.localeCompare(b.talla));

  return {
    metricas: {
      producido: rows.reduce((s, r) => s + r.producido, 0),
      vendido: rows.reduce((s, r) => s + r.vendido, 0),
      stock: rows.reduce((s, r) => s + r.stock, 0),
      variantes: rows.length,
    },
    rows,
  };
}
