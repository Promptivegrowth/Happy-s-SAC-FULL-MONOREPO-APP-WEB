/**
 * Tipos + constantes para reportes de producción.
 * Separado del archivo 'use server' para poder exportar types y no-async.
 */

export type FiltrosProduccionPeriodo = {
  desde: string;
  hasta: string;
  taller_id?: string;
};

export type ProduccionOtRow = {
  ot_id: string;
  ot_numero: string;
  fecha_cierre: string;
  fecha_apertura: string;
  producto_nombre: string;
  unidades_planificadas: number;
  unidades_terminadas: number;
  unidades_falladas: number;
  costo_materiales: number;
  costo_servicios: number;
  costo_total: number;
  costo_unitario: number;
  tiempo_min_total: number;
};

export type ProduccionMesRow = {
  mes: string;
  mes_label: string;
  cantidad_ots: number;
  unidades_terminadas: number;
  unidades_falladas: number;
  costo_materiales: number;
  costo_servicios: number;
  costo_total: number;
  tiempo_min_total: number;
};

export type ReporteProduccionPeriodoResult = {
  metricas: {
    cantidad_ots: number;
    unidades_terminadas: number;
    unidades_falladas: number;
    tasa_fallas_pct: number;
    costo_total: number;
    tiempo_horas_total: number;
  };
  por_mes: ProduccionMesRow[];
  por_ot: ProduccionOtRow[];
};

export type FiltrosCosteoComparativo = {
  desde: string;
  hasta: string;
  producto_id?: string;
};

export type CosteoComparativoRow = {
  ot_id: string;
  ot_numero: string;
  fecha_cierre: string;
  producto_id: string;
  producto_nombre: string;
  unidades_terminadas: number;
  cotizado_materiales: number;
  cotizado_servicios: number;
  cotizado_total: number;
  cotizado_unitario: number;
  real_materiales: number;
  real_servicios: number;
  real_total: number;
  real_unitario: number;
  diferencia: number;
  desviacion_pct: number;
};

export type ReporteCosteoComparativoResult = {
  metricas: {
    cantidad_ots: number;
    cotizado_total: number;
    real_total: number;
    diferencia_total: number;
    desviacion_promedio_pct: number;
    ots_sobre_presupuesto: number;
    ots_bajo_presupuesto: number;
  };
  rows: CosteoComparativoRow[];
};

export const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
] as const;

export function labelMes(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-');
  return `${MESES_ES[Number(m) - 1]} ${y}`;
}
