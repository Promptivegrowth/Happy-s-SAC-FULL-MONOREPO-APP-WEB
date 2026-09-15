/**
 * Tamaño de lote para consultas con `.in(...)` en Supabase.
 *
 * El filtro viaja en la URL: 500 UUID son ~18 KB y el servidor rechaza la
 * petición. Peor aún, `const { data } = await ...` sin mirar `error` convierte
 * ese rechazo en "no existe ninguno" — que fue exactamente lo que hizo que un
 * conteo físico reportara 200 productos como borrados (2026-09-15). Con 200
 * IDs el filtro queda en ~7 KB, bien por debajo del límite.
 *
 * Al trocear en lotes, SIEMPRE hay que revisar `error`: un fallo de red no
 * significa que la fila no exista.
 *
 * Va en su propio módulo porque `_helpers.ts` es 'use server' y esos archivos
 * solo pueden exportar funciones async.
 */
export const LOTE_IDS = 200;
