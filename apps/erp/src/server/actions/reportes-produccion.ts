'use server';

/**
 * Reportes de producción (pedidos por ing. Mariluz — reunión 27/06).
 *
 * A) Producción por período — mensual: qué OTs se cerraron, cuántas unidades
 *    salieron, cuánto material consumió, cuánto pagamos a talleres, tiempos.
 *
 * B) Costeo comparativo — cotización teórica (según receta activa + tarifas)
 *    vs costo real (kardex SALIDA_PRODUCCION + ordenes_servicio) por OT.
 *    Identifica OTs donde el costo real se disparó vs presupuesto.
 */

import { createClient } from '@happy/db/server';
import { redirect } from 'next/navigation';
import type {
  FiltrosProduccionPeriodo,
  ProduccionOtRow,
  ProduccionMesRow,
  ReporteProduccionPeriodoResult,
  FiltrosCosteoComparativo,
  CosteoComparativoRow,
  ReporteCosteoComparativoResult,
} from './reportes-produccion-helpers';
import { labelMes } from './reportes-produccion-helpers';

async function sbReadonly() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as { from: (t: string) => any; auth: typeof sb.auth };
}

// ============================================================================
// A) PRODUCCIÓN POR PERÍODO
// ============================================================================
export async function reporteProduccionPeriodo(
  f: FiltrosProduccionPeriodo,
): Promise<ReporteProduccionPeriodoResult> {
  const sb = await sbReadonly();

  // 1) OTs cerradas en el rango
  const { data: otsRaw } = await sb
    .from('ot')
    .select('id, numero, estado, fecha_apertura, fecha_cierre')
    .gte('fecha_cierre', f.desde)
    .lte('fecha_cierre', f.hasta)
    .not('fecha_cierre', 'is', null)
    .order('fecha_cierre', { ascending: false });
  type OT = { id: string; numero: string; estado: string; fecha_apertura: string; fecha_cierre: string };
  const ots = (otsRaw ?? []) as OT[];
  const otIds = ots.map((o) => o.id);
  if (otIds.length === 0) {
    return {
      metricas: {
        cantidad_ots: 0, unidades_terminadas: 0, unidades_falladas: 0,
        tasa_fallas_pct: 0, costo_total: 0, tiempo_horas_total: 0,
      },
      por_mes: [], por_ot: [],
    };
  }

  // 2) Líneas OT (unidades + producto)
  const { data: lineasRaw } = await sb
    .from('ot_lineas')
    .select('ot_id, cantidad_planificada, cantidad_terminada, cantidad_fallas, producto:producto_id(nombre)')
    .in('ot_id', otIds);
  type LR = { ot_id: string; cantidad_planificada: number; cantidad_terminada: number; cantidad_fallas: number; producto: { nombre: string } | null };
  const lineas = (lineasRaw ?? []) as unknown as LR[];

  // 3) Materiales consumidos (SALIDA_PRODUCCION)
  const { data: kdxRaw } = await sb
    .from('kardex_movimientos')
    .select('referencia_id, costo_total')
    .eq('tipo', 'SALIDA_PRODUCCION')
    .in('referencia_id', otIds);
  const costoMat = new Map<string, number>();
  for (const k of (kdxRaw ?? []) as { referencia_id: string; costo_total: number | string | null }[]) {
    costoMat.set(k.referencia_id, (costoMat.get(k.referencia_id) ?? 0) + Number(k.costo_total ?? 0));
  }

  // 4) Servicios a talleres
  let osQuery = sb.from('ordenes_servicio')
    .select('ot_id, monto_total, taller_id')
    .in('ot_id', otIds);
  if (f.taller_id) osQuery = osQuery.eq('taller_id', f.taller_id);
  const { data: osRaw } = await osQuery;
  const costoServ = new Map<string, number>();
  for (const o of (osRaw ?? []) as { ot_id: string; monto_total: number | string | null }[]) {
    costoServ.set(o.ot_id, (costoServ.get(o.ot_id) ?? 0) + Number(o.monto_total ?? 0));
  }

  // 5) Tiempos internos
  const { data: tmpRaw } = await sb
    .from('ot_registros_tiempo')
    .select('ot_id, tiempo_total_min')
    .in('ot_id', otIds);
  const tiempoMin = new Map<string, number>();
  for (const t of (tmpRaw ?? []) as { ot_id: string; tiempo_total_min: number | string | null }[]) {
    tiempoMin.set(t.ot_id, (tiempoMin.get(t.ot_id) ?? 0) + Number(t.tiempo_total_min ?? 0));
  }

  // 6) Consolidar por OT
  const por_ot: ProduccionOtRow[] = ots.map((ot) => {
    const otLineas = lineas.filter((l) => l.ot_id === ot.id);
    const producto_nombre = otLineas[0]?.producto?.nombre ?? '—';
    const uPlanif = otLineas.reduce((s, l) => s + (l.cantidad_planificada ?? 0), 0);
    const uTerm = otLineas.reduce((s, l) => s + (l.cantidad_terminada ?? 0), 0);
    const uFall = otLineas.reduce((s, l) => s + (l.cantidad_fallas ?? 0), 0);
    const cMat = costoMat.get(ot.id) ?? 0;
    const cServ = costoServ.get(ot.id) ?? 0;
    const cTotal = cMat + cServ;
    return {
      ot_id: ot.id,
      ot_numero: ot.numero,
      fecha_apertura: ot.fecha_apertura,
      fecha_cierre: ot.fecha_cierre,
      producto_nombre,
      unidades_planificadas: uPlanif,
      unidades_terminadas: uTerm,
      unidades_falladas: uFall,
      costo_materiales: cMat,
      costo_servicios: cServ,
      costo_total: cTotal,
      costo_unitario: uTerm > 0 ? cTotal / uTerm : 0,
      tiempo_min_total: tiempoMin.get(ot.id) ?? 0,
    };
  });

  // 7) Agregar por mes
  const porMesMap = new Map<string, ProduccionMesRow>();
  for (const r of por_ot) {
    const mes = r.fecha_cierre.slice(0, 7);
    const cur = porMesMap.get(mes) ?? {
      mes, mes_label: labelMes(mes),
      cantidad_ots: 0, unidades_terminadas: 0, unidades_falladas: 0,
      costo_materiales: 0, costo_servicios: 0, costo_total: 0, tiempo_min_total: 0,
    };
    cur.cantidad_ots += 1;
    cur.unidades_terminadas += r.unidades_terminadas;
    cur.unidades_falladas += r.unidades_falladas;
    cur.costo_materiales += r.costo_materiales;
    cur.costo_servicios += r.costo_servicios;
    cur.costo_total += r.costo_total;
    cur.tiempo_min_total += r.tiempo_min_total;
    porMesMap.set(mes, cur);
  }
  const por_mes = Array.from(porMesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));

  const unidadesTerm = por_ot.reduce((s, r) => s + r.unidades_terminadas, 0);
  const unidadesFall = por_ot.reduce((s, r) => s + r.unidades_falladas, 0);
  const costoTotal = por_ot.reduce((s, r) => s + r.costo_total, 0);
  const tiempoTotal = por_ot.reduce((s, r) => s + r.tiempo_min_total, 0);

  return {
    metricas: {
      cantidad_ots: por_ot.length,
      unidades_terminadas: unidadesTerm,
      unidades_falladas: unidadesFall,
      tasa_fallas_pct: (unidadesTerm + unidadesFall) > 0
        ? (unidadesFall / (unidadesTerm + unidadesFall)) * 100 : 0,
      costo_total: costoTotal,
      tiempo_horas_total: tiempoTotal / 60,
    },
    por_mes,
    por_ot,
  };
}

// ============================================================================
// B) COMPARATIVO COTIZACIÓN vs REAL
// ============================================================================
export async function reporteCosteoComparativo(
  f: FiltrosCosteoComparativo,
): Promise<ReporteCosteoComparativoResult> {
  const sb = await sbReadonly();

  const { data: otsRaw } = await sb
    .from('ot')
    .select('id, numero, fecha_cierre')
    .gte('fecha_cierre', f.desde)
    .lte('fecha_cierre', f.hasta)
    .not('fecha_cierre', 'is', null);
  type OT = { id: string; numero: string; fecha_cierre: string };
  const ots = (otsRaw ?? []) as OT[];
  const otIds = ots.map((o) => o.id);
  if (otIds.length === 0) {
    return {
      metricas: {
        cantidad_ots: 0, cotizado_total: 0, real_total: 0, diferencia_total: 0,
        desviacion_promedio_pct: 0, ots_sobre_presupuesto: 0, ots_bajo_presupuesto: 0,
      },
      rows: [],
    };
  }

  let linQuery = sb
    .from('ot_lineas')
    .select('ot_id, producto_id, talla, cantidad_terminada, productos:producto_id(nombre)')
    .in('ot_id', otIds);
  if (f.producto_id) linQuery = linQuery.eq('producto_id', f.producto_id);
  const { data: lineasRaw } = await linQuery;
  type LR = { ot_id: string; producto_id: string; talla: string; cantidad_terminada: number; productos: { nombre: string } | null };
  const lineas = (lineasRaw ?? []) as unknown as LR[];

  const productoIds = Array.from(new Set(lineas.map((l) => l.producto_id)));

  // Costos teóricos por (producto, talla)
  const { data: costoMatRaw } = await sb
    .from('v_costo_materiales_producto')
    .select('producto_id, talla, costo_materiales')
    .in('producto_id', productoIds);
  const costoMatMap = new Map<string, number>();
  for (const c of (costoMatRaw ?? []) as { producto_id: string; talla: string; costo_materiales: number | string }[]) {
    costoMatMap.set(`${c.producto_id}::${c.talla}`, Number(c.costo_materiales ?? 0));
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: tarifasRaw } = await sb
    .from('tarifas_servicios')
    .select('producto_id, talla, precio_unitario, vigente_desde, vigente_hasta')
    .in('producto_id', productoIds)
    .lte('vigente_desde', hoy);
  const tarifaMap = new Map<string, number>();
  for (const t of (tarifasRaw ?? []) as { producto_id: string; talla: string; precio_unitario: number | string; vigente_hasta: string | null }[]) {
    if (t.vigente_hasta && t.vigente_hasta < hoy) continue;
    const k = `${t.producto_id}::${t.talla}`;
    tarifaMap.set(k, (tarifaMap.get(k) ?? 0) + Number(t.precio_unitario ?? 0));
  }

  // Costos reales
  const { data: kdxRaw } = await sb
    .from('kardex_movimientos')
    .select('referencia_id, costo_total')
    .eq('tipo', 'SALIDA_PRODUCCION')
    .in('referencia_id', otIds);
  const realMat = new Map<string, number>();
  for (const k of (kdxRaw ?? []) as { referencia_id: string; costo_total: number | string | null }[]) {
    realMat.set(k.referencia_id, (realMat.get(k.referencia_id) ?? 0) + Number(k.costo_total ?? 0));
  }
  const { data: osRaw } = await sb
    .from('ordenes_servicio')
    .select('ot_id, monto_total')
    .in('ot_id', otIds);
  const realServ = new Map<string, number>();
  for (const o of (osRaw ?? []) as { ot_id: string; monto_total: number | string | null }[]) {
    realServ.set(o.ot_id, (realServ.get(o.ot_id) ?? 0) + Number(o.monto_total ?? 0));
  }

  // Agregar por (OT, producto) — normalmente 1 producto por OT
  type Acc = {
    ot_id: string; ot_numero: string; fecha_cierre: string;
    producto_id: string; producto_nombre: string;
    unidades_terminadas: number;
    cotizado_materiales: number; cotizado_servicios: number;
  };
  const accMap = new Map<string, Acc>();
  for (const l of lineas) {
    const otMeta = ots.find((o) => o.id === l.ot_id);
    if (!otMeta) continue;
    const key = `${l.ot_id}::${l.producto_id}`;
    const cur = accMap.get(key) ?? {
      ot_id: l.ot_id, ot_numero: otMeta.numero, fecha_cierre: otMeta.fecha_cierre,
      producto_id: l.producto_id, producto_nombre: l.productos?.nombre ?? '—',
      unidades_terminadas: 0, cotizado_materiales: 0, cotizado_servicios: 0,
    };
    const cMat = costoMatMap.get(`${l.producto_id}::${l.talla}`) ?? 0;
    const cTar = tarifaMap.get(`${l.producto_id}::${l.talla}`) ?? 0;
    const uTerm = l.cantidad_terminada ?? 0;
    cur.unidades_terminadas += uTerm;
    cur.cotizado_materiales += cMat * uTerm;
    cur.cotizado_servicios += cTar * uTerm;
    accMap.set(key, cur);
  }

  const rows: CosteoComparativoRow[] = Array.from(accMap.values()).map((a) => {
    const cotTotal = a.cotizado_materiales + a.cotizado_servicios;
    // Prorrateo de costo real por producto dentro del OT (raro que haya varios;
    // si hay, se atribuye proporcional a unidades)
    const realTotal = (realMat.get(a.ot_id) ?? 0) + (realServ.get(a.ot_id) ?? 0);
    const diferencia = realTotal - cotTotal;
    const desviacion = cotTotal > 0 ? (diferencia / cotTotal) * 100 : 0;
    return {
      ot_id: a.ot_id, ot_numero: a.ot_numero, fecha_cierre: a.fecha_cierre,
      producto_id: a.producto_id, producto_nombre: a.producto_nombre,
      unidades_terminadas: a.unidades_terminadas,
      cotizado_materiales: a.cotizado_materiales,
      cotizado_servicios: a.cotizado_servicios,
      cotizado_total: cotTotal,
      cotizado_unitario: a.unidades_terminadas > 0 ? cotTotal / a.unidades_terminadas : 0,
      real_materiales: realMat.get(a.ot_id) ?? 0,
      real_servicios: realServ.get(a.ot_id) ?? 0,
      real_total: realTotal,
      real_unitario: a.unidades_terminadas > 0 ? realTotal / a.unidades_terminadas : 0,
      diferencia, desviacion_pct: desviacion,
    };
  }).sort((a, b) => Math.abs(b.desviacion_pct) - Math.abs(a.desviacion_pct));

  const totalCot = rows.reduce((s, r) => s + r.cotizado_total, 0);
  const totalReal = rows.reduce((s, r) => s + r.real_total, 0);
  const desviacionProm = rows.length > 0
    ? rows.reduce((s, r) => s + r.desviacion_pct, 0) / rows.length : 0;

  return {
    metricas: {
      cantidad_ots: rows.length,
      cotizado_total: totalCot,
      real_total: totalReal,
      diferencia_total: totalReal - totalCot,
      desviacion_promedio_pct: desviacionProm,
      ots_sobre_presupuesto: rows.filter((r) => r.diferencia > 0).length,
      ots_bajo_presupuesto: rows.filter((r) => r.diferencia < 0).length,
    },
    rows,
  };
}
