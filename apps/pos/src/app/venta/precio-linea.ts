/**
 * Precio de cada línea del carrito de la caja.
 *
 * Vive aparte del terminal para poder probarlo solo: decide cuánto se cobra
 * por prenda según la cantidad del carrito (precio público, mayorista o
 * fábrica), lo cotizado y lo que el cajero escriba a mano.
 */

export type ConfigEscalones = { mayorista_desde: number; industrial_desde: number; activos: boolean };
export type EscalonAplicado = 'PUBLICO' | 'MAYORISTA' | 'INDUSTRIAL';
export type PreciosVariante = {
  precio_publico: number | null;
  precio_mayorista_a?: number | null;
  precio_industrial?: number | null;
};

/**
 * Calcula el precio unitario según la cantidad y la configuración de escalones.
 * - Si los escalones están desactivados, siempre devuelve precio_publico.
 * - Si la variante no tiene precio_mayorista_a / precio_industrial cargados,
 *   cae a precio_publico (no se rompe el flujo de venta).
 */
export function calcularPrecioPorCantidad(
  v: PreciosVariante,
  cantidad: number,
  cfg: ConfigEscalones,
): { precio: number; escalon: EscalonAplicado } {
  const publico = Number(v.precio_publico ?? 0);
  if (!cfg.activos || cantidad < cfg.mayorista_desde) {
    return { precio: publico, escalon: 'PUBLICO' };
  }
  if (cantidad >= cfg.industrial_desde) {
    const industrial = Number(v.precio_industrial ?? 0);
    return industrial > 0
      ? { precio: industrial, escalon: 'INDUSTRIAL' }
      : { precio: Number(v.precio_mayorista_a ?? publico), escalon: 'MAYORISTA' };
  }
  const mayorista = Number(v.precio_mayorista_a ?? 0);
  return mayorista > 0
    ? { precio: mayorista, escalon: 'MAYORISTA' }
    : { precio: publico, escalon: 'PUBLICO' };
}

/**
 * Precio final de una línea.
 *
 * Prioridad: lo que escribió el cajero a mano > lo cotizado como TOPE > el
 * escalón por cantidad. Lo cotizado no es un precio fijo: se cobra el menor
 * entre lo cotizado y lo que corresponde hoy por cantidad. Antes se congelaba
 * y una cotización cargada que pasaba las 100 prendas no bajaba nunca a precio
 * fábrica (COT-00007/COT-00008, 01/10/2026).
 */
export function precioDeLinea(a: {
  variante: PreciosVariante;
  totalItems: number;
  cfg: ConfigEscalones;
  manual?: number | null;
  cotizado?: number | null;
  descuento?: number | null;
}): { precioFinal: number; porCantidad: number; precioManual: number | null; escalon: EscalonAplicado } {
  const r = calcularPrecioPorCantidad(a.variante, a.totalItems, a.cfg);
  const porCantidad = a.cotizado != null ? Math.min(a.cotizado, r.precio) : r.precio;
  const base = a.manual ?? porCantidad;
  return {
    precioFinal: Math.max(0, base - (a.descuento ?? 0)),
    porCantidad,
    precioManual: a.manual ?? null,
    escalon: r.escalon,
  };
}
