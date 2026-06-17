/**
 * Tipos, constantes y funciones puras para Libro de Reclamaciones (Ley 29571).
 *
 * Se separan en este archivo (sin 'use server') porque Next.js exige que TODAS
 * las funciones exportadas desde archivos con 'use server' sean async. Las
 * funciones síncronas y los tipos viven acá y se re-importan desde donde se
 * necesite (server actions, components).
 */

export const TIPOS_RECLAMO = ['RECLAMO', 'QUEJA'] as const;
export type TipoReclamo = (typeof TIPOS_RECLAMO)[number];

export const ESTADOS_RECLAMO = ['NUEVO', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO'] as const;
export type EstadoReclamo = (typeof ESTADOS_RECLAMO)[number];

// Tipos aceptados por la BD (enum tipo_documento_identidad).
// El enum 'OTRO' del comentario del schema no existe en el enum real — solo
// estos cuatro están permitidos por la FK del enum de Postgres.
export const TIPOS_DOC_RECLAMO = ['DNI', 'RUC', 'CE', 'PASAPORTE'] as const;
export type TipoDocReclamo = (typeof TIPOS_DOC_RECLAMO)[number];

export const TIPOS_BIEN = ['PRODUCTO', 'SERVICIO'] as const;
export type TipoBien = (typeof TIPOS_BIEN)[number];

/**
 * Máquina de transiciones de estado de un reclamo.
 *   NUEVO        → EN_REVISION, DESESTIMADO
 *   EN_REVISION  → RESUELTO, DESESTIMADO
 *   RESUELTO     → (final)
 *   DESESTIMADO  → (final)
 */
export const TRANSICIONES_RECLAMO: Record<EstadoReclamo, EstadoReclamo[]> = {
  NUEVO: ['EN_REVISION', 'DESESTIMADO'],
  EN_REVISION: ['RESUELTO', 'DESESTIMADO'],
  RESUELTO: [],
  DESESTIMADO: [],
};

export function transicionesEstado(actual: EstadoReclamo): EstadoReclamo[] {
  return TRANSICIONES_RECLAMO[actual] ?? [];
}

/** Plazo legal Indecopi: 30 días calendario para responder.
 *  Pasados 15 días sin respuesta marcamos alerta amarilla; 30+ es vencido. */
export const PLAZO_ALERTA_DIAS = 15;
export const PLAZO_LEGAL_DIAS = 30;

export function diasDesde(fechaIso: string): number {
  const ms = Date.now() - new Date(fechaIso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function estaVencido(fechaIso: string, estado: EstadoReclamo): boolean {
  if (estado === 'RESUELTO' || estado === 'DESESTIMADO') return false;
  return diasDesde(fechaIso) > PLAZO_ALERTA_DIAS;
}

export function tonoEstado(
  estado: EstadoReclamo,
): 'warning' | 'default' | 'success' | 'secondary' | 'destructive' {
  switch (estado) {
    case 'NUEVO':
      return 'warning';
    case 'EN_REVISION':
      return 'default';
    case 'RESUELTO':
      return 'success';
    case 'DESESTIMADO':
      return 'secondary';
  }
}

export function tonoTipo(tipo: TipoReclamo): 'destructive' | 'warning' {
  return tipo === 'RECLAMO' ? 'destructive' : 'warning';
}
