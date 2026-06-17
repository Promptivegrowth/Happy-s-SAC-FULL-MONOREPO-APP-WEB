'use server';

import { createClient } from '@happy/db/server';
import {
  deltaPct,
  periodoAnterior,
  rangoDias,
  toISODate,
} from './dashboard-helpers';

// ----- Tipos públicos -----

export type KpiComparativo = {
  actual: number;
  anterior: number;
  delta_pct: number;
};

export type DashboardData = {
  periodo: { desde: string; hasta: string; dias: number };
  kpis: {
    ventas: KpiComparativo;
    ticket_promedio: KpiComparativo;
    comprobantes: KpiComparativo;
    ots_activas: { actual: number };
    ots_completadas: KpiComparativo;
    unidades_producidas: KpiComparativo;
    stock_critico: { count: number };
    reclamos_pendientes: { count: number; vencidos: number };
  };
  curva_s: { dias: { fecha: string; real_acum: number; plan_acum: number }[] };
  ventas_por_dia: {
    actual: { fecha: string; monto: number }[];
    anterior: { fecha: string; monto: number }[];
  };
  por_canal: { canal: string; monto: number; count: number }[];
  top_productos: { nombre: string; unidades: number; monto: number }[];
  ots_por_estado: { estado: string; count: number }[];
};

// ----- Loader -----

export async function loadDashboard(periodo: { desde: string; hasta: string }): Promise<DashboardData> {
  const sb = await createClient();

  const desde = new Date(periodo.desde);
  const hasta = new Date(periodo.hasta);
  const ant = periodoAnterior(desde, hasta);
  const dias = Math.max(1, Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1);

  // Lanzar TODAS las queries en paralelo
  const [
    ventasActQ,
    ventasAntQ,
    otsActivasQ,
    otsCompletadasActQ,
    otsCompletadasAntQ,
    ingresosActQ,
    ingresosAntQ,
    stockCriticoQ,
    reclamosQ,
    canalQ,
    topProductosQ,
    otsEstadoQ,
    planLineasQ,
    otsConFechaEntregaQ,
  ] = await Promise.all([
    sb.from('ventas').select('fecha,total,canal').gte('fecha', periodo.desde).lte('fecha', periodo.hasta).eq('estado', 'COMPLETADA').limit(20000),
    sb.from('ventas').select('fecha,total').gte('fecha', ant.desdeIso).lte('fecha', ant.hastaIso).eq('estado', 'COMPLETADA').limit(20000),
    sb.from('ot').select('id', { count: 'exact', head: true }).not('estado', 'in', '("COMPLETADA","CANCELADA")'),
    sb.from('ot').select('id', { count: 'exact', head: true }).eq('estado', 'COMPLETADA').gte('fecha_cierre', toISODate(desde)).lte('fecha_cierre', toISODate(hasta)),
    sb.from('ot').select('id', { count: 'exact', head: true }).eq('estado', 'COMPLETADA').gte('fecha_cierre', toISODate(ant.desde)).lte('fecha_cierre', toISODate(ant.hasta)),
    sb.from('ingresos_pt').select('fecha, ingresos_pt_lineas(cantidad)').gte('fecha', periodo.desde).lte('fecha', periodo.hasta).limit(5000),
    sb.from('ingresos_pt').select('fecha, ingresos_pt_lineas(cantidad)').gte('fecha', ant.desdeIso).lte('fecha', ant.hastaIso).limit(5000),
    sb.from('v_stock_alertas').select('almacen_id', { count: 'exact', head: true }),
    sb.from('reclamos').select('id,fecha,estado').in('estado', ['NUEVO', 'EN_REVISION']).limit(2000),
    sb.from('ventas').select('canal,total').gte('fecha', periodo.desde).lte('fecha', periodo.hasta).eq('estado', 'COMPLETADA').limit(20000),
    sb.from('v_top_productos').select('producto, unidades_vendidas, monto_total').limit(10),
    sb.from('ot').select('estado'),
    sb.from('plan_maestro_lineas').select('cantidad_planificada, plan_maestro!inner(fecha_inicio, fecha_fin)').gte('plan_maestro.fecha_fin', toISODate(desde)).lte('plan_maestro.fecha_inicio', toISODate(hasta)).limit(2000),
    sb.from('ot').select('fecha_apertura,fecha_entrega_objetivo,ot_lineas(cantidad_planificada)').not('fecha_entrega_objetivo', 'is', null).not('estado', 'eq', 'CANCELADA').gte('fecha_entrega_objetivo', toISODate(desde)).lte('fecha_apertura', toISODate(hasta)).limit(500),
  ]);

  // ----- KPIs ventas -----
  const ventasAct = (ventasActQ.data ?? []) as { fecha: string; total: number; canal: string }[];
  const ventasAnt = (ventasAntQ.data ?? []) as { fecha: string; total: number }[];
  const sumAct = ventasAct.reduce((a, v) => a + Number(v.total ?? 0), 0);
  const sumAnt = ventasAnt.reduce((a, v) => a + Number(v.total ?? 0), 0);
  const countAct = ventasAct.length;
  const countAnt = ventasAnt.length;
  const ticketAct = countAct > 0 ? sumAct / countAct : 0;
  const ticketAnt = countAnt > 0 ? sumAnt / countAnt : 0;

  // ----- KPIs OTs -----
  const otsActivasCount = otsActivasQ.count ?? 0;
  const otsCompAct = otsCompletadasActQ.count ?? 0;
  const otsCompAnt = otsCompletadasAntQ.count ?? 0;

  // ----- KPIs producción (unidades) -----
  const sumIngresos = (rows: { ingresos_pt_lineas: { cantidad: number }[] | null }[]) =>
    rows.reduce((acc, r) => acc + (r.ingresos_pt_lineas ?? []).reduce((s, l) => s + Number(l.cantidad ?? 0), 0), 0);
  type IngresoRow = { fecha: string; ingresos_pt_lineas: { cantidad: number }[] | null };
  const ingActRows = (ingresosActQ.data ?? []) as IngresoRow[];
  const ingAntRows = (ingresosAntQ.data ?? []) as IngresoRow[];
  const unidadesAct = sumIngresos(ingActRows);
  const unidadesAnt = sumIngresos(ingAntRows);

  // ----- Reclamos pendientes -----
  type ReclamoRow = { id: string; fecha: string; estado: string };
  const reclamos = (reclamosQ.data ?? []) as ReclamoRow[];
  const ahora = Date.now();
  const QUINCE_D = 15 * 86400000;
  const reclamosVencidos = reclamos.filter((r) => ahora - new Date(r.fecha).getTime() > QUINCE_D).length;

  // ----- Curva S -----
  const fechas = rangoDias(desde, hasta);
  const realPorDia = new Map<string, number>();
  for (const r of ingActRows) {
    const dia = r.fecha ? toISODate(new Date(r.fecha)) : '';
    if (!dia) continue;
    const qty = (r.ingresos_pt_lineas ?? []).reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
    realPorDia.set(dia, (realPorDia.get(dia) ?? 0) + qty);
  }

  // Plan total: si hay plan_maestro_lineas activas en el rango → suma; si no, usa
  // la suma de cantidad_planificada de OTs con fecha_entrega_objetivo en el rango
  // como fallback. Se reparte linealmente sobre los días del rango.
  type PlanLineaRow = { cantidad_planificada: number; plan_maestro: { fecha_inicio: string; fecha_fin: string } | null };
  const planLineas = (planLineasQ.data ?? []) as PlanLineaRow[];
  let planTotal = planLineas.reduce((a, l) => a + Number(l.cantidad_planificada ?? 0), 0);
  if (planTotal === 0) {
    type OtFechaRow = { fecha_apertura: string; fecha_entrega_objetivo: string | null; ot_lineas: { cantidad_planificada: number }[] | null };
    const otsFechas = (otsConFechaEntregaQ.data ?? []) as OtFechaRow[];
    planTotal = otsFechas.reduce(
      (a, o) => a + (o.ot_lineas ?? []).reduce((s, l) => s + Number(l.cantidad_planificada ?? 0), 0),
      0,
    );
  }
  const planPorDia = planTotal > 0 ? planTotal / fechas.length : 0;

  let realAcum = 0;
  let planAcum = 0;
  const curva: { fecha: string; real_acum: number; plan_acum: number }[] = fechas.map((f) => {
    realAcum += realPorDia.get(f) ?? 0;
    planAcum += planPorDia;
    return { fecha: f, real_acum: realAcum, plan_acum: Math.round(planAcum) };
  });

  // ----- Ventas por día (actual vs anterior) -----
  const porDiaActMap = new Map<string, number>();
  for (const v of ventasAct) {
    const dia = v.fecha ? toISODate(new Date(v.fecha)) : '';
    if (!dia) continue;
    porDiaActMap.set(dia, (porDiaActMap.get(dia) ?? 0) + Number(v.total ?? 0));
  }
  const porDiaAntMap = new Map<string, number>();
  for (const v of ventasAnt) {
    const dia = v.fecha ? toISODate(new Date(v.fecha)) : '';
    if (!dia) continue;
    porDiaAntMap.set(dia, (porDiaAntMap.get(dia) ?? 0) + Number(v.total ?? 0));
  }
  const ventasDiaActual = fechas.map((f) => ({ fecha: f, monto: porDiaActMap.get(f) ?? 0 }));
  const fechasAnt = rangoDias(ant.desde, ant.hasta);
  const ventasDiaAnterior = fechasAnt.map((f) => ({ fecha: f, monto: porDiaAntMap.get(f) ?? 0 }));

  // ----- Por canal -----
  type CanalRow = { canal: string; total: number };
  const canalRows = (canalQ.data ?? []) as CanalRow[];
  const canalAgg = new Map<string, { monto: number; count: number }>();
  for (const r of canalRows) {
    const cur = canalAgg.get(r.canal) ?? { monto: 0, count: 0 };
    cur.monto += Number(r.total ?? 0);
    cur.count += 1;
    canalAgg.set(r.canal, cur);
  }
  const porCanal = Array.from(canalAgg.entries()).map(([canal, v]) => ({ canal, monto: v.monto, count: v.count }));

  // ----- Top productos -----
  const topProductos = ((topProductosQ.data ?? []) as { producto: string; unidades_vendidas: number; monto_total: number }[]).map((t) => ({
    nombre: t.producto ?? '',
    unidades: Number(t.unidades_vendidas ?? 0),
    monto: Number(t.monto_total ?? 0),
  }));

  // ----- OTs por estado -----
  const estadoAgg = new Map<string, number>();
  for (const o of ((otsEstadoQ.data ?? []) as { estado: string }[])) {
    estadoAgg.set(o.estado, (estadoAgg.get(o.estado) ?? 0) + 1);
  }
  const otsPorEstado = Array.from(estadoAgg.entries()).map(([estado, count]) => ({ estado, count }));

  return {
    periodo: { desde: periodo.desde, hasta: periodo.hasta, dias },
    kpis: {
      ventas: { actual: sumAct, anterior: sumAnt, delta_pct: deltaPct(sumAct, sumAnt) },
      ticket_promedio: { actual: ticketAct, anterior: ticketAnt, delta_pct: deltaPct(ticketAct, ticketAnt) },
      comprobantes: { actual: countAct, anterior: countAnt, delta_pct: deltaPct(countAct, countAnt) },
      ots_activas: { actual: otsActivasCount },
      ots_completadas: { actual: otsCompAct, anterior: otsCompAnt, delta_pct: deltaPct(otsCompAct, otsCompAnt) },
      unidades_producidas: { actual: unidadesAct, anterior: unidadesAnt, delta_pct: deltaPct(unidadesAct, unidadesAnt) },
      stock_critico: { count: stockCriticoQ.count ?? 0 },
      reclamos_pendientes: { count: reclamos.length, vencidos: reclamosVencidos },
    },
    curva_s: { dias: curva },
    ventas_por_dia: { actual: ventasDiaActual, anterior: ventasDiaAnterior },
    por_canal: porCanal,
    top_productos: topProductos,
    ots_por_estado: otsPorEstado,
  };
}
