/**
 * Montos de una línea de orden de compra, con el precio escrito con o sin IGV.
 *
 * El precio de muchos materiales ya incluye IGV (el material lo dice). La OC
 * le sumaba el 18 % encima igual, y para no pagar de más se terminaba
 * calculando la base a mano (OC-26-00002: 12,7118) o desactivando el IGV, que
 * deja la orden sin desglose (OC-26-00003 a 00007). Lo reportó el cliente el
 * 07/10/2026.
 *
 * Ahora cada línea dice si su precio viene con IGV. Si viene, el monto se
 * DESCOMPONE (base = monto / 1,18) en vez de sumarle el IGV. En la base se
 * guarda siempre el precio SIN IGV —es el costo del material, y lo que usan la
 * recepción y el kardex—, y los totales salen del monto escrito, exactos.
 */

export const TASA_IGV = 0.18;

export type LineaOcMonto = {
  cantidad: number;
  /** El precio tal como lo escribe el usuario. */
  precio: number;
  descuento_porcentaje?: number | null;
  igv_aplicable: boolean;
  /** El precio escrito ya incluye IGV. */
  precio_incluye_igv?: boolean;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Base (sin IGV), IGV y total de una línea, y el precio unitario sin IGV para guardar. */
export function montosLineaOc(l: LineaOcMonto): { base: number; igv: number; total: number; precioSinIgv: number } {
  const factor = 1 - (l.descuento_porcentaje ?? 0) / 100;
  const escrito = l.cantidad * l.precio * factor;
  const incluye = Boolean(l.precio_incluye_igv) && l.igv_aplicable;
  if (incluye) {
    const total = r2(escrito);
    const base = r2(total / (1 + TASA_IGV));
    return { base, igv: r2(total - base), total, precioSinIgv: l.precio / (1 + TASA_IGV) };
  }
  const base = r2(escrito);
  const igv = l.igv_aplicable ? r2(base * TASA_IGV) : 0;
  return { base, igv, total: r2(base + igv), precioSinIgv: l.precio };
}

/** Totales de la orden: suma de las líneas. */
export function totalesOc(lineas: LineaOcMonto[]): { sub_total: number; igv: number; total: number } {
  let sub = 0, igv = 0, total = 0;
  for (const l of lineas) {
    const m = montosLineaOc(l);
    sub += m.base; igv += m.igv; total += m.total;
  }
  return { sub_total: r2(sub), igv: r2(igv), total: r2(total) };
}
