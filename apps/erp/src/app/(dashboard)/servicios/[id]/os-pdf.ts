/**
 * Generador de la ORDEN DE SERVICIO en PDF (pedido del cliente 21/07/2026).
 *
 * Emite UN solo PDF con 3 copias (una por página):
 *   1. COPIA GERENCIA        — CON tarifas (pago al taller)
 *   2. COPIA TALLER/SERVICIO  — CON tarifas (pago al taller)
 *   3. COPIA CONTROL          — SIN tarifas (solo prendas y avíos)
 *
 * A4 vertical, brandeado con el logo HAPPY SAC (mismo estilo que la guía de
 * remisión). Se genera 100% en el cliente con jsPDF + autotable.
 */

import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import { formatTallaChip } from '@happy/lib';

export type OSPdfData = {
  numero: string;
  taller_nombre: string;
  taller_contacto?: string | null;
  taller_telefono?: string | null;
  proceso: string;
  ot_numero?: string | null;
  fecha_emision?: string | null;
  fecha_envio?: string | null;
  fecha_entrega?: string | null;
  monto_base: number;
  adicional_movilidad: number;
  adicional_campana: number;
  movilidad_por_unidad: number;
  campana_por_unidad: number;
  monto_total: number;
  observaciones?: string | null;
  cuidados?: string | null;
  consideraciones?: string | null;
  lineas: { producto: string; codigo?: string | null; talla: string; cantidad: number }[];
  avios: { material: string; categoria?: string | null; cantidad: number }[];
};

const AZUL: [number, number, number] = [30, 58, 95];
const NARANJA: [number, number, number] = [255, 77, 13];
const GRIS: [number, number, number] = [100, 116, 139];

function fmtFecha(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtPEN(n: number): string {
  return `S/ ${Number(n ?? 0).toFixed(2)}`;
}

export async function generarOSPdf(os: OSPdfData, empresa: EmpresaPDFData | null = null): Promise<void> {
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
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;

  const copias: { label: string; conTarifas: boolean }[] = [
    { label: 'COPIA GERENCIA', conTarifas: true },
    { label: 'COPIA TALLER / SERVICIO', conTarifas: true },
    { label: 'COPIA CONTROL — SIN TARIFAS', conTarifas: false },
  ];

  const totalUnidades = os.lineas.reduce((s, l) => s + Number(l.cantidad ?? 0), 0);

  copias.forEach((copia, idx) => {
    if (idx > 0) doc.addPage();
    renderCopia(doc, autoTable, os, empresa, copia, { pageW, pageH, M, totalUnidades });
  });

  const numero = os.numero.replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`orden-servicio-${numero}.pdf`);
}

function renderCopia(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: any, options: any) => void,
  os: OSPdfData,
  empresa: EmpresaPDFData | null,
  copia: { label: string; conTarifas: boolean },
  ctx: { pageW: number; pageH: number; M: number; totalUnidades: number },
) {
  const { pageW, pageH, M, totalUnidades } = ctx;
  let y = M;

  // ─── Cabecera ───────────────────────────────────────────────────────────
  if (empresa?.logo_dataurl && empresa?.logo_formato) {
    try {
      doc.addImage(empresa.logo_dataurl, empresa.logo_formato, M, y, 24, 18);
    } catch { /* logo opcional */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...AZUL);
  doc.text(
    (empresa?.nombre_comercial || empresa?.razon_social || "DISFRACES HAPPY'S").toUpperCase(),
    M + 28, y + 6,
  );
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...NARANJA);
  doc.text('Fabricamos felicidad', M + 28, y + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  const contactos: string[] = [];
  if (empresa?.telefono) contactos.push(`Tel: ${empresa.telefono}`);
  if (empresa?.email) contactos.push(empresa.email);
  if (contactos.length > 0) doc.text(contactos.join('   ·   '), M + 28, y + 14.5);

  // Recuadro derecho: tipo + número + copia
  const recW = 72;
  const recX = pageW - M - recW;
  doc.setFillColor(...GRIS);
  doc.rect(recX, y, recW, 5.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`RUC: ${empresa?.ruc ?? '—'}`, recX + recW / 2, y + 3.8, { align: 'center' });
  doc.setFillColor(...AZUL);
  doc.rect(recX, y + 5.5, recW, 14.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text('ORDEN DE SERVICIO', recX + recW / 2, y + 10, { align: 'center' });
  doc.setFontSize(12);
  doc.text(os.numero, recX + recW / 2, y + 16.5, { align: 'center' });

  y += 22;

  // Franja de copia (naranja para diferenciar de un vistazo)
  doc.setFillColor(copia.conTarifas ? NARANJA[0] : 71, copia.conTarifas ? NARANJA[1] : 85, copia.conTarifas ? NARANJA[2] : 105);
  doc.rect(M, y, pageW - M * 2, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(copia.label, pageW / 2, y + 4.2, { align: 'center' });
  y += 9;

  // ─── Bloque de datos ─────────────────────────────────────────────────────
  const boxW = pageW - M * 2;
  const filaAlta = 4.4;
  const colIzqX = M + 2;
  const colDerX = M + boxW * 0.54;
  const labelValor = (label: string, valor: string, x: number, yy: number, maxW: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AZUL);
    doc.text(label, x, yy);
    const lw = doc.getTextWidth(label) + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const val = doc.splitTextToSize(valor, maxW - lw) as string[];
    doc.text(val.length > 1 ? `${val[0]}…` : (val[0] ?? '—'), x + lw, yy);
  };

  const blockH = 6 + filaAlta * 3 + 2;
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.rect(M, y, boxW, blockH, 'S');
  doc.setFontSize(8);
  let fy = y + 5.5;
  const tallerTxt = [os.taller_nombre, os.taller_contacto].filter(Boolean).join(' · ');
  labelValor('Taller:', tallerTxt || '—', colIzqX, fy, boxW * 0.52);
  labelValor('Proceso:', os.proceso ?? '—', colDerX, fy, boxW * 0.44);
  fy += filaAlta;
  labelValor('OT:', os.ot_numero ?? '—', colIzqX, fy, boxW * 0.52);
  labelValor('Tel. taller:', os.taller_telefono ?? '—', colDerX, fy, boxW * 0.44);
  fy += filaAlta;
  labelValor('Fecha emisión:', fmtFecha(os.fecha_emision), colIzqX, fy, boxW * 0.52);
  labelValor('Envío al taller:', fmtFecha(os.fecha_envio), colDerX, fy, boxW * 0.44);
  fy += filaAlta;
  labelValor('Entrega esperada:', fmtFecha(os.fecha_entrega), colIzqX, fy, boxW * 0.52);
  labelValor('Total unidades:', String(totalUnidades), colDerX, fy, boxW * 0.44);

  y += blockH + 4;

  // ─── Notas (cuidados / consideraciones / observaciones) ───────────────────
  const notas: string[] = [];
  if (os.cuidados) notas.push(`Cuidados: ${os.cuidados}`);
  if (os.consideraciones) notas.push(`Consideraciones: ${os.consideraciones}`);
  if (os.observaciones) notas.push(`Observaciones: ${os.observaciones}`);
  if (notas.length > 0) {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    const wrapped = doc.splitTextToSize(notas.join('    |    '), boxW) as string[];
    const notasH = wrapped.length * 3.6 + 3;
    doc.setDrawColor(...GRIS);
    doc.rect(M, y, boxW, notasH, 'S');
    doc.text(wrapped, M + 2, y + 4);
    y += notasH + 4;
  }

  // ─── Tabla de prendas ─────────────────────────────────────────────────────
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PRENDAS ENVIADAS AL TALLER', M, y);
  y += 2;
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Item', 'Producto', 'Código', 'Talla', 'Cantidad']],
    body: os.lineas.map((l, i) => [
      String(i + 1),
      l.producto,
      l.codigo ?? '—',
      formatTallaChip(l.talla),
      String(l.cantidad),
    ]),
    foot: [[{ content: 'TOTAL', colSpan: 4, styles: { halign: 'right' } }, String(totalUnidades)]],
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [...AZUL], fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.2 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
    },
    theme: 'striped',
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 5;

  // ─── Tabla de avíos ───────────────────────────────────────────────────────
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('AVÍOS ENVIADOS', M, y);
  y += 2;
  if (os.avios.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text('Sin avíos registrados.', M, y + 4);
    y += 8;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Item', 'Material', 'Categoría', 'Cantidad enviada']],
      body: os.avios.map((a, i) => [
        String(i + 1),
        a.material,
        a.categoria ?? '—',
        Number(a.cantidad).toFixed(4),
      ]),
      headStyles: { fillColor: GRIS, textColor: 255, fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.2 },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 40 },
        3: { cellWidth: 30, halign: 'right' },
      },
      theme: 'striped',
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 5;
  }

  // ─── Pago al taller (solo copias con tarifas) ─────────────────────────────
  if (copia.conTarifas) {
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('PAGO AL TALLER', M, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      body: [
        ['Monto base', fmtPEN(os.monto_base)],
        [`Movilidad (${fmtPEN(os.movilidad_por_unidad)} × ${totalUnidades} unid)`, fmtPEN(os.adicional_movilidad)],
        [`Campaña (${fmtPEN(os.campana_por_unidad)} × ${totalUnidades} unid)`, fmtPEN(os.adicional_campana)],
      ],
      foot: [['TOTAL A PAGAR', fmtPEN(os.monto_total)]],
      bodyStyles: { fontSize: 8, cellPadding: 1.5 },
      footStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' } },
      theme: 'plain',
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text('(Copia de control — sin información de tarifas)', M, y + 2);
    y += 6;
  }

  // ─── Firmas ───────────────────────────────────────────────────────────────
  let yFirmas = Math.max(y + 6, pageH - 40);
  if (yFirmas + 20 > pageH - 10) yFirmas = pageH - 40;
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.2);
  const fW = (pageW - M * 2 - 10) / 3;
  for (let i = 0; i < 3; i++) {
    const x = M + i * (fW + 5);
    doc.line(x, yFirmas + 12, x + fW, yFirmas + 12);
  }
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('ENTREGA — HAPPY SAC', M + fW / 2, yFirmas + 16, { align: 'center' });
  doc.text('RECIBE — TALLER', M + fW + 5 + fW / 2, yFirmas + 16, { align: 'center' });
  doc.text('CONTROL / CALIDAD', M + 2 * (fW + 5) + fW / 2, yFirmas + 16, { align: 'center' });

  // ─── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(6);
  doc.setTextColor(...GRIS);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Orden de servicio ${os.numero} — ${copia.label} · Documento interno emitido por HAPPY SAC ERP`,
    pageW / 2,
    pageH - 8,
    { align: 'center' },
  );
}
