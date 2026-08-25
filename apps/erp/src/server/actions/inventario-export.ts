'use server';

import ExcelJS from 'exceljs';
import { reporteStockValorizado, type StockValorizadoRow } from './reportes';

/**
 * Exporta el inventario a Excel (pedido cliente 2026-08-23).
 *  - Sin almacén: hoja "Consolidado" (todos los almacenes) + una hoja por almacén.
 *  - Con almacén: una sola hoja de ese almacén.
 * Reutiliza reporteStockValorizado (variantes PT + materiales) que ya agrega el
 * stock por almacén con su valorización.
 */
export async function exportarInventarioExcel(
  almacenId?: string,
): Promise<{ base64: string; filename: string; mime: string }> {
  const { rows } = await reporteStockValorizado(almacenId ? { almacen_id: almacenId } : {});

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HAPPY SAC ERP';

  const usados = new Set<string>();
  const nombreHojaSeguro = (base: string): string => {
    // Excel: máx 31 chars, sin : \ / ? * [ ]
    let n = (base || 'Hoja').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Hoja';
    let final = n, i = 2;
    while (usados.has(final.toLowerCase())) { final = `${n.slice(0, 25)} ${i++}`; }
    usados.add(final.toLowerCase());
    return final;
  };

  const AZUL = 'FF1E3A5F';
  const agregarHoja = (nombre: string, filas: StockValorizadoRow[]) => {
    const ws = wb.addWorksheet(nombreHojaSeguro(nombre));
    ws.columns = [
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
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    head.alignment = { vertical: 'middle' };

    const ordenadas = [...filas].sort(
      (a, b) => a.almacen.localeCompare(b.almacen, 'es')
        || a.tipo.localeCompare(b.tipo)
        || a.nombre.localeCompare(b.nombre, 'es'),
    );
    for (const r of ordenadas) {
      const row = ws.addRow({
        almacen: r.almacen,
        tipo: r.tipo === 'VARIANTE' ? 'Producto' : 'Material',
        codigo: r.codigo,
        nombre: r.nombre,
        detalle: r.detalle,
        categoria: r.categoria,
        cantidad: r.cantidad,
        costo_unitario: r.costo_unitario,
        valor_total: r.valor_total,
      });
      row.getCell('costo_unitario').numFmt = '"S/ "#,##0.00';
      row.getCell('valor_total').numFmt = '"S/ "#,##0.00';
      row.getCell('cantidad').numFmt = '#,##0.####';
    }
    // Totales
    const totalCant = ordenadas.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const totalValor = ordenadas.reduce((s, r) => s + Number(r.valor_total || 0), 0);
    const tot = ws.addRow({ nombre: 'TOTAL', cantidad: totalCant, valor_total: totalValor });
    tot.font = { bold: true };
    tot.getCell('valor_total').numFmt = '"S/ "#,##0.00';
    tot.getCell('cantidad').numFmt = '#,##0.####';
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'I1' };
  };

  if (almacenId) {
    const nombre = rows[0]?.almacen ?? 'Almacén';
    agregarHoja(nombre, rows);
  } else {
    agregarHoja('Consolidado', rows);
    const porAlmacen = new Map<string, StockValorizadoRow[]>();
    for (const r of rows) {
      const arr = porAlmacen.get(r.almacen) ?? [];
      arr.push(r);
      porAlmacen.set(r.almacen, arr);
    }
    for (const [alm, rs] of [...porAlmacen.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))) {
      // La hoja por almacén usa el nombre del almacén (quitando el código "COD · ").
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
