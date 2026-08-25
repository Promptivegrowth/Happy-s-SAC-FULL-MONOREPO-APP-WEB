'use server';

import ExcelJS from 'exceljs';
import { listarKardex, type KardexFiltros, type KardexMov } from './kardex';
import { formatTallaChip } from '@happy/lib';

/**
 * Exporta el Kardex a Excel con los mismos filtros de la pantalla (almacén, tipo,
 * entidad, búsqueda, fechas). Pedido cliente 2026-08-24. Trae todos los
 * movimientos que matchean (cap de seguridad 10.000).
 */
export async function exportarKardexExcel(
  filtros: KardexFiltros,
): Promise<{ base64: string; filename: string; mime: string }> {
  const all: KardexMov[] = [];
  let pagina = 1;
  const porPagina = 500;
  let total = Infinity;
  while (all.length < total && all.length < 10000) {
    const res = await listarKardex({ ...filtros, pagina, por_pagina: porPagina });
    if (!res.ok || !res.data) break;
    all.push(...res.data.rows);
    total = res.data.total;
    if (res.data.rows.length < porPagina) break;
    pagina++;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'HAPPY SAC ERP';
  const ws = wb.addWorksheet('Kardex');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 22 },
    { header: 'Almacén', key: 'almacen', width: 12 },
    { header: 'Item', key: 'item', width: 36 },
    { header: 'Talla', key: 'talla', width: 8 },
    { header: 'Código / SKU', key: 'codigo', width: 16 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Costo unit.', key: 'costo', width: 14 },
    { header: 'Referencia', key: 'referencia', width: 16 },
    { header: 'Observación', key: 'obs', width: 40 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

  for (const m of all) {
    const esEntrada = m.tipo.startsWith('ENTRADA_');
    const signo = esEntrada ? 1 : -1;
    const item = m.variante ? m.variante.producto_nombre : m.material ? m.material.nombre : '—';
    const talla = m.variante ? formatTallaChip(m.variante.talla) : '';
    const codigo = m.variante ? m.variante.sku : m.material ? m.material.codigo : '';
    const fecha = new Date(m.fecha).toLocaleString('es-PE', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima',
    });
    const row = ws.addRow({
      fecha,
      tipo: m.tipo.replace(/_/g, ' '),
      almacen: m.almacen?.codigo ?? '—',
      item,
      talla,
      codigo,
      cantidad: signo * Number(m.cantidad),
      costo: m.costo_unitario != null ? Number(m.costo_unitario) : null,
      referencia: m.referencia_tipo ?? '',
      obs: m.observacion ?? '',
    });
    row.getCell('cantidad').numFmt = '#,##0.####';
    row.getCell('costo').numFmt = '"S/ "#,##0.0000';
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'J1' };

  const buf = await wb.xlsx.writeBuffer();
  const base64 = Buffer.from(buf as ArrayBuffer).toString('base64');
  return {
    base64,
    filename: `kardex-${new Date().toISOString().slice(0, 10)}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
