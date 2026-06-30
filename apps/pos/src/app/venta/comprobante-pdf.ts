/**
 * Generador de comprobantes PDF (cliente).
 *
 * - `generarTicket`: papel térmico 80mm × alto dinámico. BLANCO Y NEGRO.
 * - `generarA4`: hoja A4 vertical con look profesional. A COLOR.
 *
 * Ambos incluyen:
 *  - Logo de la empresa (descargado desde empresa.logo_url)
 *  - QR SUNAT con cadena obligatoria (RUC|TIPO|SERIE|NUM|IGV|TOTAL|FECHA|TIPO_DOC_CLI|NUM_DOC_CLI)
 *  - Datos completos del cliente y emisor según Resolución SUNAT 097-2012
 *
 * No es 'use server' a propósito: jsPDF y qrcode corren mejor en cliente.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import type { ComprobantePDFData } from '@/server/actions/caja-helpers';
import { tipoComprobanteLabel, metodoLabel } from '@/server/actions/caja-helpers';

// ----------------------------------------------------------------------------
// Paleta corporativa
// ----------------------------------------------------------------------------
const COLOR = {
  naranja: [255, 77, 13] as [number, number, number],
  azul: [30, 58, 95] as [number, number, number],
  textoOscuro: [15, 23, 42] as [number, number, number],
  textoSuave: [100, 116, 139] as [number, number, number],
  bgSuave: [248, 250, 252] as [number, number, number],
  negro: [0, 0, 0] as [number, number, number],
  gris: [80, 80, 80] as [number, number, number],
};

function fmt(n: number): string {
  return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ----------------------------------------------------------------------------
// Mapeos SUNAT
// ----------------------------------------------------------------------------
function codigoTipoComprobante(tipo: string): string {
  switch (tipo) {
    case 'FACTURA': return '01';
    case 'BOLETA': return '03';
    case 'NOTA_CREDITO': return '07';
    case 'NOTA_DEBITO': return '08';
    case 'GUIA_REMISION': return '09';
    default: return '00'; // NOTA_VENTA
  }
}

function codigoTipoDocCliente(t: string | null | undefined): string {
  switch (t) {
    case 'DNI': return '1';
    case 'CE': return '4';
    case 'RUC': return '6';
    case 'PASAPORTE': return '7';
    default: return '0';
  }
}

/** Cadena SUNAT para QR (Resolución 097-2012/SUNAT). Pipes como separador. */
function cadenaQrSunat(data: ComprobantePDFData): string {
  const fechaISO = new Date(data.comprobante.fecha).toISOString().slice(0, 10);
  return [
    data.empresa.ruc,
    codigoTipoComprobante(data.comprobante.tipo),
    data.comprobante.numero_completo.split('-')[0] ?? '',     // serie
    data.comprobante.numero_completo.split('-')[1] ?? '',     // número correlativo
    data.totales.igv.toFixed(2),
    data.totales.total.toFixed(2),
    fechaISO,
    codigoTipoDocCliente(data.cliente.tipo_documento ?? null),
    data.cliente.numero_documento ?? '',
  ].join('|');
}

// ----------------------------------------------------------------------------
// Carga del logo
// ----------------------------------------------------------------------------
async function fetchLogoBase64(url: string | null | undefined, grayscale = false): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(blob);
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    if (grayscale) {
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const lum = 0.299 * id.data[i]! + 0.587 * id.data[i + 1]! + 0.114 * id.data[i + 2]!;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = lum;
      }
      ctx.putImageData(id, 0, 0);
    }
    return { data: canvas.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    return null;
  }
}

async function generarQrPNG(texto: string, size = 120): Promise<string> {
  try {
    return await QRCode.toDataURL(texto, { width: size, margin: 1, errorCorrectionLevel: 'M' });
  } catch {
    return '';
  }
}

// ============================================================================
// TICKET TÉRMICO 80MM — BLANCO Y NEGRO
// ============================================================================
export async function generarTicket(data: ComprobantePDFData): Promise<Blob> {
  const WIDTH_MM = 80;
  const WIDTH = WIDTH_MM * 2.83464567;
  const PAD_X = 8;

  // Pre-cargar logo (grayscale) y QR en paralelo
  const [logo, qr] = await Promise.all([
    fetchLogoBase64(data.empresa.logo_url, true),
    generarQrPNG(cadenaQrSunat(data), 90),
  ]);

  const estimadoLineas = 30 + data.items.length * 2 + data.pagos.length;
  const ALTO_LINEA = 11;
  const HEIGHT = Math.max(420, 80 + estimadoLineas * ALTO_LINEA);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: [WIDTH, HEIGHT] });
  let y = 14;

  // ---- Logo (B/N, centrado, max 60pt de alto) ----
  if (logo) {
    const maxH = 55;
    const ratio = logo.h / logo.w;
    const w = Math.min(WIDTH - PAD_X * 2 - 40, maxH / ratio);
    const h = w * ratio;
    const x = (WIDTH - w) / 2;
    doc.addImage(logo.data, 'PNG', x, y, w, h);
    y += h + 6;
  }

  // ---- Cabecera empresa ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.negro);
  const empresaNombre = data.empresa.nombre_comercial || data.empresa.razon_social;
  doc.text(empresaNombre, WIDTH / 2, y, { align: 'center' });
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.gris);
  if (data.empresa.nombre_comercial) {
    doc.text(data.empresa.razon_social, WIDTH / 2, y, { align: 'center' });
    y += 10;
  }
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
  doc.setDrawColor(...COLOR.negro);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 12;

  // ---- Tipo y número (en negro) ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLOR.negro);
  doc.text(tipoComprobanteLabel(data.comprobante.tipo), WIDTH / 2, y, { align: 'center' });
  y += 12;
  doc.text(data.comprobante.numero_completo, WIDTH / 2, y, { align: 'center' });
  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLOR.gris);
  doc.text(new Date(data.comprobante.fecha).toLocaleString('es-PE'), WIDTH / 2, y, { align: 'center' });
  y += 12;

  // ---- Cliente ----
  doc.setDrawColor(...COLOR.negro);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 11;

  doc.setFontSize(8);
  doc.setTextColor(...COLOR.negro);
  if (data.cliente.tipo_documento && data.cliente.numero_documento) {
    doc.text(`${data.cliente.tipo_documento}: ${data.cliente.numero_documento}`, PAD_X, y);
    y += 10;
  }
  const nombreLines = doc.splitTextToSize(data.cliente.nombre_o_razon_social || 'CLIENTE VARIOS', WIDTH - PAD_X * 2);
  doc.text(nombreLines, PAD_X, y);
  y += nombreLines.length * 9;
  if (data.cliente.direccion) {
    const dirLines = doc.splitTextToSize(data.cliente.direccion, WIDTH - PAD_X * 2);
    doc.setTextColor(...COLOR.gris);
    doc.text(dirLines, PAD_X, y);
    y += dirLines.length * 9;
    doc.setTextColor(...COLOR.negro);
  }

  y += 4;
  doc.setDrawColor(...COLOR.negro);
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
    if (it.cantidad > 1) {
      doc.setTextColor(...COLOR.gris);
      doc.setFontSize(7);
      doc.text(`${it.cantidad} × S/ ${fmt(it.precio_unitario)}`, PAD_X + 26, y);
      y += 9;
      doc.setFontSize(8);
      doc.setTextColor(...COLOR.negro);
    }
  });

  y += 2;
  doc.setDrawColor(...COLOR.negro);
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
    doc.setDrawColor(...COLOR.negro);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(PAD_X, y, WIDTH - PAD_X, y);
    doc.setLineDashPattern([], 0);
    y += 11;
    doc.setTextColor(...COLOR.negro);
    doc.text('Pagos:', PAD_X, y);
    y += 10;
    data.pagos.forEach((p) => {
      doc.text(metodoLabel(p.metodo), PAD_X, y);
      doc.text(`S/ ${fmt(p.monto)}`, WIDTH - PAD_X, y, { align: 'right' });
      y += 10;
    });
  }

  y += 4;
  doc.setDrawColor(...COLOR.negro);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(PAD_X, y, WIDTH - PAD_X, y);
  doc.setLineDashPattern([], 0);
  y += 11;

  // ---- QR centrado ----
  if (qr) {
    const qrSize = 80;
    const qrX = (WIDTH - qrSize) / 2;
    doc.addImage(qr, 'PNG', qrX, y, qrSize, qrSize);
    y += qrSize + 6;
  }

  // ---- Vendedor + leyenda ----
  doc.setTextColor(...COLOR.gris);
  doc.setFontSize(7);
  doc.text(`Atendido por: ${data.vendedor}`, PAD_X, y);
  y += 10;

  const leyenda = data.comprobante.tipo === 'NOTA_VENTA'
    ? 'Documento interno — no tiene validez tributaria.'
    : `Representación impresa de la ${tipoComprobanteLabel(data.comprobante.tipo)}.`;
  const leyLines = doc.splitTextToSize(leyenda, WIDTH - PAD_X * 2);
  doc.text(leyLines, WIDTH / 2, y, { align: 'center' });
  y += leyLines.length * 8 + 4;
  doc.setTextColor(...COLOR.negro);
  doc.text('¡Gracias por su compra!', WIDTH / 2, y, { align: 'center' });

  return doc.output('blob');
}

// ============================================================================
// A4 — A COLOR
// ============================================================================
export async function generarA4(data: ComprobantePDFData): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const MARGIN = 40;

  // Pre-cargar logo (color) y QR
  const [logo, qr] = await Promise.all([
    fetchLogoBase64(data.empresa.logo_url, false),
    generarQrPNG(cadenaQrSunat(data), 200),
  ]);

  // ---- Cabecera: logo+empresa (izq) + recuadro tipo (der) ----
  const boxW = 200;
  const boxH = 100;
  const boxX = pageW - MARGIN - boxW;
  const boxY = MARGIN;

  let yL = MARGIN;

  // Logo a color
  if (logo) {
    const maxH = 60;
    const ratio = logo.h / logo.w;
    const w = Math.min(140, maxH / ratio);
    const h = w * ratio;
    doc.addImage(logo.data, 'PNG', MARGIN, yL, w, h);
    yL += h + 8;
  }

  // Razón social
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLOR.naranja);
  doc.text(data.empresa.nombre_comercial || data.empresa.razon_social, MARGIN, yL);
  yL += 16;

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

  // Recuadro tipo de comprobante (derecha)
  doc.setDrawColor(...COLOR.azul);
  doc.setLineWidth(1.5);
  doc.roundedRect(boxX, boxY, boxW, boxH, 4, 4);
  doc.setLineWidth(0.5);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.azul);
  doc.text(`RUC ${data.empresa.ruc}`, boxX + boxW / 2, boxY + 22, { align: 'center' });

  doc.setFontSize(12);
  doc.text(tipoComprobanteLabel(data.comprobante.tipo), boxX + boxW / 2, boxY + 50, { align: 'center', maxWidth: boxW - 16 });

  doc.setFontSize(15);
  doc.setTextColor(...COLOR.naranja);
  doc.text(data.comprobante.numero_completo, boxX + boxW / 2, boxY + 82, { align: 'center' });

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
    headStyles: { fillColor: COLOR.azul, textColor: [255, 255, 255], fontSize: 9, fontStyle: 'bold', cellPadding: 6 },
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

  const lastY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 100;
  y = lastY + 18;

  // ---- Totales (derecha) — FIX: separar bien IGV del TOTAL ----
  const totalsX = pageW - MARGIN - 220;
  const totalsW = 220;

  doc.setFontSize(9);
  doc.setTextColor(...COLOR.textoOscuro);
  doc.setFont('helvetica', 'normal');

  // Sub-total
  doc.text('Sub-total', totalsX + 10, y);
  doc.text(`S/ ${fmt(data.totales.sub_total)}`, totalsX + totalsW - 10, y, { align: 'right' });
  y += 14;

  // IGV
  doc.text(`IGV (${data.comprobante.igv_porcentaje}%)`, totalsX + 10, y);
  doc.text(`S/ ${fmt(data.totales.igv)}`, totalsX + totalsW - 10, y, { align: 'right' });
  y += 18; // espacio extra ANTES del TOTAL para que no se monten

  // TOTAL — recuadro naranja con espaciado limpio
  const totalRowH = 28;
  doc.setFillColor(...COLOR.naranja);
  doc.rect(totalsX, y - 4, totalsW, totalRowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL', totalsX + 10, y + 14);
  doc.text(`S/ ${fmt(data.totales.total)}`, totalsX + totalsW - 10, y + 14, { align: 'right' });
  y += totalRowH + 8;

  // ---- Pagos + QR (lado a lado) ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.textoOscuro);

  const pagosY = y + 6;
  if (data.pagos.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLOR.azul);
    doc.text('Forma de pago', MARGIN, pagosY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.textoOscuro);
    let py = pagosY + 14;
    data.pagos.forEach((p) => {
      doc.text(`• ${metodoLabel(p.metodo)} — S/ ${fmt(p.monto)}`, MARGIN, py);
      py += 12;
    });
  }

  // QR a la derecha
  if (qr) {
    const qrSize = 90;
    const qrX = pageW - MARGIN - qrSize;
    doc.addImage(qr, 'PNG', qrX, pagosY - 4, qrSize, qrSize);
    doc.setFontSize(7);
    doc.setTextColor(...COLOR.textoSuave);
    doc.text('Verifica en SUNAT', qrX + qrSize / 2, pagosY + qrSize + 8, { align: 'center' });
  }
  y = Math.max(y + 110, pagosY + 100);

  // ---- Pie ----
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...COLOR.textoSuave);
  doc.line(MARGIN, pageH - 60, pageW - MARGIN, pageH - 60);
  doc.setFontSize(7);
  doc.setTextColor(...COLOR.textoSuave);
  const leyenda = data.comprobante.tipo === 'NOTA_VENTA'
    ? 'Documento interno — sin validez tributaria.'
    : `Representación impresa de la ${tipoComprobanteLabel(data.comprobante.tipo)}. Autorizado mediante R.S. SUNAT.`;
  doc.text(leyenda, MARGIN, pageH - 45);
  doc.text(`Atendido por: ${data.vendedor}`, MARGIN, pageH - 33);
  doc.text(`Emitido el ${new Date(data.comprobante.fecha).toLocaleString('es-PE')}`, pageW - MARGIN, pageH - 33, { align: 'right' });

  return doc.output('blob');
}

// ----------------------------------------------------------------------------
// Util — descargar/abrir/imprimir Blob
// ----------------------------------------------------------------------------
/**
 * Abre el PDF generado y opcionalmente dispara la impresión automática.
 *
 * Comportamiento:
 *   1. Descarga el PDF (queda en /Descargas como respaldo siempre)
 *   2. Abre una ventana nueva con el PDF
 *   3. Si autoPrint=true (default), invoca window.print() al cargar →
 *      el navegador muestra el diálogo de impresión inmediatamente.
 *      Si el cajero tiene su impresora térmica configurada como default
 *      del SO, solo confirma y se imprime directo en ticket 80mm.
 *
 * Cliente pidió "que se imprima automáticamente" (no que requiera Ctrl+P).
 * Pasar autoPrint=false desactiva el print automático y solo abre.
 */
export function abrirPDF(blob: Blob, filename: string, autoPrint: boolean = true) {
  const url = URL.createObjectURL(blob);

  // 1) Descarga de respaldo
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // 2) Abrir + opcional auto-print
  const w = window.open(url, '_blank');
  if (w && autoPrint) {
    // Algunos navegadores bloquean print() en cross-origin o tras eventos
    // no-trusted — el try/catch evita crash silencioso. Si falla, el cajero
    // ve el PDF abierto y puede dar Ctrl+P manual.
    const tryPrint = () => { try { w.focus(); w.print(); } catch { /* ignore */ } };
    // Algunos PDFs nativos del navegador ya están "loaded" al abrir —
    // intentamos ambos: load event Y un timeout de respaldo.
    w.addEventListener('load', tryPrint);
    setTimeout(tryPrint, 700);
  }

  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
