/**
 * Fecha de una etapa que hace un taller (confección, bordado…): cuándo RETORNÓ
 * la última orden de servicio de esa etapa, no cuándo empezó (pedido del
 * cliente, 01/10/2026). Si todavía falta que vuelva alguna, se muestra el
 * último retorno con esa aclaración.
 */

export const OS_RETORNADA = ['RECEPCION_PARCIAL', 'RECEPCIONADA', 'CERRADA'];

export type OsDeOt = { estado: string; proceso: string; fecha_recepcion: string | null };

export function retornoDeEtapa(
  procesosDeLaEtapa: string[],
  os: OsDeOt[],
): { fecha: string; etiqueta: 'retornó' | 'último retorno' } | null {
  const procesos = new Set(procesosDeLaEtapa);
  const deLaEtapa = os.filter((o) => procesos.has(o.proceso));
  const retornos = deLaEtapa
    .filter((o) => OS_RETORNADA.includes(o.estado) && o.fecha_recepcion)
    .map((o) => String(o.fecha_recepcion))
    .sort();
  if (retornos.length === 0) return null;
  return { fecha: retornos.at(-1)!, etiqueta: retornos.length < deLaEtapa.length ? 'último retorno' : 'retornó' };
}
