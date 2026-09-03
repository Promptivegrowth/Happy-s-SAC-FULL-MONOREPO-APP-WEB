import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import type { ResultadoConteo } from '@/server/actions/stock-conteo-import';

/**
 * PDF de RESUMEN del conteo físico por Excel (A4, multipágina).
 *
 * Sirve para los dos desenlaces:
 *  - Conteo APLICADO: una tabla por almacén con antes → contado → diferencia.
 *  - Conteo RECHAZADO: el listado de errores (hoja, fila, ítem, motivo) para
 *    que el usuario corrija y vuelva a importar.
 *
 * Imports dinámicos para que jspdf no entre al bundle principal.
 */

const NARANJA: [number, number, number] = [255, 77, 13];
const AZUL: [number, number, number] = [30, 58, 95];
const GRIS: [number, number, number] = [100, 116, 139];
const ROJO: [number, number, number] = [190, 42, 42];
const VERDE: [number, number, number] = [16, 133, 88];

export async function generarConteoPdf(
  res: ResultadoConteo,
  empresa: EmpresaPDFData | null = null,
): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (autoTableMod.default ?? autoTableMod) as unknown as (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doc: any, options: any,
  ) => void;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 14;
  let y = M;

  // ---------------- Cabecera brandeada ----------------
  if (empresa?.logo_dataurl) {
    try { doc.addImage(empresa.logo_dataurl, empresa.logo_formato ?? 'PNG', M, y, 26, 15); } catch { /* logo opcional */ }
  }
  const xTexto = empresa?.logo_dataurl ? M + 30 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...AZUL);
  doc.text((empresa?.nombre_comercial || empresa?.razon_social || 'HAPPY SAC').toUpperCase(), xTexto, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
  const lineas = [
    empresa?.ruc ? `RUC ${empresa.ruc}` : '',
    empresa?.direccion_fiscal ?? '',
    [empresa?.telefono, empresa?.email].filter(Boolean).join(' · '),
  ].filter(Boolean);
  let yy = y + 9;
  for (const l of lineas) { doc.text(l, xTexto, yy); yy += 3.6; }
  y = Math.max(y + 18, yy + 2);

  doc.setDrawColor(...NARANJA); doc.setLineWidth(0.8);
  doc.line(M, y, pageW - M, y);
  y += 7;

  // ---------------- Título ----------------
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.setTextColor(...(res.aplicado ? NARANJA : ROJO));
  doc.text(res.aplicado ? 'RESUMEN DE CONTEO FISICO DE INVENTARIO' : 'CONTEO RECHAZADO — CORRIGE LOS ERRORES', M, y);
  y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS);
  doc.text(`Fecha: ${res.fecha}     Responsable: ${res.usuario}`, M, y);
  y += 6;

  // ---------------- Caja de totales ----------------
  const cajaH = 16;
  doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2);
  doc.roundedRect(M, y, pageW - M * 2, cajaH, 2, 2, 'FD');
  const cel = (label: string, valor: string, x: number, color: [number, number, number]) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRIS);
    doc.text(label.toUpperCase(), x, y + 5.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...color);
    doc.text(valor, x, y + 12);
  };
  const anchoCel = (pageW - M * 2) / 4;
  if (res.aplicado) {
    cel('Items actualizados', String(res.totalActualizados), M + 4, VERDE);
    cel('Sin cambio', String(res.totalSinCambio), M + 4 + anchoCel, AZUL);
    cel('Items contados', String(res.totalLeidos), M + 4 + anchoCel * 2, AZUL);
    cel('Almacenes', String(res.resumen.length), M + 4 + anchoCel * 3, AZUL);
  } else {
    cel('Errores encontrados', String(res.errores.length), M + 4, ROJO);
    cel('Items leidos', String(res.totalLeidos), M + 4 + anchoCel, AZUL);
    cel('Cambios aplicados', '0', M + 4 + anchoCel * 2, ROJO);
    cel('Estado', 'CANCELADO', M + 4 + anchoCel * 3, ROJO);
  }
  y += cajaH + 6;

  // ---------------- Advertencias ----------------
  if (res.advertencias.length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(180, 120, 0);
    doc.text('Advertencias:', M, y); y += 4.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
    for (const a of res.advertencias) {
      const wrapped = doc.splitTextToSize(`- ${a}`, pageW - M * 2) as string[];
      doc.text(wrapped, M, y); y += wrapped.length * 3.8 + 1;
    }
    y += 2;
  }

  // ---------------- Cuerpo ----------------
  if (!res.aplicado) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...ROJO);
    const nota = doc.splitTextToSize(
      'No se modifico ningun stock. Corrige los siguientes puntos en el Excel y vuelve a importarlo. La fila indicada corresponde al numero de fila de Excel.',
      pageW - M * 2,
    ) as string[];
    doc.text(nota, M, y); y += nota.length * 4 + 3;

    autoTable(doc, {
      startY: y,
      head: [['Hoja (almacen)', 'Fila', 'Item', 'Que corregir']],
      body: res.errores.map((e) => [e.hoja, String(e.fila), e.item, e.mensaje]),
      styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak', textColor: [30, 41, 59] },
      headStyles: { fillColor: ROJO, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [253, 246, 246] },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 12, halign: 'center' }, 2: { cellWidth: 52 }, 3: { cellWidth: 'auto' } },
      margin: { left: M, right: M },
    });
  } else {
    for (const alm of res.resumen) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevY = (doc as any).lastAutoTable?.finalY;
      let startY = prevY ? prevY + 9 : y;
      if (startY > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); startY = M; }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...AZUL);
      doc.text(`${alm.codigo} · ${alm.almacen}`, M, startY);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
      doc.text(
        `${alm.esMateriaPrima ? 'Materiales' : 'Productos terminados'} · ${alm.items.length} actualizados (${alm.entradas} entradas, ${alm.salidas} salidas) · ${alm.sinCambio} sin cambio`,
        M, startY + 4.5,
      );

      if (alm.items.length === 0) {
        doc.setFontSize(8); doc.setTextColor(...GRIS);
        doc.text('Sin diferencias: el conteo coincidio con el sistema.', M, startY + 10);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (doc as any).lastAutoTable = { finalY: startY + 12 };
        continue;
      }

      autoTable(doc, {
        startY: startY + 7,
        head: [['Codigo', alm.esMateriaPrima ? 'Material' : 'Producto', 'Talla', 'Antes', 'Contado', 'Dif.']],
        body: alm.items.map((i) => [
          i.codigo, i.nombre, i.talla || '-',
          String(i.antes), String(i.contado),
          `${i.delta > 0 ? '+' : ''}${i.delta}`,
        ]),
        styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak', textColor: [30, 41, 59] },
        headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 26 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 14, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 5) {
            const v = String(data.cell.raw ?? '');
            data.cell.styles.textColor = v.startsWith('+') ? VERDE : ROJO;
          }
        },
        margin: { left: M, right: M },
      });
    }
  }

  // ---------------- Pie de página ----------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = (doc as any).internal.getNumberOfPages() as number;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...GRIS);
    doc.text(
      `Conteo fisico de inventario · Generado por ${res.usuario} · ${res.fecha}`,
      M, doc.internal.pageSize.getHeight() - 8,
    );
    doc.text(`Pagina ${p} de ${total}`, pageW - M, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(res.aplicado ? `Resumen-Conteo-${stamp}.pdf` : `Errores-Conteo-${stamp}.pdf`);
}
