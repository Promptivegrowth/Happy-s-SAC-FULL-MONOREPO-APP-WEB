import type { PedidoB2BDetalle, PedidoB2BLineaDetalle } from '@/server/actions/b2b';

/**
 * Genera la PDF de la proforma B2B (1-2 páginas A4). Imports dinámicos para
 * mantener jspdf fuera del bundle principal.
 *
 * Convención visual:
 *  - Cabecera con número de proforma + datos del cliente
 *  - Tabla de líneas: SKU, descripción, cantidad, precio unit, descuento, sub_total
 *  - Totales: subtotal, descuento global, IGV 18%, total
 *  - Condiciones: validez 15 días, condición de pago
 *  - Footer con observación
 */
export async function generarProformaPdf(
  pedido: PedidoB2BDetalle,
  lineas: PedidoB2BLineaDetalle[],
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
  const M = 14;

  const fecha = new Date(pedido.fecha).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const fechaEntrega = pedido.fecha_entrega_estimada
    ? new Date(pedido.fecha_entrega_estimada).toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';
  const fechaValidez = new Date();
  fechaValidez.setDate(fechaValidez.getDate() + 15);
  const validezTxt = fechaValidez.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Cabecera
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PROFORMA', M, 20);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110);
  doc.text(`N° ${pedido.numero}`, M, 26);
  doc.text(`Fecha: ${fecha}`, pageW - M, 20, { align: 'right' });
  doc.text(`Validez: ${validezTxt}`, pageW - M, 26, { align: 'right' });
  doc.setTextColor(0);

  // Cliente
  autoTable(doc, {
    startY: 32,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    head: [['CLIENTE', '']],
    body: [
      ['Razón social', pedido.cliente_razon_social],
      ['Documento', pedido.cliente_documento ?? '—'],
      ['Email', pedido.cliente_email ?? '—'],
      ['Teléfono', pedido.cliente_telefono ?? '—'],
      ['Dirección', pedido.cliente_direccion ?? '—'],
    ],
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      halign: 'left',
      fontStyle: 'bold',
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 32, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 'auto' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastY: number = (doc as any).lastAutoTable?.finalY ?? 70;

  // Términos
  autoTable(doc, {
    startY: lastY + 4,
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      [
        'Lista de precio',
        pedido.lista_precio ?? '—',
        'Condición de pago',
        pedido.condicion_pago ?? '—',
      ],
      ['Fecha entrega', fechaEntrega, 'Moneda', 'PEN (S/)'],
    ],
    columnStyles: {
      0: { cellWidth: 32, fontStyle: 'bold', fillColor: [248, 250, 252] },
      1: { cellWidth: 50 },
      2: { cellWidth: 32, fontStyle: 'bold', fillColor: [248, 250, 252] },
      3: { cellWidth: 'auto' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? lastY + 14;

  // Líneas
  const filas = lineas.map((l, idx) => [
    String(idx + 1),
    l.sku,
    `${l.producto_nombre}${l.talla ? ` · T${l.talla.replace('T', '')}` : ''}${
      l.color ? ` · ${l.color}` : ''
    }`,
    String(l.cantidad_pedida),
    `S/ ${l.precio_unitario.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
    l.descuento > 0 ? `${l.descuento.toFixed(2)} %` : '—',
    `S/ ${l.sub_total.toLocaleString('es-PE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  ]);

  autoTable(doc, {
    startY: lastY + 4,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    head: [['#', 'SKU', 'Descripción', 'Cant.', 'P. Unit', 'Desc.', 'Sub-total']],
    body: filas,
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      halign: 'center',
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'left', cellWidth: 24, fontStyle: 'bold' },
      2: { halign: 'left' },
      3: { halign: 'right', cellWidth: 14 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? lastY + 30;

  // Totales
  const descMonto = Math.round((pedido.sub_total * pedido.descuento_porcentaje) / 100 * 100) / 100;

  autoTable(doc, {
    startY: lastY + 2,
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 1 },
    body: [
      [
        '',
        'Subtotal',
        `S/ ${pedido.sub_total.toLocaleString('es-PE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
      [
        '',
        `Descuento global (${pedido.descuento_porcentaje.toFixed(2)} %)`,
        `S/ ${descMonto.toLocaleString('es-PE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
      [
        '',
        'IGV 18 %',
        `S/ ${pedido.igv.toLocaleString('es-PE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
      [
        '',
        'TOTAL',
        `S/ ${pedido.total.toLocaleString('es-PE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ],
    ],
    columnStyles: {
      0: { cellWidth: 100 },
      1: { halign: 'right', cellWidth: 50, fontStyle: 'bold' },
      2: { halign: 'right', cellWidth: 32, fontStyle: 'bold' },
    },
    didParseCell: (data: {
      row: { index: number };
      column: { index: number };
      cell: {
        styles: {
          fontSize?: number;
          fillColor?: number[];
          textColor?: number;
          fontStyle?: string;
        };
      };
    }) => {
      if (data.row.index === 3) {
        data.cell.styles.fontSize = 11;
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastY = (doc as any).lastAutoTable?.finalY ?? lastY + 30;

  if (pedido.observacion) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones:', M, lastY + 8);
    doc.setFont('helvetica', 'normal');
    const split = doc.splitTextToSize(pedido.observacion, pageW - M * 2);
    doc.text(split, M, lastY + 13);
  }

  // Firma
  const yFirma = Math.min(lastY + 40, 265);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.line(pageW - M - 70, yFirma, pageW - M - 5, yFirma);
  doc.text('Firma autorizada', pageW - M - 70, yFirma + 4);

  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(
    'Proforma válida por 15 días. Precios incluyen IGV salvo indicación contraria. Pago según condición acordada.',
    M,
    287,
  );

  doc.save(`proforma-${pedido.numero}.pdf`);
}
