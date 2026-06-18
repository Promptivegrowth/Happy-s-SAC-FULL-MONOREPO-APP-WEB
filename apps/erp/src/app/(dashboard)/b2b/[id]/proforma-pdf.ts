import type { PedidoB2BDetalle, PedidoB2BLineaDetalle } from '@/server/actions/b2b';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';

/**
 * Genera la PDF de la proforma B2B (1-2 páginas A4). Imports dinámicos para
 * mantener jspdf fuera del bundle principal.
 *
 * Convención visual:
 *  - Cabecera brandeada: logo a la izquierda + razón social/datos + recuadro
 *    azul a la derecha con "PROFORMA" + número (estilo comprobante A4 del POS).
 *  - Tabla de líneas: SKU, descripción, cantidad, precio unit, descuento, sub_total
 *  - Totales: subtotal, descuento global, IGV 18%, total
 *  - Condiciones: validez 15 días, condición de pago
 *  - Footer con observación
 */
export async function generarProformaPdf(
  pedido: PedidoB2BDetalle,
  lineas: PedidoB2BLineaDetalle[],
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

  // ---------------------------------------------------------------------------
  // Cabecera brandeada: logo izquierda + datos empresa centro + recuadro PROFORMA derecha
  // ---------------------------------------------------------------------------
  // Layout en mm (jsPDF está en 'mm'):
  //   Logo:        14..42  (28 mm de ancho)
  //   Datos emp:   46..130 (centro/izq)
  //   Recuadro:    138..196 (~58 mm de ancho, derecha)
  // ---------------------------------------------------------------------------
  let yHeader = M;

  if (empresa?.logo_dataurl) {
    try {
      doc.addImage(
        empresa.logo_dataurl,
        empresa.logo_formato ?? 'PNG',
        M,
        yHeader,
        28,
        14,
      );
    } catch {
      /* si addImage falla por formato, seguimos sin logo */
    }
  }

  if (empresa) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 77, 13); // naranja corporativo
    const titulo = empresa.nombre_comercial || empresa.razon_social;
    doc.text(titulo, M + 32, yHeader + 4);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    let y = yHeader + 8;
    if (empresa.nombre_comercial && empresa.nombre_comercial !== empresa.razon_social) {
      doc.text(empresa.razon_social, M + 32, y);
      y += 3.5;
    }
    doc.text(`RUC ${empresa.ruc}`, M + 32, y);
    y += 3.5;
    if (empresa.direccion_fiscal) {
      const dirLines = doc.splitTextToSize(empresa.direccion_fiscal, 90);
      doc.text(dirLines, M + 32, y);
      y += (dirLines.length as number) * 3.5;
    }
    if (empresa.telefono || empresa.email) {
      doc.text(
        [empresa.telefono, empresa.email].filter(Boolean).join(' · '),
        M + 32,
        y,
      );
    }
    doc.setTextColor(0);
  }

  // Recuadro PROFORMA a la derecha (estilo POS A4)
  const boxW = 58;
  const boxH = 24;
  const boxX = pageW - M - boxW;
  const boxY = M;
  doc.setDrawColor(30, 58, 95); // azul corporativo
  doc.setLineWidth(0.6);
  doc.roundedRect(boxX, boxY, boxW, boxH, 1.5, 1.5);
  doc.setLineWidth(0.2);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 95);
  doc.text('PROFORMA', boxX + boxW / 2, boxY + 8, { align: 'center' });
  doc.setFontSize(12);
  doc.setTextColor(255, 77, 13);
  doc.text(pedido.numero, boxX + boxW / 2, boxY + 16, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80);
  doc.text(`Fecha: ${fecha}`, boxX + boxW / 2, boxY + 21, { align: 'center' });
  doc.setTextColor(0);

  // Tras la cabecera arrancamos el contenido más abajo (la cabecera ocupa ~28 mm)
  const yContenido = Math.max(yHeader + 28, boxY + boxH + 4);

  // Validez (chip arriba del cliente)
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(`Validez de la oferta: ${validezTxt}`, M, yContenido - 1);
  doc.setTextColor(0);

  // Cliente
  autoTable(doc, {
    startY: yContenido,
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
  let lastY: number = (doc as any).lastAutoTable?.finalY ?? yContenido + 30;

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

  // Totales (con espacio extra para que el bloque TOTAL no se monte con IGV)
  const descMonto = Math.round((pedido.sub_total * pedido.descuento_porcentaje) / 100 * 100) / 100;

  autoTable(doc, {
    startY: lastY + 2,
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 1.2 },
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
          textColor?: number | number[];
          fontStyle?: string;
          cellPadding?: number;
        };
      };
    }) => {
      if (data.row.index === 3) {
        // Fila TOTAL — más alta, naranja corporativo
        data.cell.styles.fontSize = 11;
        data.cell.styles.fillColor = [255, 237, 213]; // naranja claro
        data.cell.styles.textColor = [127, 30, 0];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.cellPadding = 2.2;
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
