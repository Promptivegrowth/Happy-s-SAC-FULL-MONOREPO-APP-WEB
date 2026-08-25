'use server';

import ExcelJS from 'exceljs';
import { createClient } from '@happy/db/server';
import { reporteStockValorizado, type StockValorizadoRow } from './reportes';

/**
 * Exporta el inventario a Excel BRANDEADO (logo + colores HAPPY SAC).
 *  - Sin almacén: hoja "Consolidado" (todos) + una hoja por almacén.
 *  - Con almacén: una sola hoja de ese almacén.
 * Pedido cliente 2026-08-16 / brandeado 2026-08-24.
 */

const AZUL = 'FF1E3A5F';
const NARANJA = 'FFFF4D0D';
const BLANCO = 'FFFFFFFF';

export async function exportarInventarioExcel(
  almacenId?: string,
): Promise<{ base64: string; filename: string; mime: string }> {
  const { rows } = await reporteStockValorizado(almacenId ? { almacen_id: almacenId } : {});

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HAPPY SAC ERP';
  wb.created = new Date();

  // Empresa + logo (una sola vez, reutilizado en cada hoja).
  let logoImgId: number | null = null;
  let empresaNombre = 'DISFRACES HAPPYS';
  try {
    const sb = await createClient();
    const { data: emp } = await sb.from('empresa').select('logo_url, razon_social, nombre_comercial').single();
    empresaNombre = (emp?.nombre_comercial || emp?.razon_social || empresaNombre).toUpperCase();
    if (emp?.logo_url) {
      const resp = await fetch(emp.logo_url);
      if (resp.ok) {
        const ab = await resp.arrayBuffer();
        const ext = (emp.logo_url.split('.').pop() ?? 'png').toLowerCase();
        const extension = ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : 'png';
        logoImgId = wb.addImage({ buffer: Buffer.from(ab) as unknown as Parameters<typeof wb.addImage>[0]['buffer'], extension });
      }
    }
  } catch { /* logo opcional */ }

  const fechaGen = new Date().toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const usados = new Set<string>();
  const nombreHojaSeguro = (base: string): string => {
    let n = (base || 'Hoja').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Hoja';
    let final = n, i = 2;
    while (usados.has(final.toLowerCase())) { final = `${n.slice(0, 25)} ${i++}`; }
    usados.add(final.toLowerCase());
    return final;
  };

  const COLS = [
    { header: 'Almacén', key: 'almacen', width: 26 },
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Código / SKU', key: 'codigo', width: 16 },
    { header: 'Descripción', key: 'nombre', width: 40 },
    { header: 'Detalle', key: 'detalle', width: 16 },
    { header: 'Categoría', key: 'categoria', width: 14 },
    { header: 'Stock', key: 'cantidad', width: 12 },
    { header: 'Costo unit.', key: 'costo_unitario', width: 14 },
    { header: 'Valor total', key: 'valor_total', width: 16 },
  ];

  const agregarHoja = (nombre: string, filas: StockValorizadoRow[]) => {
    const ws = wb.addWorksheet(nombreHojaSeguro(nombre), { views: [{ state: 'frozen', ySplit: 4 }] });
    ws.columns = COLS.map((c) => ({ key: c.key, width: c.width }));

    // Membrete: logo + título + fecha.
    if (logoImgId != null) {
      ws.addImage(logoImgId, { tl: { col: 0, row: 0 } as unknown as ExcelJS.Anchor, br: { col: 2, row: 3 } as unknown as ExcelJS.Anchor });
    }
    const tituloCol = logoImgId != null ? 3 : 1;
    ws.mergeCells(1, tituloCol, 1, COLS.length);
    const t = ws.getCell(1, tituloCol);
    t.value = `${empresaNombre} — Inventario · ${nombre}`;
    t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: NARANJA } };
    t.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells(2, tituloCol, 2, COLS.length);
    const sub = ws.getCell(2, tituloCol);
    sub.value = `Generado ${fechaGen}`;
    sub.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } };
    ws.getRow(1).height = 22; ws.getRow(2).height = 16; ws.getRow(3).height = 12;

    // Header de tabla en fila 4.
    const headerRow = ws.getRow(4);
    COLS.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: BLANCO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
      cell.alignment = { vertical: 'middle' };
    });
    headerRow.height = 22;

    const ordenadas = [...filas].sort(
      (a, b) => a.almacen.localeCompare(b.almacen, 'es') || a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'),
    );
    let idx = 5;
    for (const r of ordenadas) {
      const row = ws.getRow(idx++);
      row.getCell(1).value = r.almacen;
      row.getCell(2).value = r.tipo === 'VARIANTE' ? 'Producto' : 'Material';
      row.getCell(3).value = r.codigo;
      row.getCell(4).value = r.nombre;
      row.getCell(5).value = r.detalle;
      row.getCell(6).value = r.categoria;
      row.getCell(7).value = Number(r.cantidad); row.getCell(7).numFmt = '#,##0.####';
      row.getCell(8).value = Number(r.costo_unitario); row.getCell(8).numFmt = '"S/ "#,##0.00';
      row.getCell(9).value = Number(r.valor_total); row.getCell(9).numFmt = '"S/ "#,##0.00';
      if (idx % 2 === 0) row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; });
    }
    // Totales
    const totalRow = ws.getRow(idx);
    totalRow.getCell(4).value = 'TOTAL';
    totalRow.getCell(7).value = ordenadas.reduce((s, r) => s + Number(r.cantidad || 0), 0); totalRow.getCell(7).numFmt = '#,##0.####';
    totalRow.getCell(9).value = ordenadas.reduce((s, r) => s + Number(r.valor_total || 0), 0); totalRow.getCell(9).numFmt = '"S/ "#,##0.00';
    totalRow.font = { bold: true };
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS.length } };
  };

  if (almacenId) {
    agregarHoja(rows[0]?.almacen ?? 'Almacén', rows);
  } else {
    agregarHoja('Consolidado', rows);
    const porAlmacen = new Map<string, StockValorizadoRow[]>();
    for (const r of rows) { const a = porAlmacen.get(r.almacen) ?? []; a.push(r); porAlmacen.set(r.almacen, a); }
    for (const [alm, rs] of [...porAlmacen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      const soloNombre = alm.includes(' · ') ? alm.split(' · ').slice(1).join(' · ') : alm;
      agregarHoja(soloNombre, rs);
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
  const sufijo = almacenId ? (rows[0]?.almacen?.split(' · ')[0] ?? 'almacen') : 'todos';
  return {
    base64,
    filename: `inventario-${sufijo}.xlsx`.replace(/[^A-Za-z0-9_.-]/g, '_'),
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
