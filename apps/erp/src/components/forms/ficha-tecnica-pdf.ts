'use client';

/**
 * Generador PDF de FICHA TÉCNICA — estilo CITECCAL brandeado HAPPY SAC.
 *
 * Estructura (paginación dinámica según contenido):
 *  1. Hoja resumen producción (datos básicos + imágenes delantero/posterior + materiales)
 *  2. Hoja de corte (tabla piezas; si hay imagen diagrama, página separada)
 *  3. Hoja de secuencia de operaciones
 *  4. Hoja de confección (notas + puntadas)
 *  5. Cuadro de medidas
 *  6. Diagrama de medidas (imagen tipo MEDIDAS_DIAGRAMA)
 *  7. Cuadro de avíos
 *  8. Hoja de acabados / empaque
 *  9. Imágenes adicionales (CONFECCION_DETALLE, CALLOUT, ETIQUETA, etc.)
 *
 * Cabecera repetida en cada hoja con logo + datos empresa + nombre producto + revisión.
 */

import { cargarDatosParaPDFFicha } from '@/server/actions/fichas-tecnicas';
import type { FichaImagen, TipoImagenFicha } from '@/server/actions/fichas-tecnicas-helpers';

const NARANJA: [number, number, number] = [255, 77, 13];
const AZUL: [number, number, number] = [30, 58, 95];
const GRIS: [number, number, number] = [100, 116, 139];
const TEXTO: [number, number, number] = [15, 23, 42];

export async function generarFichaTecnicaPDF(fichaId: string, productoId: string): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable = (autoTableMod.default ?? autoTableMod) as any;

  const data = await cargarDatosParaPDFFicha(fichaId, productoId);
  if (!data.ficha) throw new Error('Ficha no encontrada');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  const headerH = 24;
  // Margen útil inferior antes de obligar salto de página
  const PIE_RESERVA = 14;

  let totalPages = 0;
  const productoNombre = (data.producto?.nombre ?? '').toUpperCase();
  const productoCodigo = data.producto?.codigo ?? '';
  const revision = data.ficha.revision;
  const fechaTxt = data.ficha.fecha_aprobacion
    ? new Date(data.ficha.fecha_aprobacion).toLocaleDateString('es-PE')
    : new Date().toLocaleDateString('es-PE');

  function drawHeader() {
    // Logo izquierda (28×14 mm)
    if (data.logo_dataurl) {
      try { doc.addImage(data.logo_dataurl, 'PNG', M, M, 28, 14); } catch { /* ignore */ }
    }

    // Datos empresa (centro)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NARANJA);
    const emp = data.empresa;
    const empName = emp?.nombre_comercial || emp?.razon_social || 'HAPPY SAC';
    doc.text(empName, M + 32, M + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    let yy = M + 8;
    if (emp?.ruc) { doc.text(`RUC ${emp.ruc}`, M + 32, yy); yy += 3; }
    if (emp?.direccion_fiscal) { doc.text(emp.direccion_fiscal, M + 32, yy); yy += 3; }
    if (emp?.telefono || emp?.email) {
      doc.text([emp?.telefono, emp?.email].filter(Boolean).join(' · '), M + 32, yy);
    }

    // Recuadro ficha técnica (derecha)
    const boxW = 70;
    const boxX = pageW - M - boxW;
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.4);
    doc.rect(boxX, M, boxW, 18);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AZUL);
    doc.text('FICHA TÉCNICA', boxX + boxW / 2, M + 4, { align: 'center' });
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXTO);
    doc.text(`Rev. ${revision}`, boxX + 3, M + 10);
    doc.text(`Fecha: ${fechaTxt}`, boxX + 3, M + 14);
    if (productoCodigo) doc.text(`Cód: ${productoCodigo}`, boxX + boxW - 3, M + 14, { align: 'right' });

    // Línea divisoria
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.3);
    doc.line(M, M + headerH - 2, pageW - M, M + headerH - 2);
  }

  function drawFooter() {
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(`${productoNombre} · Ficha Rev. ${revision}`, M, pageH - 6);
    const pageNum = doc.getNumberOfPages();
    doc.text(`Página ${pageNum}${totalPages ? ` / ${totalPages}` : ''}`, pageW - M, pageH - 6, { align: 'right' });
  }

  function newPage(): number {
    doc.addPage();
    drawHeader();
    return M + headerH + 2;
  }

  /** Asegura `mm` de espacio vertical desde y. Si no entra, salta de página. */
  function ensureSpace(yActual: number, mm: number): number {
    if (yActual + mm > pageH - PIE_RESERVA) {
      return newPage();
    }
    return yActual;
  }

  function sectionTitle(t: string, y: number): number {
    doc.setFillColor(...AZUL);
    doc.rect(M, y, pageW - M * 2, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(t, M + 3, y + 5);
    return y + 9;
  }

  drawHeader();
  let y = M + headerH + 2;

  // ============================================================================
  // PÁGINA 1: RESUMEN
  // ============================================================================
  y = sectionTitle(productoNombre || 'PRODUCTO', y);

  const f = data.ficha;
  const resumenRows: [string, string][] = [
    ['Temporada', f.temporada ?? '—'],
    ['Cliente / Ref.', f.cliente_referencia ?? '—'],
    ['Alcance / Uso', f.alcance_uso ?? '—'],
    ['Descripción', f.descripcion_larga ?? '—'],
    ['Observaciones', f.observaciones ?? '—'],
  ];
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 32, fontStyle: 'bold', fillColor: [241, 245, 249] }, 1: { cellWidth: 'auto' } },
    body: resumenRows,
    margin: { left: M, right: M },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4;

  // Materiales (composición)
  y = sectionTitle('MATERIALES — COMPOSICIÓN TEXTIL', y);
  const matsRows: string[][] = [];
  if (f.tela_principal_nombre || f.tela_principal_composicion) {
    matsRows.push([
      'PRINCIPAL',
      f.tela_principal_nombre ?? '—',
      f.tela_principal_composicion ?? '—',
      f.tela_principal_color ?? '—',
      f.tela_principal_ancho ?? '—',
    ]);
  }
  if (f.tela_secundaria_nombre || f.tela_secundaria_composicion) {
    matsRows.push([
      'SECUNDARIA',
      f.tela_secundaria_nombre ?? '—',
      f.tela_secundaria_composicion ?? '—',
      f.tela_secundaria_color ?? '—',
      f.tela_secundaria_ancho ?? '—',
    ]);
  }
  if (matsRows.length === 0) matsRows.push(['—', '—', '—', '—', '—']);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    head: [['Tipo', 'Tejido', 'Composición', 'Color', 'Ancho']],
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
    body: matsRows,
    margin: { left: M, right: M },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 4;

  // Imágenes delantero/posterior si existen
  const delantero = data.imagenes.find((i) => i.tipo === 'DELANTERO');
  const posterior = data.imagenes.find((i) => i.tipo === 'POSTERIOR');
  if (delantero || posterior) {
    y = ensureSpace(y + 3, 80);
    y = sectionTitle('IMÁGENES REFERENCIALES', y);
    const imgW = (pageW - M * 2 - 4) / 2;
    const imgH = 70;
    try { if (delantero) await drawImageFromUrl(doc, delantero.url, M, y, imgW, imgH); } catch { /* ignore */ }
    try { if (posterior) await drawImageFromUrl(doc, posterior.url, M + imgW + 4, y, imgW, imgH); } catch { /* ignore */ }
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text('Vista delantera', M + imgW / 2, y + imgH + 3, { align: 'center' });
    doc.text('Vista posterior', M + imgW + 4 + imgW / 2, y + imgH + 3, { align: 'center' });
    y += imgH + 8;
  }

  // ============================================================================
  // HOJA DE CORTE — sigue en la misma página si entra
  // ============================================================================
  if (data.piezas.length > 0) {
    // Necesita ≈ 10mm cabecera + (filas×6) min 30mm
    y = ensureSpace(y + 3, 30);
    y = sectionTitle('HOJA DE CORTE', y);
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      head: [['Tipo tela', 'Descripción pieza', 'Cant.', 'Posición', 'Orientación', 'Observación']],
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
      body: data.piezas.map((p) => [
        p.tipo_tela, p.descripcion, String(p.cantidad),
        p.posicion ?? '—', p.orientacion ?? '—', p.observaciones ?? '—',
      ]),
      margin: { left: M, right: M },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;

    // Diagrama de corte si existe
    const corteDiagrama = data.imagenes.find((i) => i.tipo === 'CORTE_DIAGRAMA');
    if (corteDiagrama) {
      y = ensureSpace(y, 84);
      try { await drawImageFromUrl(doc, corteDiagrama.url, M, y, pageW - M * 2, 80); } catch { /* ignore */ }
      y += 84;
    }
  }

  // ============================================================================
  // SECUENCIA DE OPERACIONES
  // ============================================================================
  if (data.procesos.length > 0) {
    y = ensureSpace(y + 3, 30);
    y = sectionTitle('SECUENCIA DE OPERACIONES', y);
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      head: [['#', 'Proceso', 'Área', 'Máquina', 'Descripción operativa', 'Min']],
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        2: { cellWidth: 24 },
        3: { cellWidth: 24 },
        5: { cellWidth: 12, halign: 'right' },
      },
      body: data.procesos.map((p) => [
        String(p.orden),
        p.proceso,
        p.area ?? '—',
        p.maquina ?? '—',
        p.descripcion_operativa ?? '—',
        p.tiempo_estandar_min.toLocaleString('es-PE', { maximumFractionDigits: 2 }),
      ]),
      margin: { left: M, right: M },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ============================================================================
  // HOJA DE CONFECCIÓN (puntadas + notas)
  // ============================================================================
  if (f.puntadas_remalle || f.puntadas_recta || f.notas_confeccion) {
    y = ensureSpace(y + 3, 30);
    y = sectionTitle('HOJA DE CONFECCIÓN', y);
    const cnf: [string, string][] = [];
    if (f.puntadas_remalle) cnf.push(['Puntadas por pulgada — remalle', f.puntadas_remalle]);
    if (f.puntadas_recta) cnf.push(['Puntadas por pulgada — recta', f.puntadas_recta]);
    if (cnf.length > 0) {
      autoTable(doc, {
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1.5 },
        columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold', fillColor: [241, 245, 249] } },
        body: cnf,
        margin: { left: M, right: M },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 4;
    }
    if (f.notas_confeccion) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...TEXTO);
      const notas = doc.splitTextToSize(f.notas_confeccion, pageW - M * 2);
      doc.text(notas, M, y);
      y += notas.length * 3.5 + 4;
    }
  }

  // ============================================================================
  // CUADRO DE MEDIDAS
  // ============================================================================
  if (data.medidas.length > 0) {
    y = ensureSpace(y + 3, 40);
    y = sectionTitle('CUADRO DE MEDIDAS (cm)', y);

    // Detectar tallas únicas ordenadas (preserva orden de aparición)
    const tallasSet = new Set<string>();
    for (const m of data.medidas) for (const v of m.valores) tallasSet.add(v.talla);
    const tallas = Array.from(tallasSet);

    const head = ['#', 'Descripción', ...tallas, 'Tol ±'];
    const body = data.medidas.map((m) => {
      const cellsValores = tallas.map((t) => {
        const found = m.valores.find((v) => v.talla === t);
        return found?.valor !== null && found?.valor !== undefined ? String(found.valor) : '—';
      });
      return [m.codigo, m.descripcion, ...cellsValores, String(m.tolerancia_cm)];
    });
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1 },
      head: [head],
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 10, halign: 'center', fontStyle: 'bold' } },
      body,
      margin: { left: M, right: M },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;

    // Diagrama de medidas si existe
    const diagMedidas = data.imagenes.find((i) => i.tipo === 'MEDIDAS_DIAGRAMA');
    if (diagMedidas) {
      y = ensureSpace(y, 84);
      try { await drawImageFromUrl(doc, diagMedidas.url, M, y, pageW - M * 2, 80); } catch { /* ignore */ }
      y += 84;
    }
  }

  // ============================================================================
  // CUADRO DE AVÍOS
  // ============================================================================
  if (data.avios.length > 0) {
    y = ensureSpace(y + 3, 30);
    y = sectionTitle('CUADRO DE AVÍOS', y);
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      head: [['Código', 'Material', 'Categoría', 'Color', 'Cantidad', 'Unidad']],
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
      body: data.avios.map((a) => [
        a.codigo, a.nombre, a.categoria, a.color ?? '—',
        a.cantidad_total.toLocaleString('es-PE', { maximumFractionDigits: 3 }),
        a.unidad || '—',
      ]),
      margin: { left: M, right: M },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;
  }

  // ============================================================================
  // ACABADOS / EMPAQUE
  // ============================================================================
  const tieneAcabados = !!(f.notas_acabados || f.envase_primario || f.envase_secundario || f.rotulado_primario);
  if (tieneAcabados) {
    y = ensureSpace(y + 3, 30);
    y = sectionTitle('FICHA DE ACABADOS Y EMPAQUE', y);
    const filas: [string, string][] = [];
    if (f.notas_acabados) filas.push(['Notas acabados', f.notas_acabados]);
    if (f.envase_primario) filas.push(['Envase primario', f.envase_primario]);
    if (f.envase_secundario) filas.push(['Envase secundario', f.envase_secundario]);
    if (f.cinta_embalaje) filas.push(['Cinta embalaje', f.cinta_embalaje]);
    if (f.sticker_talla) filas.push(['Sticker talla', f.sticker_talla]);
    if (f.rotulado_primario) filas.push(['Rotulado primario', f.rotulado_primario]);
    if (f.rotulado_secundario) filas.push(['Rotulado secundario', f.rotulado_secundario]);
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold', fillColor: [241, 245, 249] } },
      body: filas,
      margin: { left: M, right: M },
    });

    // Imagen acabados/doblado si existe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 4;
    const doblado = data.imagenes.find((i) => i.tipo === 'ACABADOS_DOBLADO');
    if (doblado) {
      y = ensureSpace(y, 84);
      try { await drawImageFromUrl(doc, doblado.url, M, y, pageW - M * 2, 80); } catch { /* ignore */ }
      y += 84;
    }
  }

  // ============================================================================
  // IMÁGENES ADICIONALES (callouts, detalles, etiquetas)
  // ============================================================================
  const yaUsadas: TipoImagenFicha[] = ['DELANTERO', 'POSTERIOR', 'CORTE_DIAGRAMA', 'MEDIDAS_DIAGRAMA', 'ACABADOS_DOBLADO'];
  const restantes = data.imagenes.filter((i) => !yaUsadas.includes(i.tipo));
  if (restantes.length > 0) {
    y = ensureSpace(y + 3, 80);
    y = sectionTitle('IMÁGENES DE DETALLE', y);
    const imgW = (pageW - M * 2 - 6) / 2;
    const imgH = 60;
    let col = 0;
    for (const img of restantes) {
      if (y + imgH + 10 > pageH - PIE_RESERVA) {
        y = newPage();
        y = sectionTitle('IMÁGENES DE DETALLE (cont.)', y);
        col = 0;
      }
      const x = M + col * (imgW + 6);
      try { await drawImageFromUrl(doc, img.url, x, y, imgW, imgH); } catch { /* ignore */ }
      doc.setFontSize(6);
      doc.setTextColor(...AZUL);
      doc.text(img.tipo.replace(/_/g, ' '), x + 2, y + imgH + 3);
      doc.setTextColor(...GRIS);
      if (img.leyenda) {
        const ley = doc.splitTextToSize(img.leyenda, imgW - 4);
        doc.text(ley, x + 2, y + imgH + 6);
      }
      col++;
      if (col === 2) {
        col = 0;
        y += imgH + 14;
      }
    }
  }

  // Pie en la última página + totalPages
  drawFooter();
  totalPages = doc.getNumberOfPages();
  // Re-pintar el footer de cada página con el total
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // Tapamos el footer viejo con un rectángulo blanco y lo redibujamos
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text(`${productoNombre} · Ficha Rev. ${revision}`, M, pageH - 6);
    doc.text(`Página ${p} / ${totalPages}`, pageW - M, pageH - 6, { align: 'right' });
  }

  const filename = `ficha-tecnica_${productoCodigo || productoId.slice(0, 8)}_rev${revision}.pdf`;
  doc.save(filename);
}

// ────────────────────────────────────────────────────────────────────────────
// drawImageFromUrl — fetch + base64 + addImage
// ────────────────────────────────────────────────────────────────────────────
async function drawImageFromUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any,
  url: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): Promise<void> {
  const resp = await fetch(url, { cache: 'no-cache' });
  if (!resp.ok) return;
  const blob = await resp.blob();
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(blob);
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL('image/png');

  // Fit-contain dentro de maxW × maxH
  const ratio = img.naturalWidth / img.naturalHeight;
  let w = maxW, h = maxW / ratio;
  if (h > maxH) { h = maxH; w = maxH * ratio; }
  const cx = x + (maxW - w) / 2;
  const cy = y + (maxH - h) / 2;

  // Marco gris claro para que se vea contenido
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.rect(x, y, maxW, maxH);

  doc.addImage(dataUrl, 'PNG', cx, cy, w, h);
}

// Suprimir warning del lint sobre FichaImagen siendo importado pero no usado directo
export type _FichaImagenRef = FichaImagen;

// ============================================================================
// PDF COMPACTO — 1 página A4 para imprimir y meter en la OT del taller
// ============================================================================
export async function generarFichaCompactaPDF(fichaId: string, productoId: string): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable = (autoTableMod.default ?? autoTableMod) as any;

  const data = await cargarDatosParaPDFFicha(fichaId, productoId);
  if (!data.ficha) throw new Error('Ficha no encontrada');

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 10;

  const productoNombre = (data.producto?.nombre ?? '').toUpperCase();
  const productoCodigo = data.producto?.codigo ?? '';
  const rev = data.ficha.revision;

  // Cabecera reducida (logo + título + revisión)
  if (data.logo_dataurl) {
    try { doc.addImage(data.logo_dataurl, 'PNG', M, M, 22, 11); } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NARANJA);
  doc.text(productoNombre || 'PRODUCTO', M + 26, M + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`Código ${productoCodigo}  ·  Ficha Rev. ${rev}  ·  ${data.empresa?.razon_social ?? 'HAPPY SAC'}`, M + 26, M + 11);

  // Línea separadora
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.4);
  doc.line(M, M + 14, pageW - M, M + 14);

  let y = M + 17;

  // Imagen delantero (compacta, izquierda) si existe
  const delantero = data.imagenes.find((i) => i.tipo === 'DELANTERO');
  const tieneImg = !!delantero;
  const colImg = tieneImg ? 55 : 0;
  if (delantero) {
    try { await drawImageFromUrl(doc, delantero.url, M, y, 50, 60); } catch { /* ignore */ }
  }

  // Resumen 2 columnas a la derecha
  const xData = M + colImg + (tieneImg ? 5 : 0);
  const widthData = pageW - xData - M;
  const resumenRows: [string, string][] = [
    ['Temporada', data.ficha.temporada ?? '—'],
    ['Tela principal', data.ficha.tela_principal_nombre ?? '—'],
    ['Color', data.ficha.tela_principal_color ?? '—'],
    ['Composición', data.ficha.tela_principal_composicion ?? '—'],
  ];
  if (data.ficha.tela_secundaria_nombre) {
    resumenRows.push(['Tela secundaria', `${data.ficha.tela_secundaria_nombre} ${data.ficha.tela_secundaria_color ? `(${data.ficha.tela_secundaria_color})` : ''}`]);
  }
  if (data.ficha.puntadas_remalle) resumenRows.push(['PPP remalle', data.ficha.puntadas_remalle]);
  if (data.ficha.puntadas_recta) resumenRows.push(['PPP recta', data.ficha.puntadas_recta]);

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 7.5, cellPadding: 0.8 },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: 'bold', textColor: AZUL },
      1: { cellWidth: widthData - 30 },
    },
    body: resumenRows,
    margin: { left: xData, right: M },
    tableWidth: widthData,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yResumen = (doc as any).lastAutoTable.finalY;

  // y avanza al máximo de las 2 columnas
  y = Math.max(y + 65, yResumen + 3);

  // Cuadro de medidas (compacto)
  if (data.medidas.length > 0) {
    const tallasSet = new Set<string>();
    for (const m of data.medidas) for (const v of m.valores) tallasSet.add(v.talla);
    const tallas = Array.from(tallasSet);

    doc.setFillColor(...AZUL);
    doc.rect(M, y, pageW - M * 2, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('MEDIDAS (cm)', M + 2, y + 3.5);
    y += 6;

    const body = data.medidas.map((m) => {
      const cells = tallas.map((t) => {
        const found = m.valores.find((v) => v.talla === t);
        return found?.valor !== null && found?.valor !== undefined ? String(found.valor) : '—';
      });
      return [m.codigo, m.descripcion, ...cells, `±${m.tolerancia_cm}`];
    });
    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 0.8 },
      head: [['#', 'Descripción', ...tallas, 'Tol']],
      headStyles: { fillColor: [241, 245, 249], textColor: TEXTO, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 7, halign: 'center' } },
      body,
      margin: { left: M, right: M },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 3;
  }

  // Procesos (compacto, lista numerada)
  if (data.procesos.length > 0 && y < pageH - 40) {
    doc.setFillColor(...AZUL);
    doc.rect(M, y, pageW - M * 2, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('SECUENCIA DE OPERACIONES', M + 2, y + 3.5);
    y += 6;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      styles: { fontSize: 6.5, cellPadding: 0.8 },
      head: [['#', 'Proceso', 'Máquina', 'Descripción', 'Min']],
      headStyles: { fillColor: [241, 245, 249], textColor: TEXTO, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 7, halign: 'center' },
        2: { cellWidth: 22 },
        4: { cellWidth: 10, halign: 'right' },
      },
      body: data.procesos.map((p) => [
        String(p.orden),
        p.proceso,
        p.maquina ?? '—',
        p.descripcion_operativa ?? '—',
        p.tiempo_estandar_min.toLocaleString('es-PE', { maximumFractionDigits: 2 }),
      ]),
      margin: { left: M, right: M },
    });
  }

  // Footer mini
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS);
  doc.text(
    `Generado ${new Date().toLocaleString('es-PE')} · Documento de uso interno`,
    pageW / 2,
    pageH - 5,
    { align: 'center' },
  );

  doc.save(`ficha-compacta_${productoCodigo || productoId.slice(0, 8)}_rev${rev}.pdf`);
}
