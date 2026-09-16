/**
 * Reglas de precio y de envío de la tienda web.
 *
 * Estaban dentro del carrito y del checkout, que son componentes de navegador.
 * El servidor también las necesita —para recalcular el total antes de cobrar
 * con tarjeta— y no puede importar un módulo `'use client'`. Viven acá, sin
 * dependencias, para que las use tanto el navegador como el servidor y NO
 * existan dos versiones de la misma regla: si divergen, el comprador ve un
 * precio y se le cobra otro.
 */

// Escalones de precio para clientes web (post-2026-07-08):
//  - < 6 unidades totales → precio público
//  - >= 6 unidades totales → precio mayorista (o público si no hay mayorista)
//  - >= 100 unidades totales → precio de fábrica (o mayorista si no hay fábrica)
// Los escalones se aplican a TODAS las líneas del carrito una vez que el
// total de items supera el umbral (no por variante individual).
export const UMBRAL_MAYORISTA = 6;
export const UMBRAL_FABRICA = 100;

/** Envío GRATIS a partir de S/ 249 (cliente reportó post-2026-07-08). */
export const ENVIO_GRATIS_DESDE = 249;
export const COSTO_ENVIO_DEFECTO = 15;

export type EscalonAplicado = 'PUBLICO' | 'MAYORISTA' | 'FABRICA';

/** Lo mínimo que necesita una línea para saber cuánto vale. */
export type PreciosDeLinea = {
  precio: number;
  precioMayorista?: number;
  precioFabrica?: number;
};

/**
 * Escalón activo según el total de items del carrito.
 * Devuelve el nombre del escalón — el precio efectivo por línea se calcula
 * con `precioEfectivoLinea` de más abajo (respeta el fallback si esa línea
 * no tiene ese precio cargado).
 */
export function escalonPorTotalItems(totalItems: number): EscalonAplicado {
  if (totalItems >= UMBRAL_FABRICA) return 'FABRICA';
  if (totalItems >= UMBRAL_MAYORISTA) return 'MAYORISTA';
  return 'PUBLICO';
}

/**
 * Precio unitario efectivo de una línea según el escalón activo.
 * Cae en cascada si no está cargado el precio del escalón:
 *   FABRICA → MAYORISTA → PUBLICO
 *   MAYORISTA → PUBLICO
 */
export function precioEfectivoLinea(item: PreciosDeLinea, escalon: EscalonAplicado): number {
  const publico = Number(item.precio ?? 0);
  const mayor = Number(item.precioMayorista ?? 0);
  const fab = Number(item.precioFabrica ?? 0);
  if (escalon === 'FABRICA') return fab > 0 ? fab : mayor > 0 ? mayor : publico;
  if (escalon === 'MAYORISTA') return mayor > 0 ? mayor : publico;
  return publico;
}

/** Costo de envío según la modalidad de entrega y el subtotal. */
export function costoEnvio(
  metodoEntrega: 'DELIVERY' | 'RECOJO_TIENDA',
  subTotal: number,
): number {
  if (metodoEntrega === 'RECOJO_TIENDA') return 0;
  return subTotal >= ENVIO_GRATIS_DESDE ? 0 : COSTO_ENVIO_DEFECTO;
}

/**
 * Soles → céntimos, que es como cobra izipay.
 *
 * `Math.round` y no `Math.trunc`: 12.35 en coma flotante es 12.349999…, y
 * truncar cobraría S/ 12.34. Un céntimo de menos por pedido, siempre a favor
 * del comprador, pero descuadra la conciliación contra el Back Office.
 */
export function aCentimos(soles: number): number {
  return Math.round(Number(soles) * 100);
}
