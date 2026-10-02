/**
 * Reparto de los costos generales (luz, agua, alquiler del local) entre las
 * áreas, según la cantidad de personas de cada una.
 *
 * Regla del cliente (01/10/2026): el valor minuto de un área es
 *   (costos propios del área + su % de los costos generales) ÷ minutos disponibles del área
 * y ese % sale de las personas: un área con 2 de los 6 operarios carga el 33,33%.
 * Antes el % se tipeaba a mano y había quedado en 0 para todas.
 *
 * Cuentan los operarios activos con un área activa. Los que no tienen área no
 * entran (no se sabe a quién cargarles su parte) y se avisa en pantalla.
 */

export type RepartoArea = { personas: number; pct: number };

export function repartoPorPersonas(
  areaIds: string[],
  operarios: { area_id: string | null }[],
): { porArea: Map<string, RepartoArea>; totalPersonas: number; sinArea: number } {
  const personas = new Map<string, number>(areaIds.map((id) => [id, 0]));
  let sinArea = 0;
  for (const o of operarios) {
    if (o.area_id && personas.has(o.area_id)) personas.set(o.area_id, personas.get(o.area_id)! + 1);
    else sinArea++;
  }
  const totalPersonas = [...personas.values()].reduce((s, n) => s + n, 0);
  const porArea = new Map<string, RepartoArea>();
  for (const [id, n] of personas) {
    porArea.set(id, { personas: n, pct: totalPersonas > 0 ? (n * 100) / totalPersonas : 0 });
  }
  return { porArea, totalPersonas, sinArea };
}

/** Valor minuto = (costos propios + parte de los generales) ÷ minutos disponibles. */
export function valorMinutoArea(a: {
  costosPropios: number;
  totalGenerales: number;
  pct: number;
  minutos: number;
}): { parteGenerales: number; totalCostos: number; valor: number } {
  const parteGenerales = (a.totalGenerales * a.pct) / 100;
  const totalCostos = a.costosPropios + parteGenerales;
  return { parteGenerales, totalCostos, valor: a.minutos > 0 ? totalCostos / a.minutos : 0 };
}
