/**
 * Generador de la RECETA (BOM) en PDF — materiales + procesos (pedido del
 * cliente 2026-08-16: "formato en PDF para descargar e imprimir la receta de
 * materiales y procesos").
 *
 * A4 vertical, brandeado con el logo HAPPY SAC (mismo estilo que la orden de
 * servicio). Se genera 100% en el cliente con jsPDF + autotable.
 */

import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import { formatTallaChip, ordenTalla } from '@happy/lib';

export type RecetaPdfData = {
  producto: string;
  codigo: string;
  versionMateriales: string;
  versionProcesos: string;
  activa: boolean;
  /** Fecha de creación de la receta (ISO). Se muestra como "Emitido". */
  creadaEn: string | null;
  materiales: {
    talla: string;
    material: string;
    codigo: string;
    categoria: string;
    cantidad: number;
    costo: number;
    saleAServicio: boolean;
    saleAOjalBoton: boolean;
  }[];
  procesos: {
    orden: number;
    proceso: string;
    area: string;
    talla: string | null;
    tiempoMin: number;
    costo: number;
    esTercerizado: boolean;
  }[];
};

const AZUL: [number, number, number] = [30, 58, 95];
const NARANJA: [number, number, number] = [255, 77, 13];
const GRIS: [number, number, number] = [100, 116, 139];

function fmtPEN(n: number): string {
  return `S/ ${Number(n ?? 0).toFixed(2)}`;
}

export async function generarRecetaPdf(data: RecetaPdfData, empresa: EmpresaPDFData | null = null): Promise<void> {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = M;

  // ─── Cabecera ─────────────────────────────────────────────────────────────
  if (empresa?.logo_dataurl && empresa?.logo_formato) {
    try {
      doc.addImage(empresa.logo_dataurl, empresa.logo_formato, M, y, 24, 18);
    } catch { /* logo opcional */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...AZUL);
  doc.text((empresa?.nombre_comercial || empresa?.razon_social || "DISFRACES HAPPY'S").toUpperCase(), M + 28, y + 6);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...NARANJA);
  doc.text('Fabricamos felicidad', M + 28, y + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  if (empresa?.ruc) doc.text(`RUC: ${empresa.ruc}`, M + 28, y + 14.5);

  // Recuadro derecho: RECETA / BOM
  const recW = 72;
  const recX = pageW - M - recW;
  doc.setFillColor(...AZUL);
  doc.rect(recX, y, recW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RECETA / BOM', recX + recW / 2, y + 6, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`Materiales ${data.versionMateriales}  ·  Procesos ${data.versionProcesos}`, recX + recW / 2, y + 11, { align: 'center' });

  y += 22;

  // ─── Bloque de datos del producto ─────────────────────────────────────────
  const boxW = pageW - M * 2;
  const blockH = 16;
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.rect(M, y, boxW, blockH, 'S');
  const labelValor = (label: string, valor: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AZUL);
    doc.setFontSize(8);
    doc.text(label, x, yy);
    const lw = doc.getTextWidth(label) + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(valor, x + lw, yy);
  };
  labelValor('Producto:', data.producto, M + 2, y + 6);
  labelValor('Código:', data.codigo, M + boxW * 0.62, y + 6);
  labelValor('Estado:', data.activa ? 'Activa (vigente)' : 'Histórica', M + 2, y + 12);
  // "Emitido" = fecha de CREACIÓN de la receta (no la fecha de impresión).
  const fechaCreada = data.creadaEn
    ? new Date(data.creadaEn.length <= 10 ? `${data.creadaEn}T12:00:00` : data.creadaEn)
        .toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
  labelValor('Emitido:', fechaCreada, M + boxW * 0.62, y + 12);

  y += blockH + 5;

  // ─── Tabla de MATERIALES ──────────────────────────────────────────────────
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MATERIALES (BOM)', M, y);
  y += 2;

  const matsOrden = [...data.materiales].sort(
    (a, b) => ordenTalla(a.talla) - ordenTalla(b.talla) || a.material.localeCompare(b.material, 'es'),
  );
  const costoMatTotal = matsOrden.reduce((s, m) => s + m.costo, 0);

  if (matsOrden.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text('Sin materiales cargados.', M, y + 5);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Talla', 'Material', 'Código', 'Categoría', 'Cantidad', 'Costo', 'Taller', 'Botón']],
      body: matsOrden.map((m) => [
        formatTallaChip(m.talla),
        m.material,
        m.codigo,
        m.categoria,
        m.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 }),
        fmtPEN(m.costo),
        m.saleAServicio ? 'Sí' : '—',
        m.saleAOjalBoton ? 'Sí' : '—',
      ]),
      foot: [[{ content: 'TOTAL MATERIALES', colSpan: 5, styles: { halign: 'right' } }, fmtPEN(costoMatTotal), '', '']],
      headStyles: { fillColor: AZUL, textColor: 255, fontSize: 7, halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: [...AZUL], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7, cellPadding: 1.1 },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 24 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 12, halign: 'center' },
        7: { cellWidth: 12, halign: 'center' },
      },
      theme: 'striped',
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ─── Tabla de PROCESOS ────────────────────────────────────────────────────
  if (y > pageH - 40) { doc.addPage(); y = M; }
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('PROCESOS / OPERACIONES', M, y);
  y += 2;

  const procsOrden = [...data.procesos].sort((a, b) => a.orden - b.orden);
  const tiempoTotal = procsOrden.reduce((s, p) => s + p.tiempoMin, 0);
  const costoMOTotal = procsOrden.reduce((s, p) => s + p.costo, 0);

  if (procsOrden.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text('Sin procesos cargados.', M, y + 5);
    y += 10;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['#', 'Proceso', 'Área', 'Talla', 'Tiempo est. (min)', 'Costo MO', 'Terceriza']],
      body: procsOrden.map((p) => [
        String(p.orden),
        p.proceso.replace('_', ' '),
        p.area || '—',
        p.talla ? formatTallaChip(p.talla) : 'Todas',
        p.tiempoMin.toLocaleString('es-PE', { maximumFractionDigits: 2 }),
        fmtPEN(p.costo),
        p.esTercerizado ? 'Sí' : '—',
      ]),
      foot: [[
        { content: 'TOTAL', colSpan: 4, styles: { halign: 'right' } },
        tiempoTotal.toLocaleString('es-PE', { maximumFractionDigits: 2 }),
        fmtPEN(costoMOTotal),
        '',
      ]],
      headStyles: { fillColor: GRIS, textColor: 255, fontSize: 7, halign: 'center' },
      footStyles: { fillColor: [241, 245, 249], textColor: [...AZUL], fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.2 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 34 },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 18, halign: 'center' },
      },
      theme: 'striped',
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // ─── Resumen de costo POR TALLA ───────────────────────────────────────────
  // Costo estándar de UNA prenda de cada talla = materiales de esa talla +
  // mano de obra (procesos de esa talla + procesos que aplican a todas).
  const matPorTalla = new Map<string, number>();
  for (const m of data.materiales) matPorTalla.set(m.talla, (matPorTalla.get(m.talla) ?? 0) + m.costo);
  let moGeneral = 0;
  const moPorTalla = new Map<string, number>();
  for (const p of data.procesos) {
    if (p.talla) moPorTalla.set(p.talla, (moPorTalla.get(p.talla) ?? 0) + p.costo);
    else moGeneral += p.costo; // proceso sin talla = aplica a todas
  }
  const tallasResumen = [...new Set([...matPorTalla.keys(), ...moPorTalla.keys()])]
    .sort((a, b) => ordenTalla(a) - ordenTalla(b));

  if (tallasResumen.length > 0) {
    if (y > pageH - 40) { doc.addPage(); y = M; }
    doc.setTextColor(...AZUL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('RESUMEN DE COSTO POR TALLA', M, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      head: [['Talla', 'Materiales', 'Mano de obra', 'Costo por prenda']],
      body: tallasResumen.map((t) => {
        const mat = matPorTalla.get(t) ?? 0;
        const mo = moGeneral + (moPorTalla.get(t) ?? 0);
        return [formatTallaChip(t), fmtPEN(mat), fmtPEN(mo), fmtPEN(mat + mo)];
      }),
      headStyles: { fillColor: AZUL, textColor: 255, fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 8, cellPadding: 1.4 },
      columnStyles: {
        0: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold', textColor: [...AZUL] },
      },
      theme: 'striped',
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  // ─── Footer en todas las páginas ──────────────────────────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(6);
    doc.setTextColor(...GRIS);
    doc.setFont('helvetica', 'italic');
    doc.text(
      `Receta ${data.producto} (${data.codigo}) — Documento interno emitido por HAPPY SAC ERP · Pág. ${i}/${total}`,
      pageW / 2, pageH - 8, { align: 'center' },
    );
  }

  const nombreArch = `${data.codigo || data.producto}`.replace(/[^A-Za-z0-9_-]/g, '_');
  doc.save(`receta-${nombreArch}.pdf`);
}
