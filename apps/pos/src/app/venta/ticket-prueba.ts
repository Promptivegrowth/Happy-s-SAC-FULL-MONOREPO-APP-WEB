/**
 * TICKET DE PRUEBA de la impresora y de la pistola.
 *
 * No es un comprobante: no toca la base de datos, no consume correlativo y no
 * se envía a SUNAT. Sirve para que la tienda verifique en un solo papel:
 *
 *   1. que la impresora imprime y con qué ancho real (lleva una regla impresa),
 *   2. que el negro sale parejo (bloque de prueba de temperatura),
 *   3. que las tildes y la Ñ salen bien,
 *   4. que el corte cae donde debe,
 *   5. que la pistola lee — con códigos de barras de productos REALES, así que
 *      al escanearlos en el POS la prenda tiene que entrar al carrito.
 *
 * Mismo ancho de papel que el comprobante real (80 mm) y alto dinámico, para
 * que lo que se verifica acá sea exactamente lo que va a pasar al vender.
 */

import { jsPDF } from 'jspdf';
import { dibujarBarrasPDF, esCodigoImprimible } from '@happy/lib/barcode';

/** Un producto real para escanear con la pistola. */
export type MuestraPrueba = {
  /** El código que se imprime como barras: código de barras o, si no hay, el SKU. */
  codigo: string;
  nombre: string;
  /** Talla ya formateada para mostrar, ej. "6" o "Única". */
  talla: string;
  /** true si el código impreso es el SKU porque la talla no tiene código de barras. */
  esSku?: boolean;
};

const MM = 2.83464567;

/** 80 mm, igual que la boleta. */
const ANCHO = 80 * MM;
const PAD = 8;

/** Alto de cada bloque de código de barras, en puntos. */
const ALTO_BARRAS = 42;

export function generarTicketPrueba(opts: {
  empresaNombre: string;
  caja: string;
  cajero: string;
  muestras: MuestraPrueba[];
  /** Fecha y hora ya formateadas en hora de Perú. */
  fechaHora: string;
}): Blob {
  const muestras = opts.muestras.filter((m) => esCodigoImprimible(m.codigo));

  // El alto se calcula, no se adivina: cada bloque de muestra ocupa lo mismo y
  // el resto del ticket es fijo. Si sobra papel, la térmica avanza en blanco.
  const ALTO_MUESTRA = ALTO_BARRAS + 34;
  const alto = 360 + muestras.length * ALTO_MUESTRA;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [ANCHO, alto] });
  let y = 16;

  const centro = (texto: string, dy = 11) => {
    doc.text(texto, ANCHO / 2, y, { align: 'center' });
    y += dy;
  };
  const separador = (punteado = true) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    if (punteado) doc.setLineDashPattern([2, 2], 0);
    doc.line(PAD, y, ANCHO - PAD, y);
    doc.setLineDashPattern([], 0);
    y += 10;
  };

  // ------------------------------------------------------------- cabecera
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  centro('TICKET DE PRUEBA', 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  centro('No es comprobante de pago', 10);
  centro('No se registra ninguna venta', 12);

  doc.setFontSize(8);
  centro(opts.empresaNombre, 10);
  centro(`Caja: ${opts.caja}`, 10);
  centro(`Cajero: ${opts.cajero}`, 10);
  centro(opts.fechaHora, 12);
  separador();

  // -------------------------------------------- 1. ancho y calidad de papel
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('1. ANCHO DEL PAPEL', PAD, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Las dos flechas deben quedar dentro del papel:', PAD, y);
  y += 11;

  // Regla de 70 mm con marcas cada 10 mm. Si el papel corta la regla, el
  // tamaño configurado en el driver no coincide con el rollo cargado.
  const x0 = PAD;
  const x1 = ANCHO - PAD;
  doc.setLineWidth(0.8);
  doc.line(x0, y, x1, y);
  for (let mm = 0; mm <= 70; mm += 10) {
    const x = x0 + mm * MM;
    if (x > x1) break;
    doc.line(x, y - 3, x, y + 3);
    doc.setFontSize(5.5);
    doc.text(String(mm), x, y + 9, { align: 'center' });
  }
  doc.setFontSize(8);
  doc.text('>', x0 - 1, y + 2);
  doc.text('<', x1 - 3, y + 2);
  y += 18;

  // Bloque negro: si sale gris o con vetas, hay que subir la temperatura
  // (densidad) en el driver o el papel es de mala calidad.
  doc.setFillColor(0, 0, 0);
  doc.rect(PAD, y, ANCHO - PAD * 2, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('ESTE BLOQUE DEBE SALIR NEGRO PAREJO', ANCHO / 2, y + 8.5, { align: 'center' });
  y += 20;
  doc.setTextColor(0, 0, 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Tildes y ñ: ÁÉÍÓÚ áéíóú Ññ ¿? ¡! S/ 1,234.56', PAD, y);
  y += 10;
  doc.setFontSize(9);
  doc.text('Cuerpo 9 — el del total de la boleta', PAD, y);
  y += 12;
  separador();

  // ------------------------------------------------------- 2. la pistola
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('2. LA PISTOLA', PAD, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  if (muestras.length === 0) {
    doc.text('Sin productos con código para probar.', PAD, y);
    y += 11;
  } else {
    const lineas = doc.splitTextToSize(
      'Escanea estos códigos en el buscador del POS. Cada uno debe agregar al carrito la prenda y la talla que dice debajo.',
      ANCHO - PAD * 2,
    ) as string[];
    doc.text(lineas, PAD, y);
    y += lineas.length * 9 + 4;

    for (const m of muestras) {
      dibujarBarrasPDF(doc, m.codigo, PAD, y, ANCHO - PAD * 2, ALTO_BARRAS);
      y += ALTO_BARRAS + 9;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(m.codigo, ANCHO / 2, y, { align: 'center' });
      y += 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      const etiqueta = `${m.nombre} · talla ${m.talla}${m.esSku ? ' (código interno)' : ''}`;
      const ls = doc.splitTextToSize(etiqueta, ANCHO - PAD * 2) as string[];
      doc.text(ls.slice(0, 2), ANCHO / 2, y, { align: 'center' });
      y += Math.min(ls.length, 2) * 8 + 7;
    }
  }
  separador();

  // ---------------------------------------------------------- 3. el corte
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('3. EL CORTE', PAD, y);
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const corte = doc.splitTextToSize(
    'El papel debe cortarse sobre la línea de abajo. Si no corta, actívalo en las preferencias del driver de la impresora (Cortar al final del documento).',
    ANCHO - PAD * 2,
  ) as string[];
  doc.text(corte, PAD, y);
  y += corte.length * 9 + 8;

  doc.setFontSize(7);
  doc.text('— — — — — —  cortar aquí  — — — — — —', ANCHO / 2, y, { align: 'center' });
  y += 12;

  return doc.output('blob');
}

/** Alto que va a tener el ticket; se usa en las pruebas para verificar que entra. */
export function altoTicketPrueba(cantidadMuestras: number): number {
  return 360 + cantidadMuestras * (ALTO_BARRAS + 34);
}
