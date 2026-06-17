/**
 * Constantes y tipos para Control de Calidad.
 *
 * Separadas en este archivo (sin 'use server') porque Next.js exige que TODAS
 * las funciones/valores exportados desde archivos con 'use server' sean async.
 */

export const CALIDAD_TALLAS = ['T0', 'T2', 'T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'TS', 'TAD'] as const;
export const CALIDAD_ACCIONES = ['REPROCESO', 'SEGUNDA', 'MERMA', 'DEVOLVER_TALLER'] as const;
export const CALIDAD_SEVERIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

export type TallaPrenda = (typeof CALIDAD_TALLAS)[number];
export type AccionCalidad = (typeof CALIDAD_ACCIONES)[number];
export type SeveridadDefecto = (typeof CALIDAD_SEVERIDADES)[number];
