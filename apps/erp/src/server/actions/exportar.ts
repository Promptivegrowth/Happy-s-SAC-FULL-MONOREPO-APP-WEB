'use server';

/**
 * Helpers de exportación brandeada (Excel · PDF · CSV).
 *
 * Todas las funciones devuelven un string base64 (data sin prefijo data:URL)
 * y un filename sugerido. El cliente arma el blob con atob() y dispara el
 * download. Eligimos base64 para evitar dependencias de Storage y mantener
 * todo el render del archivo en el server (estilos brandeados consistentes).
 */

import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND, type ColExport } from './reportes-helpers';

export type ExportOpts = {
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  cols: ColExport[];
  rows: Record<string, unknown>[];
  totales?: Record<string, number>;
};

export type ExportResult = { base64: string; filename: string; mime: string };

// ============================================================================
// EXCEL BRANDEADO (exceljs)
// ============================================================================
export async function generarExcelBrandeado(opts: ExportOpts): Promise<ExportResult> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HAPPY SAC ERP';
  wb.created = new Date();

  const ws = wb.addWorksheet(opts.titulo.slice(0, 31) || 'Reporte', {
    pageSetup: { paperSize: 9, orientation: 'landscape', margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    views: [{ state: 'frozen', ySplit: 4 + (opts.subtitulo ? 1 : 0) + (opts.filtros?.length ? 1 : 0) }],
  });

  // ---- Título principal (naranja, bold, size 18) ----
  ws.mergeCells(1, 1, 1, opts.cols.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = opts.titulo;
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: BRAND.naranja } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 26;

  let rowIdx = 2;
  if (opts.subtitulo) {
    ws.mergeCells(rowIdx, 1, rowIdx, opts.cols.length);
    const c = ws.getCell(rowIdx, 1);
    c.value = opts.subtitulo;
    c.font = { name: 'Calibri', size: 11, color: { argb: 'FF64748B' } };
    rowIdx++;
  }
  if (opts.filtros && opts.filtros.length) {
    ws.mergeCells(rowIdx, 1, rowIdx, opts.cols.length);
    const c = ws.getCell(rowIdx, 1);
    c.value = 'Filtros: ' + opts.filtros.join(' · ');
    c.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF94A3B8' } };
    rowIdx++;
  }
  rowIdx++; // espacio

  // ---- Header de tabla (azul oscuro fondo, blanco bold, h 28) ----
  const headerRow = ws.getRow(rowIdx);
  opts.cols.forEach((col, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = col.header;
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.blanco } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.azul } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    c.border = {
      top: { style: 'thin', color: { argb: BRAND.azul } },
      bottom: { style: 'thin', color: { argb: BRAND.azul } },
    };
  });
  headerRow.height = 28;

  // Set column widths/keys (ExcelJS columns array)
  ws.columns = opts.cols.map((col) => ({ key: col.key, width: col.width ?? 18 }));

  // ---- Filas con zebra ----
  opts.rows.forEach((row, i) => {
    const r = ws.addRow(opts.cols.map((c) => formatValue(row[c.key], c.formato)));
    const isZebra = i % 2 === 1;
    r.eachCell((cell, colNum) => {
      const col = opts.cols[colNum - 1];
      cell.font = { name: 'Calibri', size: 10, color: { argb: BRAND.textoOscuro } };
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          col?.formato === 'moneda' || col?.formato === 'numero' || col?.formato === 'porcentaje'
            ? 'right'
            : 'left',
      };
      if (isZebra) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.bgSuave } };
      }
      if (col?.formato === 'moneda') cell.numFmt = '"S/" #,##0.00';
      else if (col?.formato === 'numero') cell.numFmt = '#,##0';
      else if (col?.formato === 'porcentaje') cell.numFmt = '0.00"%"';
      else if (col?.formato === 'fecha') cell.numFmt = 'dd/mm/yyyy';
    });
  });

  // ---- Totales (fila final negrita en verde) ----
  if (opts.totales && Object.keys(opts.totales).length) {
    const totalesRow = ws.addRow(
      opts.cols.map((c, i) => {
        if (i === 0) return 'TOTAL';
        if (c.key in opts.totales!) return formatValue(opts.totales![c.key], c.formato);
        return '';
      }),
    );
    totalesRow.eachCell((cell, colNum) => {
      const col = opts.cols[colNum - 1];
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: BRAND.verde } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          col?.formato === 'moneda' || col?.formato === 'numero' || col?.formato === 'porcentaje'
            ? 'right'
            : 'left',
      };
      if (col?.formato === 'moneda') cell.numFmt = '"S/" #,##0.00';
      else if (col?.formato === 'numero') cell.numFmt = '#,##0';
      else if (col?.formato === 'porcentaje') cell.numFmt = '0.00"%"';
      cell.border = { top: { style: 'medium', color: { argb: BRAND.verde } } };
    });
    totalesRow.height = 24;
  }

  // ---- Footer ----
  const footerRow = ws.addRow([]);
  footerRow.height = 6;
  const fr = ws.addRow([
    `Generado el ${new Date().toLocaleString('es-PE')} por HAPPY SAC ERP`,
  ]);
  ws.mergeCells(fr.number, 1, fr.number, opts.cols.length);
  const fc = ws.getCell(fr.number, 1);
  fc.font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF94A3B8' } };
  fc.alignment = { horizontal: 'right' };

  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
  return {
    base64,
    filename: `${slugify(opts.titulo)}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

// ============================================================================
// PDF BRANDEADO (jspdf + autotable)
// ============================================================================
export async function generarPDFBrandeado(opts: ExportOpts): Promise<ExportResult> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ---- Header naranja ----
  doc.setFillColor(255, 77, 13); // BRAND.naranja
  doc.rect(0, 0, pageW, 50, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(opts.titulo, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('HAPPY SAC ERP', pageW - 30, 30, { align: 'right' });

  let y = 70;
  doc.setTextColor(100, 116, 139);
  if (opts.subtitulo) {
    doc.setFontSize(10);
    doc.text(opts.subtitulo, 30, y);
    y += 14;
  }
  if (opts.filtros && opts.filtros.length) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Filtros: ' + opts.filtros.join(' · '), 30, y);
    doc.setFont('helvetica', 'normal');
    y += 12;
  }
  y += 6;

  const head = [opts.cols.map((c) => c.header)];
  const body = opts.rows.map((row) =>
    opts.cols.map((c) => formatValueText(row[c.key], c.formato)),
  );

  // Totales como foot
  const foot = opts.totales
    ? [
        opts.cols.map((c, i) =>
          i === 0
            ? 'TOTAL'
            : c.key in opts.totales!
              ? formatValueText(opts.totales![c.key], c.formato)
              : '',
        ),
      ]
    : undefined;

  autoTable(doc, {
    startY: y,
    head,
    body,
    foot,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 58, 95], // BRAND.azul
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 6,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [15, 23, 42], // BRAND.textoOscuro
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // BRAND.bgSuave
    },
    footStyles: {
      fillColor: [236, 253, 245],
      textColor: [16, 185, 129],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 6,
    },
    columnStyles: opts.cols.reduce<Record<number, Partial<{ halign: 'left' | 'right' | 'center' }>>>(
      (acc, c, i) => {
        if (c.formato === 'moneda' || c.formato === 'numero' || c.formato === 'porcentaje') {
          acc[i] = { halign: 'right' };
        }
        return acc;
      },
      {},
    ),
    margin: { left: 30, right: 30 },
    didDrawPage: () => {
      const pageH = doc.internal.pageSize.getHeight();
      const w = doc.internal.pageSize.getWidth();
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Generado el ${new Date().toLocaleString('es-PE')} por HAPPY SAC ERP`,
        w - 30,
        pageH - 15,
        { align: 'right' },
      );
    },
  });

  const arrBuf = doc.output('arraybuffer');
  const base64 = Buffer.from(arrBuf).toString('base64');
  return {
    base64,
    filename: `${slugify(opts.titulo)}_${new Date().toISOString().slice(0, 10)}.pdf`,
    mime: 'application/pdf',
  };
}

// ============================================================================
// CSV (UTF-8 BOM para Excel)
// ============================================================================
export async function generarCSV(opts: ExportOpts): Promise<ExportResult> {
  const sep = ';'; // Excel-PE usa ';' por defecto
  const escape = (v: unknown): string => {
    const s = formatValueText(v, undefined);
    if (s.includes(sep) || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const lines: string[] = [];
  lines.push(opts.cols.map((c) => escape(c.header)).join(sep));
  for (const row of opts.rows) {
    lines.push(opts.cols.map((c) => escape(formatValueText(row[c.key], c.formato))).join(sep));
  }
  if (opts.totales) {
    lines.push(
      opts.cols
        .map((c, i) =>
          i === 0
            ? escape('TOTAL')
            : c.key in opts.totales!
              ? escape(formatValueText(opts.totales![c.key], c.formato))
              : '',
        )
        .join(sep),
    );
  }
  const BOM = '﻿';
  const content = BOM + lines.join('\r\n');
  const base64 = Buffer.from(content, 'utf-8').toString('base64');
  return {
    base64,
    filename: `${slugify(opts.titulo)}_${new Date().toISOString().slice(0, 10)}.csv`,
    mime: 'text/csv;charset=utf-8',
  };
}

// ============================================================================
// HELPERS internos
// ============================================================================
function formatValue(v: unknown, fmt: ColExport['formato']): string | number | Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (fmt === 'moneda' || fmt === 'numero' || fmt === 'porcentaje') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? null : n;
  }
  if (fmt === 'fecha') {
    if (v instanceof Date) return v;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d;
  }
  return String(v);
}

function formatValueText(v: unknown, fmt: ColExport['formato']): string {
  if (v === null || v === undefined || v === '') return '';
  if (fmt === 'moneda') {
    const n = Number(v);
    return Number.isNaN(n) ? '' : 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (fmt === 'numero') {
    const n = Number(v);
    return Number.isNaN(n) ? '' : n.toLocaleString('es-PE');
  }
  if (fmt === 'porcentaje') {
    const n = Number(v);
    return Number.isNaN(n) ? '' : n.toFixed(2) + '%';
  }
  if (fmt === 'fecha') {
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-PE');
  }
  return String(v);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
