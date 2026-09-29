/**
 * Representación impresa de la Guía de Remisión Remitente electrónica.
 *
 * Es la hoja que viaja con la caja o se le muestra a la agencia. Lleva los datos
 * que pide SUNAT para la GRE y, sobre todo, el QR del CDR: escaneándolo se
 * comprueba en SUNAT que la guía existe y fue aceptada.
 */

import { MOTIVOS_TRASLADO } from '@happy/lib/sunat-ubl/despatch';
import type { ImpresionGuia } from '@/server/actions/guias';

const DOC: Record<string, string> = { '1': 'DNI', '6': 'RUC', '4': 'C.E.', '7': 'PASAPORTE' };

function fecha(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; }
  return new Date(s).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function descargarGuiaPdf(d: ImpresionGuia): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable = (autoTableMod.default ?? autoTableMod) as unknown as (doc: any, options: any) => void;
  const g = d.guia as Record<string, string | number | boolean | null>;
  const e = d.empresa;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  const AZUL: [number, number, number] = [30, 58, 95];
  const GRIS: [number, number, number] = [100, 116, 139];

  // ── Cabecera: empresa a la izquierda, recuadro con RUC y número a la derecha.
  let y = M;
  if (e?.logo_dataurl && e.logo_formato) {
    try { doc.addImage(e.logo_dataurl, e.logo_formato, M, y, 22, 17); } catch { /* sin logo */ }
  }
  const xTxt = e?.logo_dataurl ? M + 26 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...AZUL);
  doc.text(e?.razon_social ?? "HAPPY'S S.A.C.", xTxt, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
  const dirLineas = doc.splitTextToSize(e?.direccion_fiscal ?? '', 88) as string[];
  doc.text(dirLineas, xTxt, y + 10);
  if (e?.telefono || e?.email) doc.text([e?.telefono, e?.email].filter(Boolean).join(' · '), xTxt, y + 10 + dirLineas.length * 3.5);

  const bx = W - M - 72;
  doc.setDrawColor(...AZUL); doc.setLineWidth(0.5); doc.roundedRect(bx, y, 72, 26, 2, 2);
  doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(`R.U.C. ${e?.ruc ?? ''}`, bx + 36, y + 6, { align: 'center' });
  doc.setFontSize(9);
  doc.text('GUÍA DE REMISIÓN ELECTRÓNICA', bx + 36, y + 12, { align: 'center' });
  doc.text('REMITENTE', bx + 36, y + 16.5, { align: 'center' });
  doc.setFontSize(11);
  doc.text(String(g.numero_completo ?? ''), bx + 36, y + 23, { align: 'center' });
  y += 32;

  // ── Datos del traslado en pares etiqueta / valor, a dos columnas.
  const publico = g.modalidad === 'PUBLICO';
  const motivo = MOTIVOS_TRASLADO[String(g.motivo_traslado) as keyof typeof MOTIVOS_TRASLADO] ?? String(g.motivo_traslado);
  const pares: Array<[string, string]> = [
    ['Fecha de emisión', fecha(g.fecha_emision)],
    ['Inicio del traslado', fecha(g.fecha_traslado)],
    ['Destinatario', String(g.destinatario_nombre ?? '')],
    [DOC[String(g.destinatario_tipo_doc)] ?? 'Documento', String(g.destinatario_num_doc ?? '')],
    ['Motivo del traslado', g.motivo_descripcion ? `${motivo}: ${g.motivo_descripcion}` : motivo],
    ['Modalidad', publico ? 'Transporte público' : 'Transporte privado'],
    ['Peso bruto total', `${Number(g.peso_bruto_kg ?? 0).toFixed(3)} KGM`],
    ['Número de bultos', g.num_bultos ? String(g.num_bultos) : '—'],
  ];
  if (d.documento) pares.push(['Documento relacionado', d.documento]);
  if (publico) {
    pares.push(['Transportista', String(g.transportista_razon_social ?? '')], ['RUC transportista', String(g.transportista_ruc ?? '')]);
    if (g.fecha_entrega_transportista) pares.push(['Entrega al transportista', fecha(g.fecha_entrega_transportista)]);
    if (g.transportista_mtc) pares.push(['Registro MTC', String(g.transportista_mtc)]);
  } else if (g.vehiculo_m1l) {
    pares.push(['Vehículo', 'Categoría M1 o L']);
  } else {
    pares.push(
      ['Placa', String(g.placa_vehiculo ?? '')],
      ['Conductor', `${g.conductor_nombre ?? ''} ${g.conductor_apellidos ?? ''}`.trim()],
      ['DNI conductor', String(g.conductor_dni ?? '')],
      ['Licencia', String(g.conductor_licencia ?? '')],
    );
  }

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.2, textColor: [30, 41, 59] },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 36, textColor: AZUL }, 1: { cellWidth: 57 }, 2: { fontStyle: 'bold', cellWidth: 36, textColor: AZUL }, 3: { cellWidth: 57 } },
    body: Array.from({ length: Math.ceil(pares.length / 2) }, (_, i) => [
      pares[i * 2]![0], pares[i * 2]![1], pares[i * 2 + 1]?.[0] ?? '', pares[i * 2 + 1]?.[1] ?? '',
    ]),
    margin: { left: M, right: M },
    tableLineColor: AZUL, tableLineWidth: 0.2,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 3;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Punto de partida', 'Punto de llegada']],
    body: [[
      `${g.direccion_partida ?? ''}\nUbigeo ${g.ubigeo_partida ?? ''}${g.cod_establecimiento_partida ? ` · Establecimiento ${g.cod_establecimiento_partida}` : ''}`,
      `${g.direccion_llegada ?? ''}\nUbigeo ${g.ubigeo_llegada ?? ''}${g.cod_establecimiento_llegada ? ` · Establecimiento ${g.cod_establecimiento_llegada}` : ''}`,
    ]],
    headStyles: { fillColor: AZUL, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: M, right: M },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 3;

  autoTable(doc, {
    startY: y,
    theme: 'striped',
    head: [['N°', 'Código', 'Descripción', 'Unidad', 'Cantidad']],
    body: d.items.map((it, i) => [String(i + 1), it.codigo ?? '', it.descripcion, it.unidad === 'NIU' || !it.unidad ? 'UNIDAD' : it.unidad, String(Number(it.cantidad))]),
    headStyles: { fillColor: AZUL, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 30 }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'right' } },
    margin: { left: M, right: M },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4;

  if (g.observacion) {
    doc.setFontSize(8); doc.setTextColor(30, 41, 59); doc.setFont('helvetica', 'bold');
    doc.text('Observación:', M, y + 3);
    doc.setFont('helvetica', 'normal');
    const obs = doc.splitTextToSize(String(g.observacion), W - 2 * M - 22) as string[];
    doc.text(obs, M + 20, y + 3);
    y += 4 + obs.length * 3.5;
  }

  // ── Pie: QR de SUNAT y leyenda.
  if (y > 250) { doc.addPage(); y = M; }
  if (d.qrDataUrl) {
    try { doc.addImage(d.qrDataUrl, 'PNG', M, y + 2, 30, 30); } catch { /* sin QR */ }
  }
  doc.setFontSize(7.5); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'normal');
  const leyenda = [
    'Representación impresa de la Guía de Remisión Electrónica Remitente.',
    g.estado === 'ACEPTADO'
      ? 'Aceptada por SUNAT. Escanea el código QR para verificarla.'
      : 'ATENCIÓN: esta guía todavía no figura como aceptada por SUNAT.',
    g.hash_firma ? `Resumen: ${g.hash_firma}` : '',
  ].filter(Boolean);
  doc.text(leyenda, d.qrDataUrl ? M + 34 : M, y + 8);

  doc.save(`${e?.ruc ?? 'GUIA'}-09-${g.numero_completo}.pdf`);
}
