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

export async function generarPdfCotizacion(data: DatosCotizacion): Promise<Blob> {
  // Alto dinámico: base + item * cantidad_items + footer
  const alto = 130 + data.items.length * 8 + (data.notas ? 20 : 0);
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
  y += 4;

  // Título COTIZACIÓN
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('COTIZACIÓN', cx, y, { align: 'center' });
  y += 5;
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

  // Header items
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CANT DESCRIPCIÓN', 4, y);
  doc.text('TOTAL', WIDTH - 4, y, { align: 'right' });
  y += 4;
  doc.line(4, y - 1, WIDTH - 4, y - 1);

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

  // Totales
  y += 2;
  doc.line(4, y, WIDTH - 4, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.text('Sub-total', WIDTH - 24, y);
  doc.text(formatPEN(data.subtotal), WIDTH - 4, y, { align: 'right' });
  y += 4;
  doc.text('IGV (18%)', WIDTH - 24, y);
  doc.text(formatPEN(data.igv), WIDTH - 4, y, { align: 'right' });
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', WIDTH - 24, y);
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
