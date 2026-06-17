/**
 * Tipos, constantes y funciones puras (sync) para Pedidos B2B (Mayoristas).
 *
 * Vive fuera de `b2b.ts` porque ese archivo lleva 'use server' y Next.js sólo
 * permite exportar `async function` desde server-action modules.
 */

export const ESTADOS_B2B = [
  'BORRADOR',
  'PROFORMA',
  'APROBADO',
  'EN_PRODUCCION',
  'PARCIAL',
  'ENTREGADO',
  'CANCELADO',
] as const;
export type EstadoB2B = (typeof ESTADOS_B2B)[number];

export const LISTAS_PRECIO = [
  'PUBLICO',
  'MAYORISTA_A',
  'MAYORISTA_B',
  'MAYORISTA_C',
  'INDUSTRIAL',
] as const;
export type ListaPrecio = (typeof LISTAS_PRECIO)[number];

export const CONDICIONES_PAGO = ['CONTADO', '15D', '30D', '60D', '90D'] as const;
export type CondicionPago = (typeof CONDICIONES_PAGO)[number];

/** Transiciones permitidas — el server las valida estrictamente. */
export const TRANSICIONES_B2B: Record<EstadoB2B, EstadoB2B[]> = {
  BORRADOR: ['PROFORMA', 'CANCELADO'],
  PROFORMA: ['APROBADO', 'BORRADOR', 'CANCELADO'],
  APROBADO: ['EN_PRODUCCION', 'PARCIAL', 'ENTREGADO', 'CANCELADO'],
  EN_PRODUCCION: ['PARCIAL', 'ENTREGADO', 'CANCELADO'],
  PARCIAL: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export function siguientesEstadosB2B(actual: EstadoB2B): EstadoB2B[] {
  return TRANSICIONES_B2B[actual] ?? [];
}

/** 18% — IGV Perú. Aplica sobre subtotal − descuento global. */
export const IGV_RATE = 0.18;

/** Devuelve el campo de precio de `productos_variantes` para una lista. */
export function campoPrecioPorLista(lista: ListaPrecio): keyof PreciosVariante {
  switch (lista) {
    case 'PUBLICO':
      return 'precio_publico';
    case 'MAYORISTA_A':
      return 'precio_mayorista_a';
    case 'MAYORISTA_B':
      return 'precio_mayorista_b';
    case 'MAYORISTA_C':
      return 'precio_mayorista_c';
    case 'INDUSTRIAL':
      return 'precio_industrial';
  }
}

export type PreciosVariante = {
  precio_publico: number | null;
  precio_mayorista_a: number | null;
  precio_mayorista_b: number | null;
  precio_mayorista_c: number | null;
  precio_industrial: number | null;
};

/** Calcula precio aplicable con fallback a `precio_publico` si la lista está vacía. */
export function precioAplicable(
  precios: PreciosVariante,
  lista: ListaPrecio,
): { precio: number; usoFallback: boolean } {
  const campo = campoPrecioPorLista(lista);
  const directo = precios[campo];
  if (directo != null && Number(directo) > 0) {
    return { precio: Number(directo), usoFallback: false };
  }
  const publico = precios.precio_publico;
  return {
    precio: publico != null ? Number(publico) : 0,
    usoFallback: lista !== 'PUBLICO',
  };
}

/** Color de badge para la UI (mantiene paleta de `@happy/ui/badge`). */
export function tonoEstadoB2B(estado: EstadoB2B):
  | 'default'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'outline' {
  switch (estado) {
    case 'BORRADOR':
      return 'secondary';
    case 'PROFORMA':
      return 'default';
    case 'APROBADO':
      return 'default';
    case 'EN_PRODUCCION':
      return 'warning';
    case 'PARCIAL':
      return 'warning';
    case 'ENTREGADO':
      return 'success';
    case 'CANCELADO':
      return 'destructive';
  }
}
