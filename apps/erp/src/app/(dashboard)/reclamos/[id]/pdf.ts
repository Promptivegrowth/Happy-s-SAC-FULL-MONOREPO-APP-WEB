import type { ReclamoDetalle } from '@/server/actions/reclamos';

/**
 * Genera el PDF del Libro de Reclamaciones (formato hoja A4, una página).
 * Imports dinámicos para que jspdf no entre al bundle principal.
 *
 * Convención visual:
 *  - Cabecera con número, fecha y tipo (RECLAMO/QUEJA)
 *  - Bloques: Identificación del consumidor / Bien contratado / Detalle del
 *    reclamo / Pedido del consumidor / Respuesta (si existe) / Firmas
 */
export async function generarReclamoPdf(r: ReclamoDetalle): Promise<void> {
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
  const M = 14;

  const fecha = new Date(r.fecha).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Cabecera
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LIBRO DE RECLAMACIONES', pageW / 2, 18, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110);
  doc.text(
    'Conforme al Código de Protección y Defensa del Consumidor — Ley N° 29571',
    pageW / 2,
    23,
    { align: 'center' },
  );
  doc.setTextColor(0);

  // Cuadro número + fecha + tipo
  autoTable(doc, {
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 2 },
    head: [['N° de reclamo', 'Fecha', 'Tipo']],
    body: [[r.numero, fecha, r.tipo]],
    headStyles: { fillColor: [37, 99, 235], textColor: 255, halign: 'center', fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', fontStyle: 'bold' },
      1: { halign: 'center' },
      2: { halign: 'center', fontStyle: 'bold' },
    },
  });

  // Identificación del consumidor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastY: number = (doc as any).lastAutoTable?.finalY ?? 40;

  function bloqueTitulo(t: string, y: number): number {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(241, 245, 249);
    doc.rect(M, y, pageW - M * 2, 6, 'F');
    doc.text(t, M + 2, y + 4.2);
    return y + 6;
  }

  let y = lastY + 6;
  y = bloqueTitulo('1. IDENTIFICACIÓN DEL CONSUMIDOR', y);

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ['Nombre', r.cliente_nombre, 'Documento', `${r.cliente_documento_tipo} ${r.cliente_documento_numero}`],
      ['Teléfono', r.cliente_telefono ?? '—', 'Correo', r.cliente_email ?? '—'],
      [
        'Dirección',
        r.cliente_direccion ?? '—',
        'Ubigeo',
        r.cliente_ubigeo ?? '—',
      ],
      [
        'Menor de edad',
        r.es_menor_edad ? 'Sí' : 'No',
        'Apoderado',
        r.apoderado_nombre
          ? `${r.apoderado_nombre}${r.apoderado_documento ? ` (${r.apoderado_documento})` : ''}`
          : '—',
      ],
    ],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
      3: { cellWidth: 'auto' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? y + 30;
  y = lastY + 6;
  y = bloqueTitulo('2. IDENTIFICACIÓN DEL BIEN CONTRATADO', y);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      [
        'Tipo',
        r.tipo_bien ?? '—',
        'Monto reclamado',
        r.monto_reclamado != null
          ? `S/ ${r.monto_reclamado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '—',
      ],
      [
        'Vinculación',
        [
          r.venta_numero && `Venta ${r.venta_numero}`,
          r.pedido_web_numero && `Pedido web ${r.pedido_web_numero}`,
          r.comprobante_numero && `Comprobante ${r.comprobante_numero}`,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
        '',
        '',
      ],
    ],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
      3: { cellWidth: 'auto' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  y = lastY + 6;
  y = bloqueTitulo(`3. DETALLE — ${r.tipo}`, y);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    body: [['Descripción', r.descripcion]],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  y = lastY + 4;
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 2 },
    body: [['Pedido del consumidor', r.pedido_consumidor ?? '—']],
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
  });

  // Respuesta del proveedor (solo si ya respondieron)
  if (r.respuesta) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lastY = (doc as any).lastAutoTable?.finalY ?? y + 20;
    y = lastY + 6;
    y = bloqueTitulo('4. RESPUESTA DEL PROVEEDOR', y);
    const fechaResp = r.fecha_respuesta
      ? new Date(r.fecha_respuesta).toLocaleString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '—';
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2 },
      body: [
        ['Respuesta', r.respuesta],
        ['Fecha respuesta', fechaResp],
        ['Estado', r.estado.replace('_', ' ')],
      ],
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold', fillColor: [248, 250, 252] },
        1: { cellWidth: 'auto' },
      },
    });
  }

  // Pie + firmas
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? y + 20;
  const yFirma = Math.min(lastY + 25, 270);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.line(M + 5, yFirma, M + 70, yFirma);
  doc.line(pageW - M - 70, yFirma, pageW - M - 5, yFirma);
  doc.text('Firma del consumidor', M + 5, yFirma + 4);
  doc.text('Firma del proveedor', pageW - M - 70, yFirma + 4);

  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(
    'El proveedor debe dar respuesta al reclamo en un plazo máximo de 30 días calendario, conforme al Art. 24° de la Ley 29571.',
    M,
    287,
  );

  doc.save(`reclamo-${r.numero}.pdf`);
}
