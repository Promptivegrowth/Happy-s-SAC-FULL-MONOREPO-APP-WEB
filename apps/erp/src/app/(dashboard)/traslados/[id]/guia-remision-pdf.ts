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

  // ─── Cabecera COMPACTA ─────────────────────────────────────────────────
  // Rediseño 2026-07-12 pedido por cliente sobre su guía de referencia:
  //   1. "Subir encabezado" — antes ocupaba 32mm + separador; ahora 22mm.
  //   2. "Unir en un solo bloque extendido a la derecha, sin repetidos" —
  //      los bloques REMITENTE / PARTIDA / LLEGADA / DATOS DEL TRASLADO se
  //      fusionan en UN recuadro full-width con pares label:valor en dos
  //      columnas (como su guía electrónica antigua). El RUC y el domicilio
  //      fiscal aparecen UNA sola vez.
  let y = M;

  // Logo a la izquierda (compacto)
  if (empresa?.logo_dataurl && empresa?.logo_formato) {
    try {
      doc.addImage(empresa.logo_dataurl, empresa.logo_formato, M, y, 24, 18);
    } catch { /* ignore */ }
  }

  // Nombre + slogan + contacto al lado del logo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...AZUL);
  doc.text(
    (empresa?.nombre_comercial || empresa?.razon_social || 'DISFRACES HAPPY\'S').toUpperCase(),
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

  // Recuadro derecho: RUC + tipo + número
  const recW = 68;
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
  doc.text('GUÍA DE REMISIÓN — REMITENTE', recX + recW / 2, y + 10, { align: 'center' });
  doc.setFontSize(12);
  doc.text(traslado.guia_remision || traslado.codigo, recX + recW / 2, y + 16.5, { align: 'center' });

  y += 22;

  // ─── BLOQUE ÚNICO: datos del traslado (full-width, sin repetidos) ──────
  const boxW = pageW - M * 2;
  const filaAlta = 4.2;
  const colIzqX = M + 2;
  const colDerX = M + boxW * 0.56;
  const labelValor = (label: string, valor: string, x: number, yy: number, maxW: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AZUL);
    doc.text(label, x, yy);
    const lw = doc.getTextWidth(label) + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    const val = doc.splitTextToSize(valor, maxW - lw) as string[];
    // Si el valor no entra en una línea, marcar el corte con "…" en vez de
    // truncar en silencio — es un documento de sustento, el lector debe ver
    // que hay más texto (fix 2026-07-12).
    const linea = val.length > 1 ? `${val[0]}…` : (val[0] ?? '—');
    doc.text(linea, x + lw, yy);
    return val.length;
  };

  const dirOrigen = [
    `${traslado.almacen_origen_codigo} · ${traslado.almacen_origen_nombre}`,
    traslado.almacen_origen_direccion,
  ].filter(Boolean).join(' — ');
  const dirDestino = [
    `${traslado.almacen_destino_codigo} · ${traslado.almacen_destino_nombre}`,
    traslado.almacen_destino_direccion,
  ].filter(Boolean).join(' — ');

  // Alto del bloque: 5 filas fijas + detalle opcional
  const tieneDetalle = !!traslado.motivo;
  const blockH = 6 + filaAlta * (4 + (tieneDetalle ? 1 : 0)) + 2;
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.rect(M, y, boxW, blockH, 'S');

  doc.setFontSize(7.5);
  let fy = y + 5;
  // Fila 1: remitente + fecha emisión
  labelValor('Remitente:', empresa?.razon_social ?? '—', colIzqX, fy, boxW * 0.54);
  labelValor('Fecha Emisión:', fechaEmision, colDerX, fy, boxW * 0.42);
  fy += filaAlta;
  // Fila 2: pto partida + fecha inicio traslado
  labelValor('Direc. Pto Partida:', dirOrigen, colIzqX, fy, boxW * 0.54);
  labelValor('Fec. Inicio Traslado:', fechaTraslado, colDerX, fy, boxW * 0.42);
  fy += filaAlta;
  // Fila 3: pto llegada + nº interno
  labelValor('Direc. Pto Llegada:', dirDestino, colIzqX, fy, boxW * 0.54);
  labelValor('N° Interno:', traslado.codigo, colDerX, fy, boxW * 0.42);
  fy += filaAlta;
  // Fila 4: motivo + bultos/peso
  labelValor('Motivo:', 'TRASLADO ENTRE ESTABLECIMIENTOS DEL MISMO CONTRIBUYENTE', colIzqX, fy, boxW * 0.54);
  const bultosTxt = traslado.cantidad_bultos != null && traslado.cantidad_bultos > 0
    ? `${traslado.cantidad_bultos} ${traslado.tipo_bulto ?? 'BULTOS'}${traslado.peso_total_kg != null && traslado.peso_total_kg > 0 ? ` · ${traslado.peso_total_kg.toFixed(2)} kg` : ''}`
    : '—';
  labelValor('Bultos / Peso:', bultosTxt, colDerX, fy, boxW * 0.42);
  fy += filaAlta;
  // Fila 5 (opcional): detalle libre
  if (tieneDetalle) {
    labelValor('Detalle:', traslado.motivo!, colIzqX, fy, boxW - 6);
    fy += filaAlta;
  }

  y += blockH + 3;

  // ─── BLOQUE TRANSPORTE (full-width, mismo estilo que la guía antigua) ──
  const tieneVehiculo = !!(traslado.vehiculo_placa || traslado.chofer_nombre || traslado.vehiculo_marca);
  const transpH = 6 + filaAlta * 2 + 2;
  doc.setDrawColor(...GRIS);
  doc.rect(M, y, boxW, transpH, 'S');
  // Título en franja
  doc.setFillColor(241, 245, 249);
  doc.rect(M, y, boxW, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...AZUL);
  doc.text('TRANSPORTE', M + boxW / 2, y + 3.6, { align: 'center' });

  doc.setFontSize(7.5);
  let ty = y + 8.5;
  if (tieneVehiculo || traslado.modalidad === 'PUBLICO') {
    const tipoTxt = traslado.modalidad === 'PUBLICO' ? 'PÚBLICO' : 'PRIVADO';
    labelValor('Tipo de Transporte:', tipoTxt, colIzqX, ty, boxW * 0.3);
    if (traslado.modalidad === 'PUBLICO') {
      labelValor('RUC:', traslado.transportista_ruc ?? '—', M + boxW * 0.34, ty, boxW * 0.2);
      labelValor('Razón Social:', traslado.transportista_razon_social ?? '—', M + boxW * 0.56, ty, boxW * 0.42);
    } else {
      labelValor('T. Circulación:', traslado.vehiculo_tarjeta_circulacion ?? '—', M + boxW * 0.56, ty, boxW * 0.42);
    }
    ty += filaAlta;
    labelValor('Marca y Placa:', [traslado.vehiculo_marca, traslado.vehiculo_placa].filter(Boolean).join(' ') || '—', colIzqX, ty, boxW * 0.3);
    labelValor('Conductor:', traslado.chofer_nombre ?? '—', M + boxW * 0.34, ty, boxW * 0.3);
    labelValor('DNI:', traslado.chofer_dni ?? '—', M + boxW * 0.68, ty, boxW * 0.12);
    labelValor('Licencia:', traslado.chofer_licencia ?? '—', M + boxW * 0.82, ty, boxW * 0.16);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Placa: ________________  Marca: ________________  T. Circulación: ________________', colIzqX, ty);
    ty += filaAlta;
    doc.text('Conductor: ________________________________  DNI: ____________  Licencia: ____________', colIzqX, ty);
  }

  y += transpH + 4;

  // ─── Tabla de bienes ──────────────────────────────────────────────────
  doc.setTextColor(...AZUL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('BIENES TRANSPORTADOS', M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Item', 'Código', 'Descripción', 'Detalle', 'U.Med', 'Cantidad']],
    body: lineas.map((l, i) => [
      String(i + 1),
      l.codigo ?? '—',
      l.nombre,
      l.detalle ?? '',
      l.tipo === 'VARIANTE' ? 'UND' : '—',
      l.cantidad.toString(),
    ]),
    // colSpan 5 para que "TOTAL" tenga todo el ancho hasta la columna de
    // cantidad — antes caía en la columna U.Med (14mm) y se partía en
    // "TOTA/L" (observación cliente 2026-07-13).
    foot: [[
      { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' } },
      lineas.reduce((s, l) => s + l.cantidad, 0).toString(),
    ]],
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: [241, 245, 249], textColor: [...AZUL], fontStyle: 'bold' },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.2 },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 26 },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 20, halign: 'right' },
    },
    theme: 'striped',
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // ─── Firmas ────────────────────────────────────────────────────────────
  // Si la tabla terminó demasiado abajo, las firmas (que necesitan ~22mm)
  // se saldrían del A4 (297mm). En ese caso van a una página nueva
  // (fix 2026-07-12 — antes se dibujaban fuera del papel).
  const pageH = doc.internal.pageSize.getHeight();
  let yFirmas = Math.max(finalY, pageH - 50);
  if (yFirmas + 22 > pageH - 10) {
    doc.addPage();
    yFirmas = pageH - 50;
  }

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
