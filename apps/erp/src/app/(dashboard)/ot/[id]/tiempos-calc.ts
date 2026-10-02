/**
 * Cálculos de la pestaña "Tiempos & costo MO" de la OT, sin pantalla, para
 * poder probarlos con datos reales.
 */

export type ProcesoCalc = {
  id: string;
  proceso: string;
  descripcion_operativa?: string | null;
  tiempo_estandar_min: number | null;
  area: { codigo: string; valor_minuto: number | null } | null;
};
export type RegistroCalc = { proceso_id: string; tiempo_total_min: number; unidades_procesadas: number | null };
export type CorteResumenCalc = { telas: { tendido: number; corte: number; habilitado: number }[] } | undefined;

const nombre = (p: ProcesoCalc) => (p.descripcion_operativa?.trim() || p.proceso).toUpperCase();

/**
 * Minutos POR UNIDAD de una operación del área de corte, según la liquidación
 * del corte (tendido, corte, habilitado) repartida entre todo lo cortado en la
 * OT. Null si no es de corte o no hay liquidación.
 *
 * Así el corte tiene tiempo real también en la vista por talla y en las
 * tarjetas, que antes lo dejaban fuera y marcaban "parcial" (02/10/2026).
 */
export function corteMinPorUnidad(p: ProcesoCalc, corteResumen: CorteResumenCalc, unidadesCorteOT: number): number | null {
  if (p.area?.codigo !== 'CORTE' || !corteResumen || unidadesCorteOT <= 0) return null;
  const tot = { tendido: 0, corte: 0, habilitado: 0 };
  for (const t of corteResumen.telas ?? []) { tot.tendido += t.tendido; tot.corte += t.corte; tot.habilitado += t.habilitado; }
  const n = nombre(p);
  const min = n.includes('TENDIDO') ? tot.tendido : n.includes('HABILIT') ? tot.habilitado : n.includes('CORTE') ? tot.corte : 0;
  return min > 0 ? min / unidadesCorteOT : null;
}

/** Totales de las tarjetas: tiempo estándar y real por unidad, y costo MO. */
export function calcularStats(a: {
  procesos: ProcesoCalc[];
  registros: RegistroCalc[];
  unidades: number;
  corteResumen?: CorteResumenCalc;
  unidadesCorteOT?: number;
}) {
  let estandarMin = 0, realMin = 0, costoEstandarUnit = 0, costoRealUnit = 0, opsConRegistro = 0, opsMedibles = 0;
  for (const p of a.procesos) {
    const std = Number(p.tiempo_estandar_min ?? 0);
    const vmin = Number(p.area?.valor_minuto ?? 0);
    const regs = a.registros.filter((r) => r.proceso_id === p.id);
    const tiempoTotal = regs.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
    const und = regs.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
    const denominador = und > 0 ? und : a.unidades;
    const corteU = corteMinPorUnidad(p, a.corteResumen, a.unidadesCorteOT ?? 0);
    const realU = corteU ?? (denominador > 0 ? tiempoTotal / denominador : 0);
    // Una operación sin estándar y sin tiempos (p.ej. la confección que hace el
    // taller) no se puede medir acá: no cuenta para "parcial".
    if (std > 0 || realU > 0) opsMedibles++;
    if (realU > 0) opsConRegistro++;
    estandarMin += std;
    realMin += realU > 0 ? realU : std;
    costoEstandarUnit += std * vmin;
    costoRealUnit += (realU > 0 ? realU : std) * vmin;
  }
  return { estandarMin, realMin, costoEstandarUnit, costoRealUnit, opsConRegistro, totalOps: opsMedibles };
}
