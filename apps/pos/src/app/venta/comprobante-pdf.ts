/**
 * Generador de comprobantes PDF (cliente).
 *
 * - `generarTicket`: papel térmico 80mm × alto dinámico.
 * - `generarA4`: hoja A4 vertical con look profesional.
 *
 * No es 'use server' a propósito: jsPDF corre mejor en el cliente y nos evita
 * round-trip de un binario que vamos a imprimir/descargar localmente.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ComprobantePDFData } from '@/server/actions/caja-helpers';
import { tipoComprobanteLabel, metodoLabel } from '@/server/actions/caja-helpers';

// ----------------------------------------------------------------------------
// Paleta corporativa (RGB plano para jsPDF)
// ----------------------------------------------------------------------------
const COLOR = {
  naranja: [255, 77, 13] as [number, number, number],
  azul: [30, 58, 95] as [number, number, number],
  textoOscuro: [15, 23, 42] as [number, number, number],
  textoSuave: [100, 116, 139] as [number, number, number],
  bgSuave: [248, 250, 252] as [number, number, number],
  verde: [16, 185, 129] as [number, number, number],
};

function fmt(n: number): string {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// TICKET TÉRMICO 80MM
// ============================================================================
export function generarTicket(data: ComprobantePDFData): Blob {
  // 80mm térmico — convertimos a puntos: 1mm ≈ 2.834pt. Ancho 80mm = 226.77pt.
  // Alto dinámico: empezamos con 800pt y luego recortamos.
  const WIDTH_MM = 80;
  const WIDTH = WIDTH_MM * 2.83464567;

  // Calcular alto estimado en líneas
  const estimadoLineas = 26 + data.items.length * 2 + data.pagos.length;
  const ALTO_LINEA = 11; // pt
  const HEIGHT = Math.max(380, 60 + estimadoLineas * ALTO_LINEA);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [WIDTH, HEIGHT] });

  const PAD_X = 8;
  let y = 16;

  // ---- Cabecera empresa ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.textoOscuro);
  const empresaNombre = data.empresa.nombre_comercial || data.empresa.razon_social;
  doc.text(empresaNombre, WIDTH / 2, y, { align: 'center' });
  y += 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.textoSuave);
  doc.text(data.empresa.razon_social, WIDTH / 2, y, { align: 'center' });
  y += 10;
  doc.text(`RUC ${data.empresa.ruc}`, WIDTH / 2, y, { align: 'center' });
  y += 10;

  if (data.empresa.direccion_fiscal) {
    const lines = doc.splitTextToSize(data.empresa.direccion_fiscal, WIDTH - PAD_X * 2);
    doc.text(lines, WIDTH / 2, y, { align: 'center' });
    y += lines.length * 9;
  }
  if (data.empresa.telefono) {
    doc.text(`Tel. ${data.empresa.telefono}`, WIDTH / 2, y, { align: 'center' });
    y += 10;
  }

  y += 4;
  doc.setDrawColor(...COLOR.textoSuave);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 12;

  // ---- Tipo y número ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.naranja);
  doc.text(tipoComprobanteLabel(data.comprobante.tipo), WIDTH / 2, y, { align: 'center' });
  y += 12;
  doc.setTextColor(...COLOR.textoOscuro);
  doc.text(data.comprobante.numero_completo, WIDTH / 2, y, { align: 'center' });
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.textoSuave);
  doc.text(new Date(data.comprobante.fecha).toLocaleString('es-PE'), WIDTH / 2, y, { align: 'center' });
  y += 12;

  // ---- Cliente ----
  doc.setDrawColor(...COLOR.textoSuave);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 11;

  doc.setFontSize(8);
  doc.setTextColor(...COLOR.textoOscuro);
  if (data.cliente.tipo_documento && data.cliente.numero_documento) {
    doc.text(`${data.cliente.tipo_documento}: ${data.cliente.numero_documento}`, PAD_X, y);
    y += 10;
  }
  const nombreLines = doc.splitTextToSize(data.cliente.nombre_o_razon_social || 'CLIENTE VARIOS', WIDTH - PAD_X * 2);
  doc.text(nombreLines, PAD_X, y);
  y += nombreLines.length * 9;
  if (data.cliente.direccion) {
    const dirLines = doc.splitTextToSize(data.cliente.direccion, WIDTH - PAD_X * 2);
    doc.setTextColor(...COLOR.textoSuave);
    doc.text(dirLines, PAD_X, y);
    y += dirLines.length * 9;
    doc.setTextColor(...COLOR.textoOscuro);
  }

  y += 4;
  doc.setDrawColor(...COLOR.textoSuave);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 11;

  // ---- Items ----
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('CANT', PAD_X, y);
  doc.text('DESCRIPCIÓN', PAD_X + 26, y);
  doc.text('TOTAL', WIDTH - PAD_X, y, { align: 'right' });
  y += 10;
  doc.setFont('helvetica', 'normal');

  data.items.forEach((it) => {
    doc.text(String(it.cantidad), PAD_X, y);
    const descLines = doc.splitTextToSize(it.descripcion, WIDTH - PAD_X - 26 - 50);
    doc.text(descLines, PAD_X + 26, y);
    doc.text(`S/ ${fmt(it.sub_total)}`, WIDTH - PAD_X, y, { align: 'right' });
    y += Math.max(descLines.length * 9, 10);
    // precio unitario en línea secundaria si cantidad > 1
    if (it.cantidad > 1) {
      doc.setTextColor(...COLOR.textoSuave);
      doc.setFontSize(7);
      doc.text(`${it.cantidad} × S/ ${fmt(it.precio_unitario)}`, PAD_X + 26, y);
      y += 9;
      doc.setFontSize(8);
      doc.setTextColor(...COLOR.textoOscuro);
    }
  });

  y += 2;
  doc.setDrawColor(...COLOR.textoSuave);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 11;

  // ---- Totales ----
  const rotuloX = WIDTH - PAD_X - 90;
  doc.setFontSize(8);
  doc.text('Sub-total', rotuloX, y);
  doc.text(`S/ ${fmt(data.totales.sub_total)}`, WIDTH - PAD_X, y, { align: 'right' });
  y += 10;
  doc.text(`IGV (${data.comprobante.igv_porcentaje}%)`, rotuloX, y);
  doc.text(`S/ ${fmt(data.totales.igv)}`, WIDTH - PAD_X, y, { align: 'right' });
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', rotuloX, y);
  doc.text(`S/ ${fmt(data.totales.total)}`, WIDTH - PAD_X, y, { align: 'right' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  // ---- Pagos ----
  if (data.pagos.length > 0) {
    doc.setDrawColor(...COLOR.textoSuave);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(PAD_X, y, WIDTH - PAD_X, y);
    doc.setLineDashPattern([], 0);
    y += 11;
    doc.setTextColor(...COLOR.textoOscuro);
    doc.text('Pagos:', PAD_X, y);
    y += 10;
    data.pagos.forEach((p) => {
      doc.text(metodoLabel(p.metodo), PAD_X, y);
      doc.text(`S/ ${fmt(p.monto)}`, WIDTH - PAD_X, y, { align: 'right' });
      y += 10;
    });
  }

  y += 4;
  doc.setDrawColor(...COLOR.textoSuave);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 11;

  // ---- Vendedor + leyenda ----
  doc.setTextColor(...COLOR.textoSuave);
  doc.setFontSize(7);
  doc.text(`Atendido por: ${data.vendedor}`, PAD_X, y);
  y += 10;

  const leyenda = data.comprobante.tipo === 'NOTA_VENTA'
    ? 'Documento interno — no tiene validez tributaria.'
    : `Representación impresa de la ${tipoComprobanteLabel(data.comprobante.tipo)}.`;
  const leyLines = doc.splitTextToSize(leyenda, WIDTH - PAD_X * 2);
  doc.text(leyLines, WIDTH / 2, y, { align: 'center' });
  y += leyLines.length * 8 + 4;
  doc.text('¡Gracias por su compra!', WIDTH / 2, y, { align: 'center' });

  return doc.output('blob');
}

// ============================================================================
// FORMATO A4
// ============================================================================
export function generarA4(data: ComprobantePDFData): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const MARGIN = 40;

  // ---- Cabecera: empresa (izq) + recuadro tipo comprobante (der) ----
  const boxW = 200;
  const boxH = 90;
  const boxX = pageW - MARGIN - boxW;
  const boxY = MARGIN;

  // Datos empresa (izquierda)
  let yL = MARGIN + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLOR.naranja);
  doc.text(data.empresa.nombre_comercial || data.empresa.razon_social, MARGIN, yL);
  yL += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.textoOscuro);
  if (data.empresa.nombre_comercial) {
    doc.text(data.empresa.razon_social, MARGIN, yL);
    yL += 11;
  }
  doc.setTextColor(...COLOR.textoSuave);
  if (data.empresa.direccion_fiscal) {
    const lines = doc.splitTextToSize(data.empresa.direccion_fiscal, boxX - MARGIN - 10);
    doc.text(lines, MARGIN, yL);
    yL += lines.length * 11;
  }
  if (data.empresa.telefono) {
    doc.text(`Tel. ${data.empresa.telefono}`, MARGIN, yL);
    yL += 11;
  }
  if (data.empresa.email) {
    doc.text(data.empresa.email, MARGIN, yL);
    yL += 11;
  }

  // Recuadro tipo de comprobante (derecha) — estilo SUNAT
  doc.setDrawColor(...COLOR.azul);
  doc.setLineWidth(1.5);
  doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4);
  doc.setLineWidth(0.5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.azul);
  doc.text(`RUC ${data.empresa.ruc}`, boxX + boxW / 2, boxY + 18, { align: 'center' });

  doc.setFontSize(11);
  doc.text(tipoComprobanteLabel(data.comprobante.tipo), boxX + boxW / 2, boxY + 42, { align: 'center', maxWidth: boxW - 16 });

  doc.setFontSize(13);
  doc.setTextColor(...COLOR.naranja);
  doc.text(data.comprobante.numero_completo, boxX + boxW / 2, boxY + 72, { align: 'center' });

  // ---- Datos del cliente ----
  let y = Math.max(yL, boxY + boxH) + 20;

  doc.setFillColor(...COLOR.bgSuave);
  doc.setDrawColor(...COLOR.textoSuave);
  doc.rect(MARGIN, y, pageW - MARGIN * 2, 60, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.textoSuave);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', MARGIN + 10, y + 14);
  doc.text('DOCUMENTO', pageW / 2, y + 14);
  doc.text('FECHA EMISIÓN', pageW / 2 + 130, y + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.textoOscuro);
  const nombreCli = doc.splitTextToSize(data.cliente.nombre_o_razon_social || 'CLIENTE VARIOS', pageW / 2 - MARGIN - 20);
  doc.text(nombreCli, MARGIN + 10, y + 30);

  const doc2 = data.cliente.tipo_documento && data.cliente.numero_documento
    ? `${data.cliente.tipo_documento} ${data.cliente.numero_documento}`
    : '—';
  doc.text(doc2, pageW / 2, y + 30);
  doc.text(new Date(data.comprobante.fecha).toLocaleDateString('es-PE'), pageW / 2 + 130, y + 30);

  if (data.cliente.direccion) {
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.textoSuave);
    const dirLines = doc.splitTextToSize(`Dirección: ${data.cliente.direccion}`, pageW - MARGIN * 2 - 20);
    doc.text(dirLines, MARGIN + 10, y + 50);
  }
  y += 80;

  // ---- Tabla de items ----
  const head = [['#', 'Descripción', 'Cant.', 'P. Unit.', 'Sub-total']];
  const body = data.items.map((it, i) => [
    String(i + 1),
    it.descripcion,
    String(it.cantidad),
    `S/ ${fmt(it.precio_unitario)}`,
    `S/ ${fmt(it.sub_total)}`,
  ]);

  autoTable(doc, {
    head,
    body,
    startY: y,
    theme: 'grid',
    headStyles: {
      fillColor: COLOR.azul,
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      cellPadding: 6,
    },
    bodyStyles: { fontSize: 9, textColor: COLOR.textoOscuro, cellPadding: 5 },
    alternateRowStyles: { fillColor: COLOR.bgSuave },
    columnStyles: {
      0: { halign: 'center', cellWidth: 25 },
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 50 },
      3: { halign: 'right', cellWidth: 75 },
      4: { halign: 'right', cellWidth: 80 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });

  // jspdf-autotable agrega `lastAutoTable` al doc en runtime
  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 100;
  y = lastY + 14;

  // ---- Totales (derecha) ----
  const totalsX = pageW - MARGIN - 200;
  const totalsW = 200;

  doc.setFontSize(9);
  doc.setTextColor(...COLOR.textoOscuro);

  const drawTotalRow = (label: string, value: string, opts?: { bold?: boolean; highlight?: boolean }) => {
    if (opts?.highlight) {
      doc.setFillColor(...COLOR.naranja);
      doc.rect(totalsX, y - 10, totalsW, 22, 'F');
      doc.setTextColor(255, 255, 255);
    } else {
      doc.setTextColor(...COLOR.textoOscuro);
    }
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.highlight ? 11 : 9);
    doc.text(label, totalsX + 10, y + 4);
    doc.text(value, totalsX + totalsW - 10, y + 4, { align: 'right' });
    y += opts?.highlight ? 24 : 14;
  };

  drawTotalRow('Sub-total', `S/ ${fmt(data.totales.sub_total)}`);
  drawTotalRow(`IGV (${data.comprobante.igv_porcentaje}%)`, `S/ ${fmt(data.totales.igv)}`);
  drawTotalRow('TOTAL', `S/ ${fmt(data.totales.total)}`, { bold: true, highlight: true });

  // ---- Pagos ----
  if (data.pagos.length > 0) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR.azul);
    doc.text('Forma de pago', MARGIN, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.textoOscuro);
    data.pagos.forEach((p) => {
      doc.text(`• ${metodoLabel(p.metodo)} — S/ ${fmt(p.monto)}`, MARGIN, y);
      y += 11;
    });
  }

  // ---- Pie ----
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLOR.textoSuave);
  doc.line(MARGIN, pageH - 60, pageW - MARGIN, pageH - 60);
  doc.setFontSize(7);
  doc.setTextColor(...COLOR.textoSuave);
  const leyenda = data.comprobante.tipo === 'NOTA_VENTA'
    ? 'Documento interno — sin validez tributaria.'
    : `Representación impresa de la ${tipoComprobanteLabel(data.comprobante.tipo)}.`;
  doc.text(leyenda, MARGIN, pageH - 45);
  doc.text(`Atendido por: ${data.vendedor}`, MARGIN, pageH - 33);
  doc.text(
    `Emitido el ${new Date(data.comprobante.fecha).toLocaleString('es-PE')}`,
    pageW - MARGIN,
    pageH - 33,
    { align: 'right' },
  );

  return doc.output('blob');
}

// ----------------------------------------------------------------------------
// Util — abrir/descargar Blob
// ----------------------------------------------------------------------------
export function abrirPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // También abrimos en nueva pestaña para impresión rápida
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
