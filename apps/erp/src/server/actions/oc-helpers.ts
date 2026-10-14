// Helpers para módulo OC. Sin 'use server' — se importan desde client y server.

export const ESTADOS_OC = [
  'BORRADOR',
  'APROBADA',
  'ENVIADA',
  'PARCIAL',
  'RECIBIDA',
  'PAGADA',
  'CANCELADA',
] as const;
export type EstadoOC = (typeof ESTADOS_OC)[number];

export const TIPOS_OC = ['NACIONAL', 'IMPORTACION', 'SERVICIO_TALLER'] as const;
export type TipoOC = (typeof TIPOS_OC)[number];

export const ESTADO_LABEL: Record<EstadoOC, string> = {
  BORRADOR: 'Borrador',
  APROBADA: 'Aprobada',
  ENVIADA: 'Enviada',
  PARCIAL: 'Recepción parcial',
  RECIBIDA: 'Recibida',
  PAGADA: 'Pagada',
  CANCELADA: 'Cancelada',
};

export const ESTADO_TONO: Record<EstadoOC, 'slate' | 'amber' | 'sky' | 'indigo' | 'emerald' | 'violet' | 'rose'> = {
  BORRADOR: 'slate',
  APROBADA: 'sky',
  ENVIADA: 'indigo',
  PARCIAL: 'amber',
  RECIBIDA: 'emerald',
  PAGADA: 'violet',
  CANCELADA: 'rose',
};

export const TIPO_LABEL: Record<TipoOC, string> = {
  NACIONAL: 'Nacional',
  IMPORTACION: 'Importación',
  SERVICIO_TALLER: 'Servicio a taller',
};

/**
 * Máquina de estados de OC.
 * BORRADOR: editable, se le agregan/quitan líneas.
 * APROBADA: queda firmada; lista para enviar al proveedor.
 * ENVIADA: el proveedor recibió la orden; se espera mercadería.
 * PARCIAL: hubo al menos una recepción pero falta llegar todo (estado transitorio).
 * RECIBIDA: toda la mercadería entró al almacén.
 * PAGADA: se canceló a proveedor (lo marca CxP al cobrar saldo 0).
 * CANCELADA: anulada antes de envío/recepción.
 */
/*
 * Cambios de estado A MANO. PARCIAL y RECIBIDA ya no están: los pone solo la
 * recepción, que es la que ingresa la mercadería al almacén y al kárdex. El
 * botón "Recibida" marcaba la OC sin ingresar nada y después ya no dejaba
 * registrar la recepción: OC-26-00008 a 11 quedaron sin stock y el corte dejó
 * los materiales en negativo (pedido de Javier, 13/10/2026).
 */
export const TRANSICIONES_OC: Record<EstadoOC, readonly EstadoOC[]> = {
  BORRADOR: ['APROBADA', 'CANCELADA'],
  APROBADA: ['ENVIADA', 'CANCELADA'],
  ENVIADA: ['CANCELADA'],
  PARCIAL: ['CANCELADA'],
  RECIBIDA: ['PAGADA'],
  PAGADA: [],
  CANCELADA: [],
};

export const ESTADO_EDITABLE: EstadoOC[] = ['BORRADOR'];
