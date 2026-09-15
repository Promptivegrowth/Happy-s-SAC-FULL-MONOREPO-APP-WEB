import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';
import type { ResultadoConteo, ErrorConteo } from '@/server/actions/stock-conteo-import';

/**
 * PDF de RESUMEN del conteo físico por Excel (A4, multipágina).
 *
 * Sirve para los dos desenlaces:
 *  - Conteo APLICADO: una tabla por almacén con antes → contado → diferencia,
 *    y si alguna fila se saltó, la lista de esas filas con el paso a paso para
 *    corregirlas dentro del ERP (es el papel que el usuario se lleva al
 *    almacén para terminar el trabajo a mano).
 *  - Conteo RECHAZADO: el archivo no se pudo leer; el listado de problemas de
 *    estructura y cómo resolverlos.
 *
 * Imports dinámicos para que jspdf no entre al bundle principal.
 */

const NARANJA: [number, number, number] = [255, 77, 13];
const AZUL: [number, number, number] = [30, 58, 95];
const GRIS: [number, number, number] = [100, 116, 139];
const ROJO: [number, number, number] = [190, 42, 42];
const VERDE: [number, number, number] = [16, 133, 88];


/**
 * Tabla de filas con problema. La ultima columna es la mas importante: dice
 * que hacer en el ERP para arreglarlo, porque este PDF es el que el usuario se
 * lleva impreso para terminar el trabajo a mano.
 */
function tablaProblemas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  autoTable: (doc: any, options: any) => void,
  filas: ErrorConteo[],
  startY: number,
  pageW: number,
  M: number,
  color: [number, number, number],
): void {
  autoTable(doc, {
    startY,
    head: [['Hoja (almacen)', 'Fila', 'Item', 'Que paso', 'Como corregirlo en el ERP']],
    body: filas.map((e) => [e.hoja, String(e.fila), e.item, e.mensaje, e.solucion]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', textColor: [30, 41, 59] },
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [252, 250, 245] },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 40 },
      3: { cellWidth: 42 },
      4: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    margin: { left: M, right: M },
  });
  void pageW;
}

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
  doc.setTextColor(...(res.aplicado ? (res.omitidas.length > 0 ? [180, 120, 0] as [number, number, number] : NARANJA) : ROJO));
  doc.text(
    res.aplicado
      ? (res.omitidas.length > 0
          ? 'CONTEO APLICADO — HAY FILAS POR CORREGIR A MANO'
          : 'RESUMEN DE CONTEO FISICO DE INVENTARIO')
      : 'ARCHIVO RECHAZADO — NO SE PUDO LEER',
    M, y,
  );
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
    cel(
      res.omitidas.length > 0 ? 'Filas SIN aplicar' : 'Almacenes',
      String(res.omitidas.length > 0 ? res.omitidas.length : res.resumen.length),
      M + 4 + anchoCel * 3,
      res.omitidas.length > 0 ? ROJO : AZUL,
    );
  } else {
    cel('Problemas del archivo', String(res.errores.length), M + 4, ROJO);
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
      'No se modifico ningun stock. El problema no son los items sino la estructura del archivo, asi que no se pudo aplicar ni una parte. La fila indicada corresponde al numero de fila de Excel.',
      pageW - M * 2,
    ) as string[];
    doc.text(nota, M, y); y += nota.length * 4 + 3;
    tablaProblemas(doc, autoTable, res.errores, y, pageW, M, ROJO);
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

  // ------------- Filas que NO se aplicaron (van al final, para arrancar
  // la hoja y llevarsela al almacen) -------------
  if (res.aplicado && res.omitidas.length > 0) {
    doc.addPage();
    let yo = M;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ROJO);
    doc.text('FILAS QUE NO SE PUDIERON ACTUALIZAR', M, yo);
    yo += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GRIS);
    const nota = doc.splitTextToSize(
      `El resto del conteo SI se aplico. Estos ${res.omitidas.length} item(s) quedaron con el stock que ya tenian: corrigelos a mano siguiendo la ultima columna. La fila indicada es el numero de fila del Excel.`,
      pageW - M * 2,
    ) as string[];
    doc.text(nota, M, yo);
    yo += nota.length * 4 + 3;
    tablaProblemas(doc, autoTable, res.omitidas, yo, pageW, M, ROJO);
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
  doc.save(
    res.aplicado
      ? (res.omitidas.length > 0 ? `Conteo-${stamp}-PENDIENTES.pdf` : `Resumen-Conteo-${stamp}.pdf`)
      : `Archivo-Rechazado-${stamp}.pdf`,
  );
}
