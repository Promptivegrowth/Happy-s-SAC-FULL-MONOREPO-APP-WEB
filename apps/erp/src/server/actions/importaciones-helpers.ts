/**
 * Tipos, constantes y funciones puras para importaciones.
 *
 * Se separan en este archivo (sin 'use server') porque Next.js exige que TODAS
 * las funciones exportadas desde archivos con 'use server' sean async. Las
 * funciones síncronas y los tipos viven acá y se re-importan desde donde se
 * necesite (server actions, components).
 */

export const ESTADOS_IMPORTACION = [
  'PREPARACION',
  'EN_TRANSITO',
  'EN_ADUANAS',
  'LIBERADA',
  'RECIBIDA',
  'CANCELADA',
] as const;

export type EstadoImportacion = (typeof ESTADOS_IMPORTACION)[number];

export const TRANSICIONES_IMPORTACION: Record<EstadoImportacion, EstadoImportacion[]> = {
  PREPARACION: ['EN_TRANSITO', 'CANCELADA'],
  EN_TRANSITO: ['EN_ADUANAS', 'CANCELADA'],
  EN_ADUANAS: ['LIBERADA', 'CANCELADA'],
  LIBERADA: ['RECIBIDA', 'CANCELADA'],
  RECIBIDA: [],
  CANCELADA: [],
};

export function siguientesEstados(actual: EstadoImportacion): EstadoImportacion[] {
  return TRANSICIONES_IMPORTACION[actual] ?? [];
}
