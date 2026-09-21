'use server';

/**
 * REPORTE DE CONSUMOS Y TIEMPOS: RECETA vs REAL
 * (pedido cliente 2026-09-10: "Reporte de consumos, y tiempos de producción
 *  reales vs receta para poder descargar en Excel").
 *
 * Dos miradas sobre las mismas OTs del período:
 *
 *   A) CONSUMOS por OT y material
 *      · Teórico  = receta activa del producto (recetas_lineas.cantidad, por talla)
 *                   × unidades. Se calcula dos veces: sobre lo PLANIFICADO y
 *                   sobre lo realmente CORTADO.
 *      · Real     = tela consumida en el corte (kardex SALIDA_PRODUCCION, que
 *                   referencia el CORTE y no la OT) MÁS los avíos que se fueron
 *                   a un servicio, contados como ENVIADO − DEVUELTO por el taller.
 *      · La comparación principal es Real vs Teórico-cortado (es lo que de
 *        verdad debió consumirse por lo que se cortó).
 *      · Valorización: el kardex de producción no guarda costo (costo_unitario
 *        viene NULL), así que ambos lados se valorizan con
 *        materiales.precio_unitario para que la comparación sea homogénea.
 *
 *   B) TIEMPOS por OT y proceso
 *      · Estándar = productos_procesos.tiempo_estandar_min × unidades procesadas.
 *      · Real     = ot_registros_tiempo.tiempo_total_min.
 *      NO se mezclan acá los minutos de la liquidación de corte
 *      (ot_corte_tiempos) para no duplicar el proceso CORTE: van aparte como
 *      métrica informativa.
 *
 * Alcance: OTs con ACTIVIDAD en el período (abiertas antes de "hasta" y que
 * seguían abiertas o cerraron después de "desde"), no solamente las cerradas.
 */

import { createClient } from '@happy/db/server';
import { redirect } from 'next/navigation';
import { precioPorUnidadDeConsumo } from '@/server/costo-material';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sbReadonly(): Promise<{ from: (t: string) => any }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as { from: (t: string) => any };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export type ConsumoRow = {
  ot_id: string;
  ot_numero: string;
  estado: string;
  producto: string;
  material_codigo: string;
  material_nombre: string;
  unidad: string;
  und_plan: number;
  und_cortadas: number;
  teorico_plan: number;
  teorico_cortado: number;
  enviado_taller: number;
  devuelto_taller: number;
  real_cant: number;
  diferencia: number;
  desviacion_pct: number;
  precio_unitario: number;
  valor_teorico: number;
  valor_real: number;
  valor_diferencia: number;
  nota: string;
};

export type TiempoProcesoRow = {
  ot_id: string;
  ot_numero: string;
  producto: string;
  area: string;
  proceso: string;
  orden: number;
  tercerizado: string;
  unidades: number;
  estandar_min_u: number;
  estandar_min: number;
  real_min: number;
  real_min_u: number;
  diferencia_min: number;
  desviacion_pct: number;
  registros: number;
};

export type MetricasConsumosTiempos = {
  cantidad_ots: number;
  // Consumos
  valor_teorico: number;
  valor_real: number;
  valor_diferencia: number;
  desviacion_consumo_pct: number;
  materiales_sin_receta: number;
  ots_con_consumo: number;
  ots_sin_consumo: number;
  // Tiempos
  estandar_min: number;
  real_min: number;
  diferencia_min: number;
  desviacion_tiempo_pct: number;
  real_min_sin_estandar: number;
  corte_liquidado_min: number;
};

export type ReporteConsumosTiemposResult = {
  metricas: MetricasConsumosTiempos;
  consumos: ConsumoRow[];
  tiempos: TiempoProcesoRow[];
};

const METRICAS_VACIAS: MetricasConsumosTiempos = {
  cantidad_ots: 0,
  valor_teorico: 0, valor_real: 0, valor_diferencia: 0, desviacion_consumo_pct: 0,
  materiales_sin_receta: 0, ots_con_consumo: 0, ots_sin_consumo: 0,
  estandar_min: 0, real_min: 0, diferencia_min: 0, desviacion_tiempo_pct: 0,
  real_min_sin_estandar: 0,
  corte_liquidado_min: 0,
};

export async function reporteConsumosYTiempos(
  f: { desde: string; hasta: string; otId?: string },
): Promise<ReporteConsumosTiemposResult> {
  const sb = await sbReadonly();
  const vacio: ReporteConsumosTiemposResult = { metricas: METRICAS_VACIAS, consumos: [], tiempos: [] };

  // ---------------------------------------------------------------- OTs ----
  let otQuery = sb.from('ot')
    .select('id, numero, estado, fecha_apertura, fecha_cierre')
    .lte('fecha_apertura', f.hasta)
    .or(`fecha_cierre.is.null,fecha_cierre.gte.${f.desde}`);
  if (f.otId) otQuery = otQuery.eq('id', f.otId);
  const { data: otsRaw } = await otQuery;
  type OT = { id: string; numero: string; estado: string; fecha_apertura: string; fecha_cierre: string | null };
  const ots = (otsRaw ?? []) as OT[];
  if (ots.length === 0) return vacio;
  const otIds = ots.map((o) => o.id);
  const otById = new Map(ots.map((o) => [o.id, o]));

  // ------------------------------------------------------- líneas de OT ----
  const { data: lineasRaw } = await sb.from('ot_lineas')
    .select('ot_id, producto_id, talla, cantidad_planificada, cantidad_cortada, productos:producto_id(codigo, nombre)')
    .in('ot_id', otIds);
  type LR = {
    ot_id: string; producto_id: string; talla: string;
    cantidad_planificada: number | null; cantidad_cortada: number | null;
    productos: { codigo: string | null; nombre: string | null } | null;
  };
  const lineas = (lineasRaw ?? []) as unknown as LR[];
  const productoIds = Array.from(new Set(lineas.map((l) => l.producto_id)));

  // Nombre de producto por OT (para rotular las filas).
  const productoDeOt = new Map<string, string>();
  for (const l of lineas) {
    if (productoDeOt.has(l.ot_id)) continue;
    productoDeOt.set(l.ot_id, `${l.productos?.codigo ?? ''} ${l.productos?.nombre ?? ''}`.trim() || '—');
  }

  // =========================================================================
  // A) CONSUMOS
  // =========================================================================
  // Receta activa por producto → líneas por (producto, talla).
  const { data: recetasRaw } = await sb.from('recetas')
    .select('id, producto_id').in('producto_id', productoIds).eq('activa', true);
  const recetas = (recetasRaw ?? []) as { id: string; producto_id: string }[];
  const productoDeReceta = new Map(recetas.map((r) => [r.id, r.producto_id]));

  type RecetaLinea = { material_id: string; cantidad: number };
  const recetaPorProdTalla = new Map<string, RecetaLinea[]>();
  if (recetas.length > 0) {
    const { data: rlRaw } = await sb.from('recetas_lineas')
      .select('receta_id, material_id, talla, cantidad')
      .in('receta_id', recetas.map((r) => r.id));
    for (const rl of (rlRaw ?? []) as { receta_id: string; material_id: string; talla: string | null; cantidad: number | string | null }[]) {
      const prod = productoDeReceta.get(rl.receta_id);
      if (!prod || !rl.material_id) continue;
      // talla NULL en la receta = aplica a todas las tallas.
      const key = `${prod}::${rl.talla ?? '*'}`;
      const arr = recetaPorProdTalla.get(key) ?? [];
      arr.push({ material_id: rl.material_id, cantidad: Number(rl.cantidad ?? 0) });
      recetaPorProdTalla.set(key, arr);
    }
  }

  // Acumulador por (OT, material).
  type ConsAcc = {
    ot_id: string; material_id: string;
    teorico_plan: number; teorico_cortado: number; real_cant: number;
    enviado: number; devuelto: number;
    und_plan: number; und_cortadas: number;
  };
  const cons = new Map<string, ConsAcc>();
  const acc = (otId: string, materialId: string): ConsAcc => {
    const k = `${otId}::${materialId}`;
    const cur = cons.get(k) ?? { ot_id: otId, material_id: materialId, teorico_plan: 0, teorico_cortado: 0, real_cant: 0, enviado: 0, devuelto: 0, und_plan: 0, und_cortadas: 0 };
    cons.set(k, cur);
    return cur;
  };

  // Unidades por OT (para el encabezado de las filas).
  const undPlanOt = new Map<string, number>();
  const undCortOt = new Map<string, number>();
  for (const l of lineas) {
    const plan = Number(l.cantidad_planificada ?? 0);
    const cort = Number(l.cantidad_cortada ?? 0);
    undPlanOt.set(l.ot_id, (undPlanOt.get(l.ot_id) ?? 0) + plan);
    undCortOt.set(l.ot_id, (undCortOt.get(l.ot_id) ?? 0) + cort);
    const recetaLineas = [
      ...(recetaPorProdTalla.get(`${l.producto_id}::${l.talla}`) ?? []),
      ...(recetaPorProdTalla.get(`${l.producto_id}::*`) ?? []),
    ];
    for (const rl of recetaLineas) {
      const a = acc(l.ot_id, rl.material_id);
      a.teorico_plan += rl.cantidad * plan;
      a.teorico_cortado += rl.cantidad * cort;
    }
  }

  // ------------------------------------------------------- consumo REAL ----
  // Dos fuentes, sin solaparse:
  //
  //   * TELA del corte -> kardex (SALIDA_PRODUCCION). El movimiento referencia
  //     el CORTE (referencia_id = ot_corte.id), no la OT: hay que resolver ese
  //     mapeo o el consumo sale en cero.
  //
  //   * AVIOS de un servicio -> la orden de servicio: ENVIADO menos DEVUELTO por
  //     el taller (pedido cliente 2026-09-10: "las devoluciones que se registran
  //     del taller deben servir para el calculo de consumos reales"). Se toma de
  //     `ordenes_servicio_avios` y no del kardex porque es el dato operativo que
  //     carga produccion, asi el consumo es correcto aunque el movimiento de
  //     almacen no se haya llegado a registrar. Por eso los movimientos de
  //     kardex que referencian una OS se EXCLUYEN: ya estan contemplados aca.
  const { data: cortesRaw } = await sb.from('ot_corte').select('id, ot_id').in('ot_id', otIds);
  const { data: osRaw } = await sb.from('ordenes_servicio').select('id, ot_id').in('ot_id', otIds);

  const refToOt = new Map<string, string>();
  for (const c of (cortesRaw ?? []) as { id: string; ot_id: string }[]) refToOt.set(c.id, c.ot_id);
  for (const id of otIds) refToOt.set(id, id); // por si algun movimiento referencia la OT directo

  const refIds = [...refToOt.keys()];
  if (refIds.length > 0) {
    const { data: kdxRaw } = await sb.from('kardex_movimientos')
      .select('tipo, material_id, cantidad, referencia_id')
      // Tela del corte y avíos despachados al taller: las dos cosas salen del
      // almacén y las dos son consumo real de la OT.
      .in('tipo', ['SALIDA_PRODUCCION', 'SALIDA_TALLER_SERVICIO'])
      .in('referencia_id', refIds)
      .not('material_id', 'is', null);
    for (const k of (kdxRaw ?? []) as { tipo: string; material_id: string; cantidad: number | string | null; referencia_id: string }[]) {
      const otId = refToOt.get(k.referencia_id);
      if (!otId) continue;
      acc(otId, k.material_id).real_cant += Number(k.cantidad ?? 0);
    }
  }

  const osToOt = new Map<string, string>();
  for (const o of (osRaw ?? []) as { id: string; ot_id: string | null }[]) if (o.ot_id) osToOt.set(o.id, o.ot_id);
  if (osToOt.size > 0) {
    const { data: aviosRaw } = await sb.from('ordenes_servicio_avios')
      .select('os_id, material_id, cantidad_enviada, cantidad_devuelta')
      .in('os_id', [...osToOt.keys()]);
    for (const a of (aviosRaw ?? []) as { os_id: string; material_id: string | null; cantidad_enviada: number | string | null; cantidad_devuelta: number | string | null }[]) {
      const otId = osToOt.get(a.os_id);
      if (!otId || !a.material_id) continue;
      const enviado = Number(a.cantidad_enviada ?? 0);
      const devuelto = Number(a.cantidad_devuelta ?? 0);
      const fila = acc(otId, a.material_id);
      fila.enviado += enviado;
      fila.devuelto += devuelto;
      fila.real_cant += enviado - devuelto; // lo que de verdad quedo en la prenda
    }
  }

  // Datos del material (código, nombre, unidad de consumo, precio).
  const materialIds = Array.from(new Set([...cons.values()].map((c) => c.material_id)));
  type Mat = { id: string; codigo: string | null; nombre: string | null; precio_unitario: number | string | null; factor_conversion: number | string | null; unidades_medida: { simbolo: string | null } | null };
  const matById = new Map<string, Mat>();
  if (materialIds.length > 0) {
    const { data: matRaw } = await sb.from('materiales')
      .select('id, codigo, nombre, precio_unitario, factor_conversion, unidades_medida:unidad_consumo_id(simbolo)')
      .in('id', materialIds);
    for (const m of (matRaw ?? []) as unknown as Mat[]) matById.set(m.id, m);
  }

  const consumos: ConsumoRow[] = [...cons.values()]
    .filter((c) => c.teorico_plan > 0 || c.teorico_cortado > 0 || Math.abs(c.real_cant) > 0.0001)
    .map((c) => {
      const ot = otById.get(c.ot_id)!;
      const m = matById.get(c.material_id);
      /*
       * El precio se trae a la unidad en que la receta consume.
       *
       * Las cantidades de este reporte están en unidad de CONSUMO (metros,
       * unidades) y `precio_unitario` es el de la unidad de COMPRA (el mazo
       * de 1.728 botones, el paquete de 120 cierres). Multiplicar una por
       * otro inflaba el costo por el factor entero.
       */
      const precio = precioPorUnidadDeConsumo(m?.precio_unitario, m?.factor_conversion);
      const teorico = c.teorico_cortado;
      const dif = c.real_cant - teorico;
      const nota = c.real_cant < 0
        ? 'Devolución mayor que lo enviado: revisar el registro'
        : c.teorico_plan === 0 && c.teorico_cortado === 0
          ? 'Consumido sin estar en la receta'
          : c.real_cant === 0
            ? 'Sin consumo registrado todavía'
            : c.devuelto > 0
              ? 'Neto de servicio: ' + r2(c.enviado) + ' enviado − ' + r2(c.devuelto) + ' devuelto por el taller'
              : '';
      return {
        ot_id: c.ot_id,
        ot_numero: ot.numero,
        estado: ot.estado,
        producto: productoDeOt.get(c.ot_id) ?? '—',
        material_codigo: m?.codigo ?? '—',
        material_nombre: m?.nombre ?? '—',
        unidad: m?.unidades_medida?.simbolo ?? '—',
        und_plan: undPlanOt.get(c.ot_id) ?? 0,
        und_cortadas: undCortOt.get(c.ot_id) ?? 0,
        teorico_plan: r2(c.teorico_plan),
        teorico_cortado: r2(c.teorico_cortado),
        enviado_taller: r2(c.enviado),
        devuelto_taller: r2(c.devuelto),
        real_cant: r2(c.real_cant),
        diferencia: r2(dif),
        desviacion_pct: teorico > 0 ? r2((dif / teorico) * 100) : 0,
        precio_unitario: r2(precio),
        valor_teorico: r2(teorico * precio),
        valor_real: r2(c.real_cant * precio),
        valor_diferencia: r2(dif * precio),
        nota,
      };
    })
    .sort((a, b) =>
      a.ot_numero === b.ot_numero
        ? Math.abs(b.valor_diferencia) - Math.abs(a.valor_diferencia)
        : a.ot_numero < b.ot_numero ? 1 : -1,
    );

  // =========================================================================
  // B) TIEMPOS POR PROCESO
  // =========================================================================
  const { data: regsRaw } = await sb.from('ot_registros_tiempo')
    .select('ot_id, proceso_id, unidades_procesadas, tiempo_total_min')
    .in('ot_id', otIds);
  type Reg = { ot_id: string; proceso_id: string; unidades_procesadas: number | null; tiempo_total_min: number | string | null };
  const regs = (regsRaw ?? []) as Reg[];

  const procesoIds = Array.from(new Set(regs.map((r) => r.proceso_id).filter(Boolean)));
  type Proc = { id: string; proceso: string; orden: number | null; tiempo_estandar_min: number | string | null; es_tercerizado: boolean | null; areas_produccion: { nombre: string | null } | null };
  const procById = new Map<string, Proc>();
  if (procesoIds.length > 0) {
    const { data: procRaw } = await sb.from('productos_procesos')
      .select('id, proceso, orden, tiempo_estandar_min, es_tercerizado, areas_produccion:area_id(nombre)')
      .in('id', procesoIds);
    for (const p of (procRaw ?? []) as unknown as Proc[]) procById.set(p.id, p);
  }

  type TAcc = {
    ot_id: string; proceso: string; area: string; orden: number; tercerizado: boolean;
    unidades: number; estandar: number; real: number; registros: number; stdU: number;
  };
  const tacc = new Map<string, TAcc>();
  for (const r of regs) {
    const p = procById.get(r.proceso_id);
    const proceso = p?.proceso ?? 'Proceso eliminado';
    const k = `${r.ot_id}::${proceso}`;
    const stdU = Number(p?.tiempo_estandar_min ?? 0);
    const cur = tacc.get(k) ?? {
      ot_id: r.ot_id, proceso, area: p?.areas_produccion?.nombre ?? '—',
      orden: Number(p?.orden ?? 999), tercerizado: Boolean(p?.es_tercerizado),
      unidades: 0, estandar: 0, real: 0, registros: 0, stdU,
    };
    const und = Number(r.unidades_procesadas ?? 0);
    cur.unidades += und;
    cur.estandar += stdU * und;
    cur.real += Number(r.tiempo_total_min ?? 0);
    cur.registros += 1;
    cur.stdU = stdU || cur.stdU;
    tacc.set(k, cur);
  }

  const tiempos: TiempoProcesoRow[] = [...tacc.values()].map((t) => {
    const ot = otById.get(t.ot_id)!;
    const dif = t.real - t.estandar;
    return {
      ot_id: t.ot_id,
      ot_numero: ot.numero,
      producto: productoDeOt.get(t.ot_id) ?? '—',
      area: t.area,
      proceso: t.proceso,
      orden: t.orden,
      tercerizado: t.tercerizado ? 'Sí' : 'No',
      unidades: t.unidades,
      estandar_min_u: r2(t.stdU),
      estandar_min: r2(t.estandar),
      real_min: r2(t.real),
      real_min_u: t.unidades > 0 ? r2(t.real / t.unidades) : 0,
      diferencia_min: r2(dif),
      desviacion_pct: t.estandar > 0 ? r2((dif / t.estandar) * 100) : 0,
      registros: t.registros,
    };
  }).sort((a, b) =>
    a.ot_numero === b.ot_numero
      ? a.orden - b.orden
      : a.ot_numero < b.ot_numero ? 1 : -1,
  );

  // Minutos de la liquidación de corte (informativo, no se mezcla arriba).
  let corteLiquidadoMin = 0;
  const corteIds = ((cortesRaw ?? []) as { id: string }[]).map((c) => c.id);
  if (corteIds.length > 0) {
    const { data: ctRaw } = await sb.from('ot_corte_tiempos')
      .select('tiempo_tendido_min, tiempo_corte_min, tiempo_habilitado_min')
      .in('corte_id', corteIds);
    for (const t of (ctRaw ?? []) as { tiempo_tendido_min: number | string | null; tiempo_corte_min: number | string | null; tiempo_habilitado_min: number | string | null }[]) {
      corteLiquidadoMin += Number(t.tiempo_tendido_min ?? 0) + Number(t.tiempo_corte_min ?? 0) + Number(t.tiempo_habilitado_min ?? 0);
    }
  }

  // Los indicadores se calculan sólo sobre lo COMPARABLE, para que el resumen no
  // quede dominado por lo que todavía no se registró:
  //   · consumos → sólo las OTs que ya tienen algún consumo en el kardex. Las
  //     que no tienen nada aparecen igual en el detalle y se cuentan aparte.
  //   · tiempos  → sólo los procesos que tienen tiempo estándar en la receta.
  //     Los minutos reales de procesos sin estándar se reportan por separado.
  const otsConConsumo = new Set(consumos.filter((c) => Math.abs(c.real_cant) > 0.0001).map((c) => c.ot_id));
  const otsEnReporte = new Set([...consumos.map((c) => c.ot_id), ...tiempos.map((t) => t.ot_id)]);
  const consumosComparables = consumos.filter((c) => otsConConsumo.has(c.ot_id));
  const tiemposConEstandar = tiempos.filter((t) => t.estandar_min > 0);

  const valorTeorico = consumosComparables.reduce((s, c) => s + c.valor_teorico, 0);
  const valorReal = consumosComparables.reduce((s, c) => s + c.valor_real, 0);
  const estandarMin = tiemposConEstandar.reduce((s, t) => s + t.estandar_min, 0);
  const realMin = tiemposConEstandar.reduce((s, t) => s + t.real_min, 0);
  const realSinEstandar = tiempos.filter((t) => t.estandar_min === 0).reduce((s, t) => s + t.real_min, 0);

  return {
    metricas: {
      cantidad_ots: otsEnReporte.size,
      valor_teorico: r2(valorTeorico),
      valor_real: r2(valorReal),
      valor_diferencia: r2(valorReal - valorTeorico),
      desviacion_consumo_pct: valorTeorico > 0 ? r2(((valorReal - valorTeorico) / valorTeorico) * 100) : 0,
      materiales_sin_receta: consumos.filter((c) => c.nota === 'Consumido sin estar en la receta').length,
      ots_con_consumo: otsConConsumo.size,
      ots_sin_consumo: [...otsEnReporte].filter((id) => !otsConConsumo.has(id)).length,
      estandar_min: r2(estandarMin),
      real_min: r2(realMin),
      diferencia_min: r2(realMin - estandarMin),
      desviacion_tiempo_pct: estandarMin > 0 ? r2(((realMin - estandarMin) / estandarMin) * 100) : 0,
      real_min_sin_estandar: r2(realSinEstandar),
      corte_liquidado_min: r2(corteLiquidadoMin),
    },
    consumos,
    tiempos,
  };
}
