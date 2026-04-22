/**
 * Modelo de trazabilidad end-to-end del disfraz terminado.
 *
 * Cada prenda terminada recibe un LOTE + un código de trazabilidad
 * (QR/Barcode) que acompaña a la unidad desde su ingreso a almacén hasta la venta.
 * El timeline se arma con movimientos y eventos registrados contra ese lote.
 */

export type EventoTrazabilidad = {
  timestamp: string;
  tipo:
    | 'PRODUCCION_INICIADA'
    | 'CORTE_COMPLETADO'
    | 'ENVIO_TALLER'
    | 'RECEPCION_TALLER'
    | 'CONTROL_CALIDAD'
    | 'INGRESO_ALMACEN_PT'
    | 'TRASLADO_TIENDA'
    | 'TRASLADO_ALMACEN'
    | 'VENTA_POS'
    | 'VENTA_WEB'
    | 'VENTA_B2B'
    | 'DEVOLUCION'
    | 'MERMA'
    | 'AJUSTE';
  almacenOrigen?: string | null;
  almacenDestino?: string | null;
  ot?: string | null;
  taller?: string | null;
  operario?: string | null;
  cliente?: string | null;
  usuarioId?: string | null;
  cantidad: number;
  observacion?: string | null;
};

export type TimelineLote = {
  loteId: string;
  productoId: string;
  talla: string;
  cantidadInicial: number;
  stockActual: number;
  eventos: EventoTrazabilidad[];
};

/** Arma un timeline ordenado cronológicamente desde movimientos crudos. */
export function ordenarTimeline(eventos: EventoTrazabilidad[]): EventoTrazabilidad[] {
  return [...eventos].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
