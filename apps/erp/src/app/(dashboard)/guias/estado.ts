/**
 * El estado de una guía dicho como lo entiende quien despacha.
 *
 * Los estados vienen del enum de comprobantes y en una guía significan otra
 * cosa: BORRADOR es "todavía no llegó a SUNAT" y EMITIDO es "SUNAT la recibió y
 * está por contestar". Mostrar la palabra cruda confundía más que ayudaba.
 */
export function estadoGuia(estado: string | null): { texto: string; tono: 'success' | 'destructive' | 'warning' | 'secondary' | 'default' } {
  switch (estado) {
    case 'ACEPTADO': return { texto: 'ACEPTADA', tono: 'success' };
    case 'RECHAZADO': return { texto: 'RECHAZADA', tono: 'destructive' };
    case 'EMITIDO': return { texto: 'ESPERANDO A SUNAT', tono: 'default' };
    case 'ANULADO': return { texto: 'DADA DE BAJA', tono: 'secondary' };
    default: return { texto: 'SIN ENVIAR', tono: 'warning' };
  }
}
