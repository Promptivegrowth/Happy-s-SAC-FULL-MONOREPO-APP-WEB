/**
 * Generador de Guía de Remisión - Remitente (formato SUNAT R.S. 097-2012).
 *
 * Es un PDF INTERNO para mostrar al control policial en traslados entre
 * establecimientos del mismo contribuyente. NO es la guía electrónica oficial
 * (eso requiere integración con SUNAT) — solo cumple con los datos mínimos
 * requeridos por SUNAT para sustentar el traslado.
 *
 * Diseño:
 *  - Hoja A4 vertical, brandeada con logo HAPPY SAC
 *  - Recuadro azul "GUÍA DE REMISIÓN - REMITENTE" con número
 *  - Bloque "Remitente" (siempre = HAPPY SAC)
 *  - Bloque "Punto de partida" y "Punto de llegada" (almacenes)
 *  - Bloque "Datos del traslado" (motivo, fecha, modalidad PRIVADO)
 *  - Tabla de bienes transportados
 *  - Líneas de firma (chofer / responsable)
 *  - Footer "Documento interno — válido como sustento de traslado"
 */

import type { TrasladoDetalle, TrasladoLineaDetalle } from '@/server/actions/traslados';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';

export async function generarGuiaRemisionPdf(
  traslado: TrasladoDetalle,
  lineas: TrasladoLineaDetalle[],
  empresa: EmpresaPDFData | null = null,
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableMod.default ?? autoTableMod) as unknown as (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any,
  ) => void;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 12;

  // Colores brand
  const AZUL: [number, number, number] = [30, 58, 95];
  const NARANJA: [number, number, number] = [255, 77, 13];
  const GRIS: [number, number, number] = [100, 116, 139];

  const fechaEmision = new Date().toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const fechaTraslado = traslado.fecha_despacho
    ? new Date(traslado.fecha_despacho).toLocaleDateString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : fechaEmision;

  // ─── Cabecera ──────────────────────────────────────────────────────────
  let y = M;

  // Logo a la izquierda
  if (empresa?.logo_dataurl && empresa?.logo_formato) {
    try {
      doc.addImage(empresa.logo_dataurl, empresa.logo_formato, M, y, 28, 20);
    } catch { /* ignore */ }
  }

  // Datos empresa al lado del logo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...AZUL);
  doc.text(empresa?.nombre_comercial || empresa?.razon_social || 'HAPPY SAC', M + 32, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`RUC: ${empresa?.ruc ?? '—'}`, M + 32, y + 9.5);
  if (empresa?.direccion_fiscal) doc.text(empresa.direccion_fiscal, M + 32, y + 13);
  if (empresa?.telefono) doc.text(`Tel: ${empresa.telefono}`, M + 32, y + 16.5);
  if (empresa?.email) doc.text(empresa.email, M + 32, y + 20);

  // Recuadro a la derecha
  const recW = 70;
  const recX = pageW - M - recW;
  doc.setFillColor(...AZUL);
  doc.rect(recX, y, recW, 25, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('GUÍA DE REMISIÓN', recX + recW / 2, y + 6, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('REMITENTE', recX + recW / 2, y + 9.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(traslado.guia_remision || traslado.codigo, recX + recW / 2, y + 16, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha emisión: ${fechaEmision}`, recX + recW / 2, y + 21, { align: 'center' });

  y += 30;

  // ─── Línea separadora ──────────────────────────────────────────────────
  doc.setDrawColor(...NARANJA);
  doc.setLineWidth(0.5);
  doc.line(M, y, pageW - M, y);
  y += 5;

  // ─── Bloque REMITENTE ─────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.text('REMITENTE', M, y);
  y += 4;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(`Razón social: ${empresa?.razon_social ?? '—'}`, M, y);
  y += 4;
  doc.text(`RUC: ${empresa?.ruc ?? '—'}`, M, y);
  y += 4;
  doc.text(`Domicilio fiscal: ${empresa?.direccion_fiscal ?? '—'}`, M, y);
  y += 7;

  // ─── Punto de partida / Punto de llegada (en dos columnas) ─────────────
  const colW = (pageW - M * 2 - 5) / 2;

  doc.setFillColor(245, 247, 250);
  doc.rect(M, y, colW, 22, 'F');
  doc.rect(M + colW + 5, y, colW, 22, 'F');

  // PARTIDA
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PUNTO DE PARTIDA', M + 2, y + 4);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(`${traslado.almacen_origen_codigo} · ${traslado.almacen_origen_nombre}`, M + 2, y + 9);
  if (traslado.almacen_origen_direccion) {
    const lineasDir = doc.splitTextToSize(traslado.almacen_origen_direccion, colW - 4);
    doc.text(lineasDir, M + 2, y + 13);
  } else {
    doc.setTextColor(...GRIS);
    doc.text('(Sin dirección registrada)', M + 2, y + 13);
    doc.setTextColor(0, 0, 0);
  }

  // LLEGADA
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.text('PUNTO DE LLEGADA', M + colW + 7, y + 4);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(`${traslado.almacen_destino_codigo} · ${traslado.almacen_destino_nombre}`, M + colW + 7, y + 9);
  if (traslado.almacen_destino_direccion) {
    const lineasDir = doc.splitTextToSize(traslado.almacen_destino_direccion, colW - 4);
    doc.text(lineasDir, M + colW + 7, y + 13);
  } else {
    doc.setTextColor(...GRIS);
    doc.text('(Sin dirección registrada)', M + colW + 7, y + 13);
    doc.setTextColor(0, 0, 0);
  }

  y += 26;

  // ─── Datos del traslado ────────────────────────────────────────────────
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DATOS DEL TRASLADO', M, y);
  y += 4;

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text(`Motivo: TRASLADO ENTRE ESTABLECIMIENTOS DEL MISMO CONTRIBUYENTE`, M, y);
  y += 4;
  doc.text(`Fecha de inicio del traslado: ${fechaTraslado}`, M, y);
  y += 4;
  doc.text(`Modalidad: PRIVADO (vehículo del remitente)`, M, y);
  y += 4;
  doc.text(`N° interno: ${traslado.codigo}`, M, y);
  if (traslado.motivo) {
    y += 4;
    const motivoLines = doc.splitTextToSize(`Detalle: ${traslado.motivo}`, pageW - M * 2);
    doc.text(motivoLines, M, y);
    y += motivoLines.length * 3.5;
  }
  y += 5;

  // ─── Datos del vehículo / conductor (espacio para llenar a mano) ──────
  doc.setFillColor(254, 249, 195); // amarillo suave
  doc.rect(M, y, pageW - M * 2, 18, 'F');
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DATOS DEL VEHÍCULO Y CONDUCTOR (completar a mano)', M + 2, y + 4);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Placa: ______________________   Marca: ______________________   N° Tarjeta circulación: __________________`, M + 2, y + 10);
  doc.text(`Conductor (nombre): ______________________________________   DNI: _____________   Licencia: _____________`, M + 2, y + 15);
  y += 22;

  // ─── Tabla de bienes ──────────────────────────────────────────────────
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BIENES TRANSPORTADOS', M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Código', 'Descripción', 'Detalle', 'Unidad', 'Cantidad']],
    body: lineas.map((l) => [
      l.codigo ?? '—',
      l.nombre,
      l.detalle ?? '',
      l.tipo === 'VARIANTE' ? 'unid' : '—',
      l.cantidad.toString(),
    ]),
    foot: [['', '', '', 'TOTAL', lineas.reduce((s, l) => s + l.cantidad, 0).toString()]],
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 8, halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [...AZUL], fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
    },
    theme: 'striped',
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // ─── Firmas ────────────────────────────────────────────────────────────
  const yFirmas = Math.max(finalY, doc.internal.pageSize.getHeight() - 50);

  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.2);
  // 3 firmas
  const fW = (pageW - M * 2 - 10) / 3;
  for (let i = 0; i < 3; i++) {
    const x = M + i * (fW + 5);
    doc.line(x, yFirmas + 15, x + fW, yFirmas + 15);
  }
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('FIRMA REMITENTE', M + fW / 2, yFirmas + 19, { align: 'center' });
  doc.text('FIRMA CONDUCTOR', M + fW + 5 + fW / 2, yFirmas + 19, { align: 'center' });
  doc.text('FIRMA DESTINATARIO', M + 2 * (fW + 5) + fW / 2, yFirmas + 19, { align: 'center' });

  // ─── Footer ───────────────────────────────────────────────────────────
  doc.setFontSize(6);
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'italic');
  const yFooter = doc.internal.pageSize.getHeight() - 8;
  doc.text(
    'Documento interno emitido por sistema HAPPY SAC ERP — válido como sustento de traslado entre establecimientos del mismo contribuyente (R.S. 097-2012/SUNAT)',
    pageW / 2,
    yFooter,
    { align: 'center' },
  );

  // ─── Descargar ────────────────────────────────────────────────────────
  const numero = (traslado.guia_remision || traslado.codigo).replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`guia-remision-${numero}.pdf`);
}
