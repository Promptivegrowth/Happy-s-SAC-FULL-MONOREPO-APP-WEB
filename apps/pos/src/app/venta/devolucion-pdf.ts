'use client';

/**
 * Generador PDF — Comprobante de devolución / cambio.
 *
 * Layout A4 vertical, 1 página. Branding HAPPY SAC con logo + colores.
 *
 * NO ES un documento SUNAT oficial. Es un comprobante interno que prueba
 * la operación y sirve como recibo para el cliente y respaldo del cajero.
 * La leyenda al pie lo aclara.
 */

import type { DevolucionPDFData } from '@/server/actions/devoluciones';

const NARANJA: [number, number, number] = [255, 77, 13];
const AZUL: [number, number, number] = [30, 58, 95];
const ROSE: [number, number, number] = [225, 29, 72];
const INDIGO: [number, number, number] = [79, 70, 229];
const GRIS: [number, number, number] = [100, 116, 139];
const TEXTO: [number, number, number] = [15, 23, 42];

function fmtPEN(n: number): string {
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function metodoLabel(m: string | null): string {
  if (!m) return '—';
  const map: Record<string, string> = {
    EFECTIVO: 'Efectivo',
    YAPE: 'Yape',
    PLIN: 'Plin',
    TARJETA_DEBITO: 'Tarjeta débito',
    TARJETA_CREDITO: 'Tarjeta crédito',
    TRANSFERENCIA: 'Transferencia',
    DEPOSITO: 'Depósito',
    CREDITO: 'Nota de crédito (saldo a favor)',
  };
  return map[m] ?? m;
}

export async function generarComprobanteDevolucionPDF(data: DevolucionPDFData): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable = (autoTableMod.default ?? autoTableMod) as any;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 14;

  const esCambio = data.tipo === 'CAMBIO';
  const tipoLabel = esCambio ? 'CAMBIO DE MERCADERÍA' : 'DEVOLUCIÓN DE MERCADERÍA';
  const tipoCorto = esCambio ? 'CAMBIO' : 'DEVOLUCIÓN';
  const tipoColor: [number, number, number] = esCambio ? INDIGO : ROSE;

  // ============================================================================
  // CABECERA — Logo + datos empresa (izq) + recuadro tipo (der)
  // ============================================================================
  if (data.logo_dataurl) {
    try { doc.addImage(data.logo_dataurl, 'PNG', M, M, 30, 15); } catch { /* ignore */ }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NARANJA);
  doc.text(data.empresa?.nombre_comercial || data.empresa?.razon_social || 'HAPPY SAC', M + 34, M + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  let yL = M + 10;
  if (data.empresa?.nombre_comercial && data.empresa.razon_social) {
    doc.text(data.empresa.razon_social, M + 34, yL); yL += 3.5;
  }
  if (data.empresa?.ruc) { doc.text(`RUC ${data.empresa.ruc}`, M + 34, yL); yL += 3.5; }
  if (data.empresa?.direccion_fiscal) { doc.text(data.empresa.direccion_fiscal, M + 34, yL); yL += 3.5; }
  if (data.empresa?.telefono) { doc.text(`Tel. ${data.empresa.telefono}`, M + 34, yL); yL += 3.5; }

  // Recuadro tipo (derecha)
  const boxW = 70;
  const boxH = 26;
  const boxX = pageW - M - boxW;
  doc.setDrawColor(...tipoColor);
  doc.setLineWidth(0.6);
  doc.roundedRect(boxX, M, boxW, boxH, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...tipoColor);
  doc.text(tipoLabel, boxX + boxW / 2, M + 6, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(...TEXTO);
  doc.text(data.numero, boxX + boxW / 2, M + 15, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(new Date(data.fecha).toLocaleString('es-PE'), boxX + boxW / 2, M + 22, { align: 'center' });

  // Línea separadora
  let y = Math.max(yL, M + boxH) + 6;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.4);
  doc.line(M, y, pageW - M, y);
  y += 6;

  // ============================================================================
  // VENTA DE REFERENCIA
  // ============================================================================
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, pageW - M * 2, 18, 'F');

  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'bold');
  doc.text('VENTA DE REFERENCIA', M + 3, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXTO);
  const ventaTxt = data.venta.comprobante
    ? `${data.venta.comprobante.tipo} ${data.venta.comprobante.numero_completo}  ·  Venta ${data.venta.numero}`
    : `Venta ${data.venta.numero}`;
  doc.text(ventaTxt, M + 3, y + 10);
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`Fecha venta: ${new Date(data.venta.fecha).toLocaleString('es-PE')}`, M + 3, y + 15);
  y += 22;

  // ============================================================================
  // DATOS DEL CLIENTE
  // ============================================================================
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE', M + 3, y + 4);
  doc.text('DOCUMENTO', pageW / 2, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXTO);
  const nombreLines = doc.splitTextToSize(data.cliente.nombre, pageW / 2 - M - 6);
  doc.text(nombreLines, M + 3, y + 10);

  doc.text(
    data.cliente.tipo_documento && data.cliente.documento
      ? `${data.cliente.tipo_documento} ${data.cliente.documento}`
      : '—',
    pageW / 2,
    y + 10,
  );
  y += 16;

  // Línea separadora
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.2);
  doc.line(M, y, pageW - M, y);
  y += 4;

  // ============================================================================
  // TABLA DE PRODUCTOS DEVUELTOS
  // ============================================================================
  // Título de la tabla cuando es CAMBIO (para diferenciarla de la de entrega)
  if (esCambio) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ROSE);
    doc.text('PRODUCTOS DEVUELTOS POR EL CLIENTE', M, y);
    y += 4;
  }
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Producto', 'SKU', 'Talla', 'Cant.', 'P. Unit.', 'Subtotal']],
    body: data.lineas.map((l) => [
      l.producto_nombre,
      l.sku,
      l.talla.replace('T', ''),
      String(l.cantidad),
      fmtPEN(l.precio_unitario),
      fmtPEN(l.sub_total),
    ]),
    headStyles: {
      fillColor: esCambio ? ROSE : AZUL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 2,
    },
    bodyStyles: { fontSize: 9, textColor: TEXTO, cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'center', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: M, right: M },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4;

  // ============================================================================
  // TABLA DE PRODUCTOS ENTREGADOS (solo si es CAMBIO con venta intercambio)
  // ============================================================================
  if (esCambio && data.venta_intercambio && data.venta_intercambio.lineas.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INDIGO);
    doc.text(`PRODUCTOS ENTREGADOS AL CLIENTE — ${data.venta_intercambio.numero}`, M, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      head: [['Producto', 'SKU', 'Talla', 'Cant.', 'P. Unit.', 'Subtotal']],
      body: data.venta_intercambio.lineas.map((l) => [
        l.producto_nombre,
        l.sku,
        l.talla.replace('T', ''),
        String(l.cantidad),
        fmtPEN(l.precio_unitario),
        fmtPEN(l.sub_total),
      ]),
      headStyles: {
        fillColor: INDIGO,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 2,
      },
      bodyStyles: { fontSize: 9, textColor: TEXTO, cellPadding: 2 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        1: { halign: 'center', cellWidth: 24 },
        2: { halign: 'center', cellWidth: 14 },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'right', cellWidth: 28 },
        5: { halign: 'right', cellWidth: 30 },
      },
      margin: { left: M, right: M },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ============================================================================
  // RESUMEN: total + método (o "Sin reembolso")
  // ============================================================================
  const totalU = data.lineas.reduce((s, l) => s + l.cantidad, 0);
  const totalMonto = data.lineas.reduce((s, l) => s + l.sub_total, 0);

  // Box izq: motivo
  const boxLW = (pageW - M * 2 - 4) * 0.55;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.2);
  doc.rect(M, y, boxLW, 30);
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'bold');
  doc.text('MOTIVO', M + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXTO);
  const motivoLines = doc.splitTextToSize(data.motivo || '—', boxLW - 6);
  doc.text(motivoLines, M + 3, y + 10);
  if (data.observacion) {
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text('OBSERVACIÓN', M + 3, y + 21);
    doc.setFontSize(8);
    doc.setTextColor(...TEXTO);
    const obsLines = doc.splitTextToSize(data.observacion, boxLW - 6);
    doc.text(obsLines.slice(0, 1), M + 3, y + 25);
  }

  // Box der: total / método / diferencia
  const boxRX = M + boxLW + 4;
  const boxRW = pageW - M - boxRX;
  doc.setFillColor(...tipoColor);
  doc.rect(boxRX, y, boxRW, 30, 'F');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');

  if (esCambio && data.venta_intercambio) {
    const totalEntregado = data.venta_intercambio.total;
    const dif = data.diferencia;
    // Resumen línea por línea
    doc.text(`Devuelto: ${fmtPEN(totalMonto)}`, boxRX + 3, y + 6);
    doc.text(`Entregado: ${fmtPEN(totalEntregado)}`, boxRX + 3, y + 11);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    if (Math.abs(dif) < 0.01) {
      doc.text('SIN DIFERENCIA', boxRX + boxRW / 2, y + 21, { align: 'center' });
    } else if (dif > 0) {
      doc.text(`COBRADO: ${fmtPEN(dif)}`, boxRX + boxRW / 2, y + 19, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Método: ${metodoLabel(data.metodo_devolucion)}`, boxRX + boxRW / 2, y + 25, { align: 'center' });
    } else {
      doc.text(`DEVUELTO: ${fmtPEN(Math.abs(dif))}`, boxRX + boxRW / 2, y + 19, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Método: ${metodoLabel(data.metodo_devolucion)}`, boxRX + boxRW / 2, y + 25, { align: 'center' });
    }
  } else if (esCambio) {
    // CAMBIO sin venta intercambio (legacy / fallback)
    doc.text(`${totalU} unidad(es)`, boxRX + 3, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('CAMBIO SIN REEMBOLSO', boxRX + boxRW / 2, y + 15, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Valor: ${fmtPEN(totalMonto)}`, boxRX + boxRW / 2, y + 23, { align: 'center' });
  } else {
    doc.text(`${totalU} unidad(es)`, boxRX + 3, y + 6);
    doc.setFontSize(8);
    doc.text('TOTAL DEVUELTO', boxRX + 3, y + 11);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(fmtPEN(data.monto_devuelto || totalMonto), boxRX + 3, y + 19);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Método: ${metodoLabel(data.metodo_devolucion)}`, boxRX + 3, y + 26);
  }
  y += 34;

  // ============================================================================
  // FIRMAS
  // ============================================================================
  if (y < pageH - 50) {
    y = pageH - 45;
    const colW = (pageW - M * 2 - 10) / 2;
    doc.setDrawColor(...GRIS);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + colW, y);
    doc.line(M + colW + 10, y, pageW - M, y);
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Cajero: ${data.atendido_por_nombre}`, M, y + 4);
    doc.text(data.almacen_nombre, M, y + 8);
    doc.text('Firma del cliente', M + colW + 10, y + 4);
    doc.text(`${data.cliente.nombre}${data.cliente.documento ? ` · ${data.cliente.documento}` : ''}`, M + colW + 10, y + 8);
  }

  // ============================================================================
  // PIE — Leyenda informativa
  // ============================================================================
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.2);
  doc.line(M, pageH - 22, pageW - M, pageH - 22);
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  const leyenda =
    'Documento interno de uso comercial. No reemplaza la nota de crédito SUNAT cuando la operación lo requiera. ' +
    'El stock se reincorporó al almacén indicado al momento de registrar la operación.';
  const leyLines = doc.splitTextToSize(leyenda, pageW - M * 2);
  doc.text(leyLines, M, pageH - 17);

  doc.text(`Emitido el ${new Date().toLocaleString('es-PE')}`, M, pageH - 8);
  doc.text(data.numero, pageW - M, pageH - 8, { align: 'right' });

  // ============================================================================
  // Guardar + abrir
  // ============================================================================
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const filename = `${tipoCorto.toLowerCase()}_${data.numero.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
