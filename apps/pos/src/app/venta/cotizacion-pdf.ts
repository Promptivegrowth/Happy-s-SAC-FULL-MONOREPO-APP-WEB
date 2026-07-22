'use client';

/**
 * PDF de cotización para el POS.
 *
 * Cliente pidió (2026-07-12): que el botón WA del POS abra un modal donde el
 * cajero pone el número/correo del comprador y envía la cotización con el
 * PDF adjunto. Esta función arma el PDF (ticket 80mm de una hoja lógica).
 *
 * NO es un comprobante SUNAT — no hay QR, no hay serie correlativa oficial,
 * no se persiste en BD. Solo un documento visual que dice "COTIZACIÓN" y
 * lista los items + total + vigencia sugerida. Si el cliente confirma la
 * compra, el cajero convierte los items en venta manualmente desde el POS.
 */

import { jsPDF } from 'jspdf';
import { formatPEN } from '@happy/lib';

export type ItemCotizacion = {
  nombre: string;
  talla: string;
  cantidad: number;
  precioUnit: number;
};

export type DatosCotizacion = {
  empresa_nombre: string;
  empresa_ruc?: string;
  empresa_direccion?: string;
  empresa_telefono?: string;
  numero: string;           // Ej. "COT-20260712-1435"
  fecha: Date;
  vigencia_dias: number;    // Ej. 7
  cliente_nombre: string;
  cliente_documento?: string;
  cliente_telefono?: string;
  items: ItemCotizacion[];
  subtotal: number;
  igv: number;
  total: number;
  vendedor: string;
  notas?: string;
};

const WIDTH = 80; // mm — ancho estándar térmica

export type FormatoCotizacion = 'TICKET_80MM' | 'A4';

export async function generarPdfCotizacion(
  data: DatosCotizacion,
  formato: FormatoCotizacion = 'TICKET_80MM',
): Promise<Blob> {
  if (formato === 'A4') return generarCotizacionA4(data);
  return generarCotizacionTicket(data);
}

async function generarCotizacionTicket(data: DatosCotizacion): Promise<Blob> {
  // Alto dinámico: base + item * cantidad_items + footer
  const alto = 138 + data.items.length * 8 + (data.notas ? 20 : 0);
  const doc = new jsPDF({ unit: 'mm', format: [WIDTH, alto], orientation: 'portrait' });

  let y = 6;
  const cx = WIDTH / 2;

  // Header empresa
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(data.empresa_nombre.toUpperCase(), cx, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (data.empresa_ruc) { doc.text(`RUC ${data.empresa_ruc}`, cx, y, { align: 'center' }); y += 4; }
  if (data.empresa_direccion) { doc.text(data.empresa_direccion.slice(0, 40), cx, y, { align: 'center' }); y += 4; }
  if (data.empresa_telefono) { doc.text(`Tel. ${data.empresa_telefono}`, cx, y, { align: 'center' }); y += 4; }

  // Separador
  y += 2;
  doc.setLineDashPattern([0.7, 0.7], 0);
  doc.line(4, y, WIDTH - 4, y);
  // 6.5mm de aire: las mayúsculas de 13pt suben ~4.6mm sobre el baseline y
  // con solo 4mm la línea punteada cortaba el título (reporte 21/07/2026).
  y += 6.5;

  // Título COTIZACIÓN
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('COTIZACIÓN', cx, y, { align: 'center' });
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(data.numero, cx, y, { align: 'center' });
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    data.fecha.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
    cx,
    y,
    { align: 'center' },
  );
  y += 4;
  const venc = new Date(data.fecha.getTime() + data.vigencia_dias * 86400_000);
  doc.text(
    `Válido hasta: ${venc.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    cx, y, { align: 'center' },
  );
  y += 5;

  // Separador
  doc.line(4, y, WIDTH - 4, y);
  y += 4;

  // Cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CLIENTE:', 4, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text(data.cliente_nombre.slice(0, 40), 4, y);
  y += 3.5;
  if (data.cliente_documento) {
    doc.text(`Doc: ${data.cliente_documento}`, 4, y);
    y += 3.5;
  }
  if (data.cliente_telefono) {
    doc.text(`Tel: ${data.cliente_telefono}`, 4, y);
    y += 3.5;
  }
  y += 2;

  // Separador
  doc.line(4, y, WIDTH - 4, y);
  y += 4;

  // Header items — OJO: la línea va ANTES de avanzar al primer item, con
  // aire suficiente. Antes se dibujaba 1mm arriba del baseline del primer
  // item y lo cruzaba por el medio (reporte del cliente 21/07/2026).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CANT DESCRIPCIÓN', 4, y);
  doc.text('TOTAL', WIDTH - 4, y, { align: 'right' });
  y += 1.5;
  doc.line(4, y, WIDTH - 4, y);
  y += 4;

  // Items
  doc.setFont('helvetica', 'normal');
  for (const it of data.items) {
    const talla = it.talla.replace('T', '');
    const sub = it.cantidad * it.precioUnit;
    doc.text(String(it.cantidad), 4, y);
    doc.text(`${it.nombre.slice(0, 22)} (T${talla})`, 12, y);
    doc.text(formatPEN(sub), WIDTH - 4, y, { align: 'right' });
    y += 3.5;
    doc.setFontSize(6.5);
    doc.setTextColor(120);
    doc.text(`  ${formatPEN(it.precioUnit)} c/u`, 12, y);
    doc.setTextColor(0);
    doc.setFontSize(8);
    y += 4;
  }

  // Totales — etiquetas alineadas a la DERECHA terminando en WIDTH-30, montos
  // a la derecha en WIDTH-4. Antes la etiqueta arrancaba en WIDTH-24 y con
  // montos de miles ("S/ 2,651.69") el número la pisaba y quedaba ilegible
  // (reporte del cliente 21/07/2026).
  y += 2;
  doc.line(4, y, WIDTH - 4, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Sub-total', WIDTH - 30, y, { align: 'right' });
  doc.text(formatPEN(data.subtotal), WIDTH - 4, y, { align: 'right' });
  y += 4;
  doc.text('IGV (18%)', WIDTH - 30, y, { align: 'right' });
  doc.text(formatPEN(data.igv), WIDTH - 4, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', WIDTH - 30, y, { align: 'right' });
  doc.text(formatPEN(data.total), WIDTH - 4, y, { align: 'right' });
  y += 6;

  // Notas
  if (data.notas) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const lineas = doc.splitTextToSize(data.notas, WIDTH - 8);
    for (const ln of lineas) {
      doc.text(ln, 4, y);
      y += 3;
    }
    y += 2;
  }

  // Pie
  doc.line(4, y, WIDTH - 4, y);
  y += 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text('Cotización referencial — precios y stock', cx, y, { align: 'center' });
  y += 3;
  doc.text('sujetos a disponibilidad al momento de la venta.', cx, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Vendedor: ${data.vendedor}`, cx, y, { align: 'center' });

  return doc.output('blob');
}

// ────────────────────────────────────────────────────────────────────────────
// FORMATO A4 — pedido del cliente 21/07/2026 ("¿será posible emitir
// cotizaciones en formato A4?"). Mismo contenido que el ticket pero en hoja
// completa, con tabla de columnas y salto de página si hay muchos items.
// ────────────────────────────────────────────────────────────────────────────
async function generarCotizacionA4(data: DatosCotizacion): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210;
  const M = 15; // margen
  let y = 20;

  // Columnas de la tabla (mm)
  const X_CANT = M + 10;        // cantidad, alineada a la derecha
  const X_DESC = M + 14;        // descripción
  const X_TALLA = 138;          // talla, centrada
  const X_PUNIT = 172;          // precio unitario, derecha
  const X_TOTAL = W - M;        // total, derecha

  function tablaHeader() {
    doc.setFillColor(238, 240, 245);
    doc.rect(M, y - 4.5, W - 2 * M, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(40);
    doc.text('CANT', X_CANT, y, { align: 'right' });
    doc.text('DESCRIPCIÓN', X_DESC, y);
    doc.text('TALLA', X_TALLA, y, { align: 'center' });
    doc.text('P. UNIT', X_PUNIT, y, { align: 'right' });
    doc.text('TOTAL', X_TOTAL, y, { align: 'right' });
    doc.setTextColor(0);
    y += 6.5;
  }

  // ── Encabezado: empresa a la izquierda, recuadro COTIZACIÓN a la derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(data.empresa_nombre.toUpperCase(), M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let yEmp = y + 6;
  if (data.empresa_ruc) { doc.text(`RUC ${data.empresa_ruc}`, M, yEmp); yEmp += 4.5; }
  if (data.empresa_direccion) { doc.text(data.empresa_direccion.slice(0, 60), M, yEmp); yEmp += 4.5; }
  if (data.empresa_telefono) { doc.text(`Tel. ${data.empresa_telefono}`, M, yEmp); yEmp += 4.5; }

  const BOX_W = 62;
  const boxX = W - M - BOX_W;
  doc.setDrawColor(60);
  doc.roundedRect(boxX, y - 6, BOX_W, 22, 1.5, 1.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('COTIZACIÓN', boxX + BOX_W / 2, y, { align: 'center' });
  doc.setFontSize(10);
  doc.text(data.numero, boxX + BOX_W / 2, y + 5.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    data.fecha.toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }),
    boxX + BOX_W / 2, y + 10.5, { align: 'center' },
  );

  y = Math.max(yEmp, y + 20) + 4;

  // ── Cliente + vigencia
  const venc = new Date(data.fecha.getTime() + data.vigencia_dias * 86400_000);
  doc.setFillColor(247, 248, 250);
  doc.rect(M, y - 4, W - 2 * M, 16, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CLIENTE:', M + 3, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(data.cliente_nombre.slice(0, 60), M + 3, y + 5);
  const datosCli: string[] = [];
  if (data.cliente_documento) datosCli.push(`Doc: ${data.cliente_documento}`);
  if (data.cliente_telefono) datosCli.push(`Tel: ${data.cliente_telefono}`);
  if (datosCli.length > 0) {
    doc.setFontSize(8.5);
    doc.text(datosCli.join('   ·   '), M + 3, y + 9.5);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('VÁLIDO HASTA:', W - M - 3, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    venc.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' }),
    W - M - 3, y + 5, { align: 'right' },
  );
  y += 18;

  // ── Tabla de items
  tablaHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const it of data.items) {
    if (y > 265) {
      doc.addPage();
      y = 20;
      tablaHeader();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }
    const sub = it.cantidad * it.precioUnit;
    doc.text(String(it.cantidad), X_CANT, y, { align: 'right' });
    doc.text(it.nombre.slice(0, 55), X_DESC, y);
    doc.text(it.talla.replace('T', ''), X_TALLA, y, { align: 'center' });
    doc.text(formatPEN(it.precioUnit), X_PUNIT, y, { align: 'right' });
    doc.text(formatPEN(sub), X_TOTAL, y, { align: 'right' });
    y += 3;
    doc.setDrawColor(228);
    doc.line(M, y, W - M, y);
    doc.setDrawColor(60);
    y += 4.5;
  }

  // ── Totales (bloque derecho)
  if (y > 245) { doc.addPage(); y = 25; }
  y += 2;
  const X_LBL = W - M - 42;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text('Sub-total', X_LBL, y, { align: 'right' });
  doc.text(formatPEN(data.subtotal), X_TOTAL, y, { align: 'right' });
  y += 5;
  doc.text('IGV (18%)', X_LBL, y, { align: 'right' });
  doc.text(formatPEN(data.igv), X_TOTAL, y, { align: 'right' });
  y += 2.5;
  doc.setDrawColor(60);
  doc.line(X_LBL - 18, y, W - M, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', X_LBL, y, { align: 'right' });
  doc.text(formatPEN(data.total), X_TOTAL, y, { align: 'right' });
  y += 10;

  // ── Notas
  if (data.notas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text('NOTAS:', M, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lineas = doc.splitTextToSize(data.notas, W - 2 * M);
    for (const ln of lineas) {
      doc.text(ln, M, y);
      y += 4.2;
    }
    y += 4;
  }

  // ── Pie
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(
    'Cotización referencial — precios y stock sujetos a disponibilidad al momento de la venta.',
    W / 2, y, { align: 'center' },
  );
  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
  doc.text(`Vendedor: ${data.vendedor}`, W / 2, y, { align: 'center' });

  return doc.output('blob');
}

/** Nombre corto para la cotización — ej. COT-20260712-1435. Sin serie SUNAT. */
export function siguienteNumeroCotizacion(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `COT-${y}${m}${dd}-${hh}${mm}`;
}
