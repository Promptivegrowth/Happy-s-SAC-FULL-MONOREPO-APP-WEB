'use server';

/**
 * Server actions read-only para los 6 reportes del Hub.
 *
 * Cada función toma un objeto de filtros plano (strings/uuid opcionales) y
 * devuelve { metricas, rows, ... } directo (NO envuelto en ActionResult) para
 * que las páginas server-rendered los consuman fácil. Los errores Supabase se
 * tiran como Error y Next muestra el boundary correspondiente.
 *
 * IMPORTANTE: las queries usan límites altos (5000 filas) — pensadas para
 * rangos de mes/temporada. Para data sets más grandes, restringir el rango.
 */

import { createClient } from '@happy/db/server';
import { redirect } from 'next/navigation';
import {
  type CanalVenta,
  type EstadoOT,
  daysBetween,
  diffPct,
  rangoAnterior,
} from './reportes-helpers';

async function sbReadonly() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as { from: (t: string) => any; auth: typeof sb.auth };
}

// ============================================================================
// A) REPORTE DE VENTAS
// ============================================================================
export type FiltrosVentas = {
  desde: string;
  hasta: string;
  canal?: CanalVenta | '';
  almacen_id?: string;
  vendedor_id?: string;
};

export type VentaRow = {
  id: string;
  fecha: string;
  numero: string;
  canal: string;
  almacen: string;
  vendedor: string;
  cliente: string;
  total: number;
};

export type ReporteVentasResult = {
  metricas: {
    total_ventas: number;
    cantidad_comprobantes: number;
    ticket_promedio: number;
    pct_vs_anterior: number;
    total_anterior: number;
  };
  rows: VentaRow[];
};

export async function reporteVentas(f: FiltrosVentas): Promise<ReporteVentasResult> {
  const sb = await sbReadonly();
  let q = sb
    .from('ventas')
    .select(
      'id, numero, fecha, canal, total, estado, ' +
        'almacen:almacen_id(codigo, nombre), ' +
        'cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno), ' +
        'nombre_cliente_rapido, vendedor_usuario_id, vendedor_b2b_id',
    )
    .gte('fecha', `${f.desde}T00:00:00`)
    .lte('fecha', `${f.hasta}T23:59:59`)
    .neq('estado', 'ANULADA')
    .order('fecha', { ascending: false })
    .limit(5000);
  if (f.canal) q = q.eq('canal', f.canal);
  if (f.almacen_id) q = q.eq('almacen_id', f.almacen_id);
  if (f.vendedor_id) {
    q = q.or(`vendedor_usuario_id.eq.${f.vendedor_id},vendedor_b2b_id.eq.${f.vendedor_id}`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type VentaRaw = {
    id: string;
    numero: string;
    fecha: string;
    canal: string;
    total: string | number;
    almacen: { codigo: string; nombre: string } | null;
    cliente:
      | { razon_social: string | null; nombres: string | null; apellido_paterno: string | null; apellido_materno: string | null }
      | null;
    nombre_cliente_rapido: string | null;
    vendedor_usuario_id: string | null;
    vendedor_b2b_id: string | null;
  };

  const rows: VentaRow[] = ((data ?? []) as VentaRaw[]).map((v) => ({
    id: v.id,
    fecha: v.fecha,
    numero: v.numero,
    canal: v.canal,
    almacen: v.almacen ? `${v.almacen.codigo} · ${v.almacen.nombre}` : '—',
    vendedor: v.vendedor_usuario_id ?? v.vendedor_b2b_id ?? '—',
    cliente:
      v.cliente?.razon_social ||
      [v.cliente?.nombres, v.cliente?.apellido_paterno, v.cliente?.apellido_materno]
        .filter(Boolean)
        .join(' ') ||
      v.nombre_cliente_rapido ||
      '—',
    total: Number(v.total),
  }));

  const total_ventas = rows.reduce((s, r) => s + r.total, 0);
  const cant = rows.length;
  const ticket_promedio = cant > 0 ? total_ventas / cant : 0;

  // Comparativa con período anterior (mismo nº de días)
  const prev = rangoAnterior(f.desde, f.hasta);
  let qPrev = sb
    .from('ventas')
    .select('total', { count: 'exact', head: false })
    .gte('fecha', `${prev.desde}T00:00:00`)
    .lte('fecha', `${prev.hasta}T23:59:59`)
    .neq('estado', 'ANULADA');
  if (f.canal) qPrev = qPrev.eq('canal', f.canal);
  if (f.almacen_id) qPrev = qPrev.eq('almacen_id', f.almacen_id);
  const { data: prevData } = await qPrev;
  const total_anterior = ((prevData ?? []) as { total: number | string }[]).reduce(
    (s, r) => s + Number(r.total),
    0,
  );
  const pct_vs_anterior = diffPct(total_ventas, total_anterior);

  return {
    metricas: { total_ventas, cantidad_comprobantes: cant, ticket_promedio, pct_vs_anterior, total_anterior },
    rows,
  };
}

// ============================================================================
// B) PRODUCTOS MÁS VENDIDOS POR TEMPORADA / CATEGORÍA
// ============================================================================
export type FiltrosProductosTemporada = {
  desde: string;
  hasta: string;
  categoria_id?: string;
};

export type ProductoTemporadaRow = {
  ranking: number;
  producto_id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  unidades: number;
  monto: number;
  pct_del_total: number;
};

export type ReporteProductosTemporadaResult = {
  metricas: {
    total_unidades: number;
    total_ingresos: number;
    top1_pct_vs_resto: number;
    productos_distintos: number;
  };
  rows: ProductoTemporadaRow[];
};

export async function reporteProductosTemporada(
  f: FiltrosProductosTemporada,
): Promise<ReporteProductosTemporadaResult> {
  const sb = await sbReadonly();

  // 1) Trae líneas de venta del período (sin filtrar por categoría todavía)
  const { data: ventas, error: e1 } = await sb
    .from('ventas')
    .select('id, fecha, estado')
    .gte('fecha', `${f.desde}T00:00:00`)
    .lte('fecha', `${f.hasta}T23:59:59`)
    .neq('estado', 'ANULADA')
    .limit(20000);
  if (e1) throw new Error(e1.message);
  const ventaIds = ((ventas ?? []) as { id: string }[]).map((v) => v.id);
  if (ventaIds.length === 0) {
    return {
      metricas: { total_unidades: 0, total_ingresos: 0, top1_pct_vs_resto: 0, productos_distintos: 0 },
      rows: [],
    };
  }

  // 2) Líneas con variante → producto → categoría
  // Supabase IN limit ~1000 — partimos en chunks
  const chunks: string[][] = [];
  for (let i = 0; i < ventaIds.length; i += 500) chunks.push(ventaIds.slice(i, i + 500));

  type LineaRaw = {
    cantidad: number;
    sub_total: string | number;
    precio_unitario: string | number;
    variante: {
      producto: {
        id: string;
        codigo: string;
        nombre: string;
        categoria_id: string | null;
        categoria: { id: string; nombre: string } | null;
      } | null;
    } | null;
  };

  const allLineas: LineaRaw[] = [];
  for (const chunk of chunks) {
    const { data, error } = await sb
      .from('ventas_lineas')
      .select(
        'cantidad, sub_total, precio_unitario, ' +
          'variante:variante_id(producto:producto_id(id, codigo, nombre, categoria_id, categoria:categoria_id(id, nombre)))',
      )
      .in('venta_id', chunk);
    if (error) throw new Error(error.message);
    allLineas.push(...((data ?? []) as LineaRaw[]));
  }

  // 3) Agrupa por producto, filtra por categoría si aplica
  const acumulador = new Map<
    string,
    { codigo: string; nombre: string; categoria: string; categoria_id: string | null; unidades: number; monto: number }
  >();
  for (const l of allLineas) {
    const p = l.variante?.producto;
    if (!p) continue;
    if (f.categoria_id && p.categoria_id !== f.categoria_id) continue;
    const k = p.id;
    const sub = Number(l.sub_total) || Number(l.cantidad) * Number(l.precio_unitario);
    const e = acumulador.get(k) ?? {
      codigo: p.codigo,
      nombre: p.nombre,
      categoria: p.categoria?.nombre ?? '—',
      categoria_id: p.categoria_id,
      unidades: 0,
      monto: 0,
    };
    e.unidades += Number(l.cantidad);
    e.monto += sub;
    acumulador.set(k, e);
  }

  const total_unidades = [...acumulador.values()].reduce((s, e) => s + e.unidades, 0);
  const total_ingresos = [...acumulador.values()].reduce((s, e) => s + e.monto, 0);
  const ordenados = [...acumulador.entries()].sort((a, b) => b[1].unidades - a[1].unidades);
  const rows: ProductoTemporadaRow[] = ordenados.map(([id, e], i) => ({
    ranking: i + 1,
    producto_id: id,
    codigo: e.codigo,
    nombre: e.nombre,
    categoria: e.categoria,
    unidades: e.unidades,
    monto: e.monto,
    pct_del_total: total_unidades > 0 ? (e.unidades / total_unidades) * 100 : 0,
  }));

  const top1 = rows[0]?.unidades ?? 0;
  const resto = total_unidades - top1;
  const top1_pct_vs_resto = resto > 0 ? (top1 / resto) * 100 : 0;

  return {
    metricas: {
      total_unidades,
      total_ingresos,
      top1_pct_vs_resto,
      productos_distintos: rows.length,
    },
    rows,
  };
}

// ============================================================================
// C) RENTABILIDAD POR MODELO
// ============================================================================
export type FiltrosRentabilidad = {
  desde: string;
  hasta: string;
  categoria_id?: string;
};

export type RentabilidadRow = {
  producto_id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  unidades: number;
  precio_promedio: number;
  costo_materiales: number;
  costo_mano_obra: number;
  costo_total: number;
  ingreso: number;
  margen_unitario: number;
  margen_pct: number;
};

export type ReporteRentabilidadResult = {
  metricas: {
    ingreso_total: number;
    costo_total: number;
    margen_total: number;
    margen_promedio_pct: number;
  };
  rows: RentabilidadRow[];
};

export async function reporteRentabilidad(f: FiltrosRentabilidad): Promise<ReporteRentabilidadResult> {
  // Reutilizamos el agregado de productos vendidos en el período, y calculamos costo.
  const ventasAgg = await reporteProductosTemporada({
    desde: f.desde,
    hasta: f.hasta,
    categoria_id: f.categoria_id,
  });
  const sb = await sbReadonly();
  if (ventasAgg.rows.length === 0) {
    return { metricas: { ingreso_total: 0, costo_total: 0, margen_total: 0, margen_promedio_pct: 0 }, rows: [] };
  }

  const prodIds = ventasAgg.rows.map((r) => r.producto_id);
  const chunks: string[][] = [];
  for (let i = 0; i < prodIds.length; i += 200) chunks.push(prodIds.slice(i, i + 200));

  // --- Costo de materiales (suma de recetas_lineas activas más recientes por producto) ---
  type RecRaw = {
    producto_id: string;
    activa: boolean;
    creado_en: string;
    recetas_lineas: { cantidad: string | number; material: { precio_unitario: string | number } | null }[] | null;
  };
  const costoMatPorProducto = new Map<string, number>();
  for (const chunk of chunks) {
    const { data, error } = await sb
      .from('recetas')
      .select('producto_id, activa, creado_en, recetas_lineas(cantidad, material:material_id(precio_unitario))')
      .in('producto_id', chunk)
      .eq('activa', true);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as RecRaw[]) {
      const total =
        (r.recetas_lineas ?? []).reduce(
          (s, l) => s + Number(l.cantidad) * Number(l.material?.precio_unitario ?? 0),
          0,
        ) || 0;
      // Si hay varias recetas activas (no debería), tomamos el promedio
      const prev = costoMatPorProducto.get(r.producto_id);
      costoMatPorProducto.set(r.producto_id, prev === undefined ? total : (prev + total) / 2);
    }
  }

  // --- Costo MO: productos_procesos.tiempo_estandar_min × areas_produccion.valor_minuto ---
  type ProcRaw = {
    producto_id: string;
    tiempo_estandar_min: string | number | null;
    area: { valor_minuto: string | number | null } | null;
  };
  const costoMOPorProducto = new Map<string, number>();
  for (const chunk of chunks) {
    const { data, error } = await sb
      .from('productos_procesos')
      .select('producto_id, tiempo_estandar_min, area:area_id(valor_minuto)')
      .in('producto_id', chunk);
    if (error) throw new Error(error.message);
    for (const p of (data ?? []) as ProcRaw[]) {
      const t = Number(p.tiempo_estandar_min ?? 0);
      const v = Number(p.area?.valor_minuto ?? 0);
      const subtotal = t * v;
      costoMOPorProducto.set(p.producto_id, (costoMOPorProducto.get(p.producto_id) ?? 0) + subtotal);
    }
  }

  const rows: RentabilidadRow[] = ventasAgg.rows.map((r) => {
    const costo_materiales = costoMatPorProducto.get(r.producto_id) ?? 0;
    const costo_mano_obra = costoMOPorProducto.get(r.producto_id) ?? 0;
    const costo_unit = costo_materiales + costo_mano_obra;
    const costo_total = costo_unit * r.unidades;
    const precio_promedio = r.unidades > 0 ? r.monto / r.unidades : 0;
    const margen_unitario = precio_promedio - costo_unit;
    const margen_pct = precio_promedio > 0 ? (margen_unitario / precio_promedio) * 100 : 0;
    return {
      producto_id: r.producto_id,
      codigo: r.codigo,
      nombre: r.nombre,
      categoria: r.categoria,
      unidades: r.unidades,
      precio_promedio,
      costo_materiales,
      costo_mano_obra,
      costo_total,
      ingreso: r.monto,
      margen_unitario,
      margen_pct,
    };
  });

  rows.sort((a, b) => b.margen_pct - a.margen_pct);

  const ingreso_total = rows.reduce((s, r) => s + r.ingreso, 0);
  const costo_total = rows.reduce((s, r) => s + r.costo_total, 0);
  const margen_total = ingreso_total - costo_total;
  const margen_promedio_pct = ingreso_total > 0 ? (margen_total / ingreso_total) * 100 : 0;

  return {
    metricas: { ingreso_total, costo_total, margen_total, margen_promedio_pct },
    rows,
  };
}

// ============================================================================
// D) PRODUCTIVIDAD POR OPERARIO Y TALLER
// ============================================================================
export type FiltrosProductividad = {
  desde: string;
  hasta: string;
  operario_id?: string;
  taller_id?: string;
  area_id?: string;
};

export type ProductividadOperarioRow = {
  operario_id: string;
  codigo: string;
  nombre: string;
  area: string;
  minutos_reales: number;
  minutos_estandar: number;
  cantidad: number;
  fallas: number;
  eficiencia_pct: number;
  pct_fallas: number;
};

export type ProductividadTallerRow = {
  taller_id: string;
  codigo: string;
  nombre: string;
  ordenes: number;
  unidades_terminadas: number;
  monto_pagado: number;
};

export type ReporteProductividadResult = {
  metricas: {
    minutos_totales: number;
    eficiencia_promedio_pct: number;
    pct_fallas_global: number;
    operarios_activos: number;
    talleres_activos: number;
  };
  por_operario: ProductividadOperarioRow[];
  por_taller: ProductividadTallerRow[];
};

export async function reporteProductividad(f: FiltrosProductividad): Promise<ReporteProductividadResult> {
  const sb = await sbReadonly();

  // --- Operarios: tickets_operacion en rango ---
  type TicketRaw = {
    operario_id: string | null;
    producto_id: string | null;
    cantidad: number | null;
    duracion_min: string | number | null;
    proceso: string | null;
    operario: { codigo: string; nombres: string; apellido_paterno: string | null; area: { codigo: string; nombre: string } | null } | null;
  };
  let qT = sb
    .from('tickets_operacion')
    .select(
      'operario_id, producto_id, cantidad, duracion_min, proceso, ' +
        'operario:operario_id(codigo, nombres, apellido_paterno, area:area_id(codigo, nombre))',
    )
    .gte('inicio', `${f.desde}T00:00:00`)
    .lte('inicio', `${f.hasta}T23:59:59`)
    .not('operario_id', 'is', null)
    .not('fin', 'is', null)
    .limit(20000);
  if (f.operario_id) qT = qT.eq('operario_id', f.operario_id);
  const { data: tickets, error: et } = await qT;
  if (et) throw new Error(et.message);

  // Mapa de tiempos estándar por (producto, proceso) — opcional para eficiencia
  type EstRaw = { producto_id: string; proceso: string; tiempo_estandar_min: string | number | null };
  let estPorClave = new Map<string, number>();
  const prodIdsSet = new Set<string>();
  for (const t of (tickets ?? []) as TicketRaw[]) {
    if (t.producto_id) prodIdsSet.add(t.producto_id);
  }
  if (prodIdsSet.size > 0) {
    const prodIds = [...prodIdsSet];
    const chunks: string[][] = [];
    for (let i = 0; i < prodIds.length; i += 300) chunks.push(prodIds.slice(i, i + 300));
    estPorClave = new Map();
    for (const chunk of chunks) {
      const { data } = await sb
        .from('productos_procesos')
        .select('producto_id, proceso, tiempo_estandar_min')
        .in('producto_id', chunk);
      for (const r of (data ?? []) as EstRaw[]) {
        estPorClave.set(`${r.producto_id}|${r.proceso}`, Number(r.tiempo_estandar_min ?? 0));
      }
    }
  }

  const operariosMap = new Map<string, ProductividadOperarioRow>();
  for (const t of (tickets ?? []) as TicketRaw[]) {
    if (!t.operario_id) continue;
    const min = Number(t.duracion_min ?? 0);
    const cant = Number(t.cantidad ?? 0);
    const estUnit = t.producto_id && t.proceso ? estPorClave.get(`${t.producto_id}|${t.proceso}`) ?? 0 : 0;
    const e =
      operariosMap.get(t.operario_id) ??
      ({
        operario_id: t.operario_id,
        codigo: t.operario?.codigo ?? '—',
        nombre: [t.operario?.nombres, t.operario?.apellido_paterno].filter(Boolean).join(' ') || '—',
        area: t.operario?.area ? `${t.operario.area.codigo}` : '—',
        minutos_reales: 0,
        minutos_estandar: 0,
        cantidad: 0,
        fallas: 0,
        eficiencia_pct: 0,
        pct_fallas: 0,
      } as ProductividadOperarioRow);
    e.minutos_reales += min;
    e.minutos_estandar += estUnit * cant;
    e.cantidad += cant;
    operariosMap.set(t.operario_id, e);
  }

  // --- Fallas por operario: ot_eventos type FALLA con operario_id (si existe) ---
  // No siempre está poblado — dejamos 0 si no hay datos
  for (const e of operariosMap.values()) {
    e.eficiencia_pct = e.minutos_reales > 0 ? (e.minutos_estandar / e.minutos_reales) * 100 : 0;
    e.pct_fallas = e.cantidad > 0 ? (e.fallas / e.cantidad) * 100 : 0;
  }
  const por_operario = [...operariosMap.values()].sort((a, b) => b.minutos_reales - a.minutos_reales);

  // --- Talleres: órdenes_servicio en rango + pagos_talleres ---
  type OSRaw = {
    taller_id: string;
    fecha_emision: string | null;
    cantidad_total_prendas: number | null;
    taller: { codigo: string | null; nombre: string } | null;
  };
  let qOS = sb
    .from('ordenes_servicio')
    .select('taller_id, fecha_emision, cantidad_total_prendas, taller:taller_id(codigo, nombre)')
    .gte('fecha_emision', f.desde)
    .lte('fecha_emision', f.hasta)
    .limit(10000);
  if (f.taller_id) qOS = qOS.eq('taller_id', f.taller_id);
  const { data: oss } = await qOS;

  const talleresMap = new Map<string, ProductividadTallerRow>();
  for (const os of ((oss ?? []) as OSRaw[])) {
    if (!os.taller_id) continue;
    const e =
      talleresMap.get(os.taller_id) ??
      ({
        taller_id: os.taller_id,
        codigo: os.taller?.codigo ?? '—',
        nombre: os.taller?.nombre ?? '—',
        ordenes: 0,
        unidades_terminadas: 0,
        monto_pagado: 0,
      } as ProductividadTallerRow);
    e.ordenes += 1;
    e.unidades_terminadas += Number(os.cantidad_total_prendas ?? 0);
    talleresMap.set(os.taller_id, e);
  }

  if (talleresMap.size > 0) {
    const tallerIds = [...talleresMap.keys()];
    let qP = sb
      .from('pagos_talleres')
      .select('taller_id, monto')
      .gte('fecha', f.desde)
      .lte('fecha', f.hasta)
      .in('taller_id', tallerIds)
      .limit(10000);
    if (f.taller_id) qP = qP.eq('taller_id', f.taller_id);
    const { data: pagos } = await qP;
    for (const p of ((pagos ?? []) as { taller_id: string; monto: string | number }[])) {
      const e = talleresMap.get(p.taller_id);
      if (e) e.monto_pagado += Number(p.monto);
    }
  }
  const por_taller = [...talleresMap.values()].sort((a, b) => b.unidades_terminadas - a.unidades_terminadas);

  // --- Métricas globales ---
  const minutos_totales = por_operario.reduce((s, e) => s + e.minutos_reales, 0);
  const min_est_total = por_operario.reduce((s, e) => s + e.minutos_estandar, 0);
  const eficiencia_promedio_pct = minutos_totales > 0 ? (min_est_total / minutos_totales) * 100 : 0;
  const cantidad_total = por_operario.reduce((s, e) => s + e.cantidad, 0);
  const fallas_total = por_operario.reduce((s, e) => s + e.fallas, 0);
  const pct_fallas_global = cantidad_total > 0 ? (fallas_total / cantidad_total) * 100 : 0;

  return {
    metricas: {
      minutos_totales,
      eficiencia_promedio_pct,
      pct_fallas_global,
      operarios_activos: por_operario.length,
      talleres_activos: por_taller.length,
    },
    por_operario,
    por_taller,
  };
}

// ============================================================================
// E) REPORTE DE OTs
// ============================================================================
export type FiltrosOTs = {
  desde: string;
  hasta: string;
  estado?: EstadoOT | '';
  responsable_id?: string;
};

export type OTRow = {
  id: string;
  numero: string;
  producto: string;
  fecha_apertura: string;
  fecha_entrega_objetivo: string | null;
  estado: string;
  dias_en_proceso: number;
  atrasada: boolean;
};

export type ReporteOTsResult = {
  metricas: {
    total: number;
    por_estado: Record<string, number>;
    atrasadas: number;
    completadas: number;
  };
  rows: OTRow[];
};

export async function reporteOTs(f: FiltrosOTs): Promise<ReporteOTsResult> {
  const sb = await sbReadonly();
  let q = sb
    .from('ot')
    .select(
      'id, numero, estado, fecha_apertura, fecha_cierre, fecha_entrega_objetivo, responsable_usuario_id, ' +
        'ot_lineas(producto:producto_id(codigo, nombre))',
    )
    .gte('fecha_apertura', f.desde)
    .lte('fecha_apertura', f.hasta)
    .order('fecha_apertura', { ascending: false })
    .limit(5000);
  if (f.estado) q = q.eq('estado', f.estado);
  if (f.responsable_id) q = q.eq('responsable_usuario_id', f.responsable_id);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type OTRaw = {
    id: string;
    numero: string;
    estado: string;
    fecha_apertura: string;
    fecha_cierre: string | null;
    fecha_entrega_objetivo: string | null;
    ot_lineas: { producto: { codigo: string; nombre: string } | null }[] | null;
  };

  const hoy = new Date().toISOString().slice(0, 10);
  const rows: OTRow[] = ((data ?? []) as OTRaw[]).map((o) => {
    const prod = o.ot_lineas?.[0]?.producto;
    const fin = o.fecha_cierre || hoy;
    const dias = daysBetween(o.fecha_apertura, fin);
    const atrasada =
      o.estado !== 'COMPLETADA' &&
      o.estado !== 'CANCELADA' &&
      !!o.fecha_entrega_objetivo &&
      o.fecha_entrega_objetivo < hoy;
    return {
      id: o.id,
      numero: o.numero,
      producto: prod ? `${prod.codigo} · ${prod.nombre}` : '—',
      fecha_apertura: o.fecha_apertura,
      fecha_entrega_objetivo: o.fecha_entrega_objetivo,
      estado: o.estado,
      dias_en_proceso: Math.max(0, dias),
      atrasada,
    };
  });

  const por_estado: Record<string, number> = {};
  for (const r of rows) por_estado[r.estado] = (por_estado[r.estado] ?? 0) + 1;

  return {
    metricas: {
      total: rows.length,
      por_estado,
      atrasadas: rows.filter((r) => r.atrasada).length,
      completadas: por_estado['COMPLETADA'] ?? 0,
    },
    rows,
  };
}

// ============================================================================
// F) FLUJO DE CAJA
// ============================================================================
export type FiltrosCaja = {
  desde: string;
  hasta: string;
  almacen_id?: string;
};

export type CajaDiaRow = {
  fecha: string;
  ingresos: number;
  egresos: number;
  saldo: number;
};

export type CajaDetalleRow = {
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO';
  origen: string;          // 'VENTA POS' | 'PAGO TALLER' | 'OC' | etc
  referencia: string;
  monto: number;
};

export type ReporteCajaResult = {
  metricas: {
    ingresos_total: number;
    egresos_total: number;
    saldo: number;
    por_canal: Record<string, number>;
  };
  por_dia: CajaDiaRow[];
  rows: CajaDetalleRow[];
};

export async function reporteCaja(f: FiltrosCaja): Promise<ReporteCajaResult> {
  const sb = await sbReadonly();

  // --- Ingresos: ventas (POS/WEB/B2B/...) ---
  let qV = sb
    .from('ventas')
    .select('id, numero, fecha, canal, total, almacen_id')
    .gte('fecha', `${f.desde}T00:00:00`)
    .lte('fecha', `${f.hasta}T23:59:59`)
    .neq('estado', 'ANULADA')
    .limit(20000);
  if (f.almacen_id) qV = qV.eq('almacen_id', f.almacen_id);
  const { data: ventas } = await qV;

  type V = { id: string; numero: string; fecha: string; canal: string; total: string | number };
  const ingresoRows: CajaDetalleRow[] = ((ventas ?? []) as V[]).map((v) => ({
    fecha: v.fecha.slice(0, 10),
    tipo: 'INGRESO' as const,
    origen: `VENTA ${v.canal}`,
    referencia: v.numero,
    monto: Number(v.total),
  }));

  // --- Egresos: pagos_talleres + pagos_proveedores ---
  let qPT = sb.from('pagos_talleres').select('fecha, monto, taller_id, talleres(nombre)').gte('fecha', f.desde).lte('fecha', f.hasta).limit(10000);
  // pagos_talleres no tiene almacen_id, no filtramos por almacen acá
  const { data: pagosT } = await qPT;
  type PT = { fecha: string; monto: string | number; talleres: { nombre: string } | null };
  const egresosT: CajaDetalleRow[] = ((pagosT ?? []) as PT[]).map((p) => ({
    fecha: p.fecha,
    tipo: 'EGRESO' as const,
    origen: 'PAGO TALLER',
    referencia: p.talleres?.nombre ?? '—',
    monto: Number(p.monto),
  }));

  const { data: pagosP } = await sb
    .from('pagos_proveedores')
    .select('numero, fecha, monto, proveedor:proveedor_id(nombre)')
    .gte('fecha', f.desde)
    .lte('fecha', f.hasta)
    .limit(10000);
  type PP = { numero: string; fecha: string; monto: string | number; proveedor: { nombre: string } | null };
  const egresosP: CajaDetalleRow[] = ((pagosP ?? []) as PP[]).map((p) => ({
    fecha: p.fecha,
    tipo: 'EGRESO' as const,
    origen: 'PAGO PROVEEDOR',
    referencia: `${p.numero} · ${p.proveedor?.nombre ?? '—'}`,
    monto: Number(p.monto),
  }));

  const rows: CajaDetalleRow[] = [...ingresoRows, ...egresosT, ...egresosP].sort((a, b) =>
    a.fecha < b.fecha ? 1 : -1,
  );

  // --- Por canal ---
  const por_canal: Record<string, number> = {};
  for (const r of ingresoRows) por_canal[r.origen] = (por_canal[r.origen] ?? 0) + r.monto;

  // --- Por día ---
  const mapDia = new Map<string, CajaDiaRow>();
  for (const r of rows) {
    const e = mapDia.get(r.fecha) ?? { fecha: r.fecha, ingresos: 0, egresos: 0, saldo: 0 };
    if (r.tipo === 'INGRESO') e.ingresos += r.monto;
    else e.egresos += r.monto;
    e.saldo = e.ingresos - e.egresos;
    mapDia.set(r.fecha, e);
  }
  const por_dia = [...mapDia.values()].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  const ingresos_total = ingresoRows.reduce((s, r) => s + r.monto, 0);
  const egresos_total = [...egresosT, ...egresosP].reduce((s, r) => s + r.monto, 0);

  return {
    metricas: {
      ingresos_total,
      egresos_total,
      saldo: ingresos_total - egresos_total,
      por_canal,
    },
    por_dia,
    rows,
  };
}

// ============================================================================
// HELPERS PARA SELECTORES (almacenes, categorías, operarios, talleres)
// ============================================================================
export type Lookup = { id: string; codigo: string; nombre: string };

export async function listarAlmacenesLookup(): Promise<Lookup[]> {
  const sb = await sbReadonly();
  const { data } = await sb.from('almacenes').select('id, codigo, nombre').eq('activo', true).order('codigo');
  return (data ?? []) as Lookup[];
}

export async function listarCategoriasLookup(): Promise<Lookup[]> {
  const sb = await sbReadonly();
  const { data } = await sb.from('categorias').select('id, codigo, nombre').order('nombre');
  return (data ?? []) as Lookup[];
}

export async function listarOperariosLookup(): Promise<Lookup[]> {
  const sb = await sbReadonly();
  const { data } = await sb.from('operarios').select('id, codigo, nombres, apellido_paterno').eq('activo', true).order('nombres');
  type R = { id: string; codigo: string; nombres: string; apellido_paterno: string | null };
  return ((data ?? []) as R[]).map((o) => ({
    id: o.id,
    codigo: o.codigo,
    nombre: [o.nombres, o.apellido_paterno].filter(Boolean).join(' '),
  }));
}

export async function listarTalleresLookup(): Promise<Lookup[]> {
  const sb = await sbReadonly();
  const { data } = await sb.from('talleres').select('id, codigo, nombre').order('nombre');
  return ((data ?? []) as { id: string; codigo: string | null; nombre: string }[]).map((t) => ({
    id: t.id,
    codigo: t.codigo ?? '',
    nombre: t.nombre,
  }));
}
