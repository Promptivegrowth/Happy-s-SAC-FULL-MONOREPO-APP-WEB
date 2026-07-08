/**
 * Guía de Remisión — Remitente en Excel brandeado.
 *
 * El PDF es lo que el chofer imprime y muestra al control policial. El Excel
 * es para que el cliente lo guarde en su sistema contable / lo edite / lo
 * mande adjunto por email. Datos idénticos al PDF — solo cambia el soporte.
 *
 * Referencia SUNAT: R.S. 097-2012 (guía de remisión electrónica). Este archivo
 * es documento interno, no la GRE oficial.
 */

import type { TrasladoDetalle, TrasladoLineaDetalle } from '@/server/actions/traslados';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';

export async function generarGuiaRemisionExcel(
  traslado: TrasladoDetalle,
  lineas: TrasladoLineaDetalle[],
  empresa: EmpresaPDFData | null = null,
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HAPPY SAC ERP';
  wb.created = new Date();

  const ws = wb.addWorksheet('Guía de remisión', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  });

  // Colores brand (mismos que el PDF)
  const AZUL = 'FF1E3A5F';
  const NARANJA = 'FFFF4D0D';
  const BG_SUAVE = 'FFF8FAFC';
  const TEXTO = 'FF0F172A';

  const fechaEmision = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fechaTraslado = traslado.fecha_despacho
    ? new Date(traslado.fecha_despacho).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : fechaEmision;

  // Anchos de columna
  ws.columns = [
    { width: 8 },   // A - N° / código
    { width: 40 },  // B - descripción
    { width: 14 },  // C - detalle (talla)
    { width: 12 },  // D - cantidad
    { width: 14 },  // E - unidad
    { width: 18 },  // F - observación
  ];

  // ═══════════════════════════════════════════════════════════════════════
  // CABECERA — Empresa emisora + Título
  // ═══════════════════════════════════════════════════════════════════════
  ws.mergeCells('A1:F1');
  const tituloCell = ws.getCell('A1');
  tituloCell.value = 'GUÍA DE REMISIÓN — REMITENTE';
  tituloCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  tituloCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  tituloCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:F2');
  const nCell = ws.getCell('A2');
  nCell.value = `N° ${traslado.codigo}`;
  nCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NARANJA } };
  nCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(2).height = 22;

  // Emisor
  let row = 4;
  const emisorHdr = ws.getCell(`A${row}`);
  ws.mergeCells(`A${row}:F${row}`);
  emisorHdr.value = 'REMITENTE';
  emisorHdr.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  emisorHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  emisorHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 20;
  row++;

  writePair(ws, row, 'Razón social', empresa?.razon_social ?? '—');
  row++;
  writePair(ws, row, 'RUC', empresa?.ruc ?? '—');
  row++;
  writePair(ws, row, 'Dirección fiscal', empresa?.direccion_fiscal ?? '—');
  row += 2;

  // ═══════════════════════════════════════════════════════════════════════
  // TRASLADO
  // ═══════════════════════════════════════════════════════════════════════
  const trasladoHdr = ws.getCell(`A${row}`);
  ws.mergeCells(`A${row}:F${row}`);
  trasladoHdr.value = 'DATOS DEL TRASLADO';
  trasladoHdr.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  trasladoHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  trasladoHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 20;
  row++;

  writePair(ws, row, 'Fecha emisión', fechaEmision);
  row++;
  writePair(ws, row, 'Fecha de traslado', fechaTraslado);
  row++;
  writePair(ws, row, 'Motivo', 'Traslado entre establecimientos del mismo contribuyente');
  row++;
  const modalidadExcel = traslado.modalidad === 'PUBLICO'
    ? `PÚBLICO — ${traslado.transportista_razon_social ?? '—'} (RUC ${traslado.transportista_ruc ?? '—'})`
    : 'PRIVADO (vehículo del remitente)';
  writePair(ws, row, 'Modalidad', modalidadExcel);
  row++;
  writePair(ws, row, 'N° de guía interna', traslado.guia_remision ?? traslado.codigo);
  row++;
  if (traslado.motivo) {
    writePair(ws, row, 'Detalle', traslado.motivo);
    row++;
  }
  row++;

  // Vehículo y conductor (si están cargados)
  if (traslado.vehiculo_placa || traslado.chofer_nombre) {
    const vehHdr = ws.getCell(`A${row}`);
    ws.mergeCells(`A${row}:F${row}`);
    vehHdr.value = 'VEHÍCULO Y CONDUCTOR';
    vehHdr.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    vehHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    vehHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(row).height = 20;
    row++;
    if (traslado.vehiculo_placa) { writePair(ws, row, 'Placa', traslado.vehiculo_placa); row++; }
    if (traslado.vehiculo_marca) { writePair(ws, row, 'Marca', traslado.vehiculo_marca); row++; }
    if (traslado.vehiculo_tarjeta_circulacion) { writePair(ws, row, 'N° Tarjeta circulación', traslado.vehiculo_tarjeta_circulacion); row++; }
    if (traslado.chofer_nombre) { writePair(ws, row, 'Chofer', traslado.chofer_nombre); row++; }
    if (traslado.chofer_dni) { writePair(ws, row, 'DNI chofer', traslado.chofer_dni); row++; }
    if (traslado.chofer_licencia) { writePair(ws, row, 'N° Licencia', traslado.chofer_licencia); row++; }
    row++;
  }

  // Bultos si están cargados
  if (traslado.cantidad_bultos != null && traslado.cantidad_bultos > 0) {
    const bultosLabel = `${traslado.cantidad_bultos} ${traslado.tipo_bulto ?? 'BULTOS'}`;
    const pesoTxt = traslado.peso_total_kg != null && traslado.peso_total_kg > 0
      ? ` · Peso total: ${traslado.peso_total_kg.toFixed(2)} kg`
      : '';
    writePair(ws, row, 'Bultos transportados', bultosLabel + pesoTxt);
    row++;
    row++;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PARTIDA + LLEGADA
  // ═══════════════════════════════════════════════════════════════════════
  const puntosHdr = ws.getCell(`A${row}`);
  ws.mergeCells(`A${row}:C${row}`);
  puntosHdr.value = 'PUNTO DE PARTIDA';
  puntosHdr.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  puntosHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  puntosHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  const llegadaHdr = ws.getCell(`D${row}`);
  ws.mergeCells(`D${row}:F${row}`);
  llegadaHdr.value = 'PUNTO DE LLEGADA';
  llegadaHdr.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  llegadaHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  llegadaHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 20;
  row++;

  const origen = [
    `${traslado.almacen_origen_codigo} · ${traslado.almacen_origen_nombre}`,
    traslado.almacen_origen_direccion ?? '(sin dirección)',
  ].join('\n');
  const destino = [
    `${traslado.almacen_destino_codigo} · ${traslado.almacen_destino_nombre}`,
    traslado.almacen_destino_direccion ?? '(sin dirección)',
  ].join('\n');
  ws.mergeCells(`A${row}:C${row}`);
  ws.getCell(`A${row}`).value = origen;
  ws.getCell(`A${row}`).alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: 1 };
  ws.mergeCells(`D${row}:F${row}`);
  ws.getCell(`D${row}`).value = destino;
  ws.getCell(`D${row}`).alignment = { wrapText: true, vertical: 'top', horizontal: 'left', indent: 1 };
  ws.getRow(row).height = 40;
  row += 2;

  // ═══════════════════════════════════════════════════════════════════════
  // BIENES TRANSPORTADOS
  // ═══════════════════════════════════════════════════════════════════════
  const bienesHdr = ws.getCell(`A${row}`);
  ws.mergeCells(`A${row}:F${row}`);
  bienesHdr.value = 'BIENES TRANSPORTADOS';
  bienesHdr.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  bienesHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  bienesHdr.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 20;
  row++;

  // Encabezados tabla
  const headers = ['Código', 'Descripción', 'Detalle', 'Cantidad', 'Unidad', 'Observación'];
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 10, color: { argb: TEXTO } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_SUAVE } };
    cell.alignment = { horizontal: i === 3 ? 'right' : 'left', vertical: 'middle', indent: 1 };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  row++;

  let totalCantidad = 0;
  for (const l of lineas) {
    ws.getCell(row, 1).value = l.codigo ?? '—';
    ws.getCell(row, 2).value = l.nombre;
    ws.getCell(row, 3).value = l.detalle ?? '—';
    ws.getCell(row, 4).value = l.cantidad;
    ws.getCell(row, 5).value = l.tipo === 'VARIANTE' ? 'UNIDAD' : 'UNIDAD';
    ws.getCell(row, 6).value = l.observacion ?? '';
    for (let c = 1; c <= 6; c++) {
      const cell = ws.getCell(row, c);
      cell.font = { size: 10, color: { argb: TEXTO } };
      cell.alignment = { horizontal: c === 4 ? 'right' : 'left', vertical: 'middle', indent: 1, wrapText: true };
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
    }
    totalCantidad += Number(l.cantidad ?? 0);
    row++;
  }

  // Total
  const totalLabel = ws.getCell(`A${row}`);
  ws.mergeCells(`A${row}:C${row}`);
  totalLabel.value = 'TOTAL BULTOS';
  totalLabel.font = { bold: true, size: 10, color: { argb: TEXTO } };
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_SUAVE } };
  totalLabel.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  const totalVal = ws.getCell(`D${row}`);
  totalVal.value = totalCantidad;
  totalVal.font = { bold: true, size: 11, color: { argb: NARANJA } };
  totalVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_SUAVE } };
  totalVal.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  ws.mergeCells(`E${row}:F${row}`);
  ws.getCell(`E${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_SUAVE } };
  ws.getRow(row).height = 22;
  row += 3;

  // ═══════════════════════════════════════════════════════════════════════
  // FIRMAS
  // ═══════════════════════════════════════════════════════════════════════
  ws.mergeCells(`A${row}:C${row}`);
  ws.getCell(`A${row}`).value = '_________________________';
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
  ws.mergeCells(`D${row}:F${row}`);
  ws.getCell(`D${row}`).value = '_________________________';
  ws.getCell(`D${row}`).alignment = { horizontal: 'center' };
  row++;
  ws.mergeCells(`A${row}:C${row}`);
  ws.getCell(`A${row}`).value = 'Firma del despachador';
  ws.getCell(`A${row}`).font = { size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
  ws.mergeCells(`D${row}:F${row}`);
  ws.getCell(`D${row}`).value = 'Firma del receptor';
  ws.getCell(`D${row}`).font = { size: 9, color: { argb: 'FF64748B' } };
  ws.getCell(`D${row}`).alignment = { horizontal: 'center' };
  row += 2;

  // Footer
  ws.mergeCells(`A${row}:F${row}`);
  const footer = ws.getCell(`A${row}`);
  footer.value = 'Documento interno — sustenta traslado entre establecimientos del mismo contribuyente (R.S. 097-2012/SUNAT).';
  footer.font = { size: 8, italic: true, color: { argb: 'FF64748B' } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };

  // Descargar
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GUIA-REMISION-${traslado.codigo}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function writePair(
  ws: import('exceljs').Worksheet,
  row: number,
  label: string,
  value: string | number,
) {
  const l = ws.getCell(`A${row}`);
  ws.mergeCells(`A${row}:B${row}`);
  l.value = label;
  l.font = { bold: true, size: 10, color: { argb: 'FF475569' } };
  l.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  const v = ws.getCell(`C${row}`);
  ws.mergeCells(`C${row}:F${row}`);
  v.value = value;
  v.font = { size: 10, color: { argb: 'FF0F172A' } };
  v.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
}
