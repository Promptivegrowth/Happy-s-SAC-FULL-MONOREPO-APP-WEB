/**
 * Códigos de barras CODE 128 para etiquetas y tickets.
 *
 * Vive en @happy/lib porque lo usan dos apps: el ERP para imprimir las
 * etiquetas de las prendas y el POS para el ticket de prueba de la pistola.
 *
 * Se aprovecha el codificador de JsBarcode, pero NO su dibujado: JsBarcode
 * pinta sobre <canvas> o <svg>, y aquí las barras se dibujan como rectángulos
 * vectoriales en el PDF. En una térmica de 203 dpi una barra rasterizada se
 * redondea al píxel y ensancha o adelgaza módulos; el vector lo resuelve la
 * impresora a su propia resolución.
 */

import { CODE128 } from 'jsbarcode/bin/barcodes/CODE128/index.js';

/** Zona muda a cada lado del código; por norma CODE 128, 10 módulos mínimo. */
export const QUIET_MODULOS = 10;

/**
 * Ancho mínimo recomendado del módulo (la barra más fina) en milímetros.
 * A 203 dpi (8 puntos/mm) son 2 puntos, el piso práctico de una térmica: por
 * debajo de eso el lector empieza a fallar.
 */
export const MODULO_MIN_MM = 0.25;

/**
 * Caracteres imprimibles ASCII. Es el subconjunto que CODE 128 escribe sin
 * códigos de control y el único que una pistola devuelve tal cual al POS.
 *
 * El validador de JsBarcode acepta además el rango 200-211, que son sus
 * marcadores internos de juego de caracteres; una "Ñ" (209) le pasa la
 * validación y después revienta al codificar. Por eso se filtra acá.
 */
const ASCII_IMPRIMIBLE = /^[\x20-\x7E]+$/;

/** true si el texto se puede representar en CODE 128 sin sorpresas. */
export function esCodigoImprimible(codigo: string): boolean {
  const c = (codigo ?? '').trim();
  if (!c) return false;
  if (!ASCII_IMPRIMIBLE.test(c)) return false;
  try {
    codificarCode128(c);
    return true;
  } catch {
    return false;
  }
}

/**
 * Codifica el texto a la secuencia de módulos: "1" = barra, "0" = espacio.
 * Lanza con un mensaje en castellano si el texto no es representable.
 */
export function codificarCode128(codigo: string): string {
  const c = (codigo ?? '').trim();
  if (!c) throw new Error('El código está vacío');
  if (!ASCII_IMPRIMIBLE.test(c)) {
    throw new Error('Tiene tildes, eñes o símbolos que el código de barras no admite (usa solo letras sin tilde, números y guiones)');
  }
  const b = new CODE128(c, { ean128: false });
  if (!b.valid()) throw new Error('No se puede representar en código de barras');
  return b.encode().data;
}

/**
 * Ancho del módulo más fino si el código completo (zonas mudas incluidas) ocupa
 * `anchoMm` milímetros. Sirve para avisar antes de imprimir algo ilegible.
 */
export function anchoModuloMm(codigo: string, anchoMm: number): number {
  const modulos = codificarCode128(codigo).length + QUIET_MODULOS * 2;
  return anchoMm / modulos;
}

// jsPDF no está en las dependencias de este paquete a propósito: el documento
// llega por parámetro desde la app que sí la tiene.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocPDF = any;

/**
 * Dibuja el código de barras dentro del rectángulo (x, y, ancho, alto), EN LAS
 * UNIDADES DEL DOCUMENTO: milímetros en las etiquetas del ERP, puntos en el
 * ticket del POS. El ancho incluye las dos zonas mudas.
 */
export function dibujarBarrasPDF(
  doc: DocPDF,
  codigo: string,
  x: number,
  y: number,
  ancho: number,
  alto: number,
): void {
  const modulos = codificarCode128(codigo);
  const total = modulos.length + QUIET_MODULOS * 2;
  const w = ancho / total;
  const xInicio = x + QUIET_MODULOS * w;

  doc.setFillColor(0, 0, 0);
  // Se agrupan los "1" consecutivos en un solo rectángulo: menos objetos en el
  // PDF y, sobre todo, sin costuras blancas entre barras contiguas.
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] === '1') {
      let j = i;
      while (j < modulos.length && modulos[j] === '1') j++;
      doc.rect(xInicio + i * w, y, (j - i) * w, alto, 'F');
      i = j;
    } else {
      i++;
    }
  }
}
