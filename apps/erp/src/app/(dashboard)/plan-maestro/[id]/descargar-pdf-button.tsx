'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatTallaChip, ordenTalla } from '@happy/lib';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';

type Material = {
  material_codigo: string;
  material_nombre: string;
  categoria: string;
  unidad: string;
  cantidad_total: number;
};

type LineaProductoTalla = {
  producto_codigo: string;
  producto_nombre: string;
  talla: string;
  cantidad: number;
  prioridad: number | null;
};

type Props = {
  planCodigo: string;
  semana: number | null;
  anio: number | null;
  estado: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  totalLineas: number;
  totalUnidades: number;
  materiales: Material[];
  lineasProductos: LineaProductoTalla[];
  empresa: EmpresaPDFData | null;
};

const AZUL: [number, number, number] = [30, 58, 95];
const NARANJA: [number, number, number] = [255, 77, 13];
const GRIS: [number, number, number] = [100, 116, 139];

function fmtFecha(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Descarga el PLAN DE PRODUCCIÓN en PDF: cabecera brandeada + líneas del plan +
 * explosión de materiales + pivot productos × tallas.
 * Usa jspdf + jspdf-autotable cargados dinámicamente para no inflar el bundle.
 */
export function DescargarPdfButton({
  planCodigo, semana, anio, estado, fechaInicio, fechaFin,
  totalLineas, totalUnidades, materiales, lineasProductos, empresa,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function descargar() {
    if (totalLineas === 0) {
      toast.error('El plan no tiene líneas para exportar');
      return;
    }
    setLoading(true);
    try {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc: any = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const M = 12;
      let y = M;

      // ─── Cabecera brandeada ───────────────────────────────────────────────
      if (empresa?.logo_dataurl && empresa?.logo_formato) {
        try { doc.addImage(empresa.logo_dataurl, empresa.logo_formato, M, y, 24, 18); } catch { /* opcional */ }
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(...AZUL);
      doc.text((empresa?.nombre_comercial || empresa?.razon_social || "DISFRACES HAPPY'S").toUpperCase(), M + 28, y + 6);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(...NARANJA);
      doc.text('Fabricamos felicidad', M + 28, y + 10.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GRIS);
      if (empresa?.ruc) doc.text(`RUC: ${empresa.ruc}`, M + 28, y + 14.5);

      const recW = 72;
      const recX = pageW - M - recW;
      doc.setFillColor(...AZUL);
      doc.rect(recX, y, recW, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('PLAN DE PRODUCCIÓN', recX + recW / 2, y + 6, { align: 'center' });
      doc.setFontSize(11);
      doc.text(planCodigo, recX + recW / 2, y + 11.5, { align: 'center' });

      y += 22;

      // ─── Bloque de datos del plan ─────────────────────────────────────────
      const boxW = pageW - M * 2;
      const blockH = 16;
      doc.setDrawColor(...GRIS);
      doc.setLineWidth(0.3);
      doc.rect(M, y, boxW, blockH, 'S');
      const labelValor = (label: string, valor: string, x: number, yy: number) => {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...AZUL); doc.setFontSize(8);
        doc.text(label, x, yy);
        const lw = doc.getTextWidth(label) + 1.5;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
        doc.text(valor, x + lw, yy);
      };
      labelValor('Semana:', `${semana ?? '-'} / ${anio ?? '-'}`, M + 2, y + 6);
      labelValor('Estado:', (estado ?? '').replace('_', ' '), M + boxW * 0.35, y + 6);
      labelValor('Total unidades:', String(totalUnidades), M + boxW * 0.68, y + 6);
      labelValor('Vigencia:', `${fmtFecha(fechaInicio)} a ${fmtFecha(fechaFin)}`, M + 2, y + 12);
      labelValor('Líneas:', String(totalLineas), M + boxW * 0.68, y + 12);

      y += blockH + 5;

      // ─── Tabla: Líneas del plan ───────────────────────────────────────────
      doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('LÍNEAS DEL PLAN', M, y);
      y += 2;
      const lineasOrden = [...lineasProductos].sort(
        (a, b) => a.producto_nombre.localeCompare(b.producto_nombre, 'es') || ordenTalla(a.talla) - ordenTalla(b.talla),
      );
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        head: [['Código', 'Producto', 'Talla', 'Cantidad', 'Prioridad']],
        body: lineasOrden.map((l) => [
          l.producto_codigo || '—',
          l.producto_nombre,
          formatTallaChip(l.talla),
          String(l.cantidad),
          l.prioridad != null ? String(l.prioridad) : '—',
        ]),
        foot: [[{ content: 'TOTAL', colSpan: 3, styles: { halign: 'right' } }, String(totalUnidades), '']],
        headStyles: { fillColor: AZUL, textColor: 255, fontSize: 8, halign: 'center' },
        footStyles: { fillColor: [241, 245, 249], textColor: [...AZUL], fontStyle: 'bold' },
        bodyStyles: { fontSize: 8, cellPadding: 1.4 },
        columnStyles: {
          0: { cellWidth: 26 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 26, halign: 'right' },
          4: { cellWidth: 26, halign: 'center' },
        },
        theme: 'striped',
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      y = doc.lastAutoTable.finalY + 8;

      // ─── Tabla: Explosión de materiales ───────────────────────────────────
      if (materiales.length > 0) {
        if (y > pageH - 40) { doc.addPage(); y = M; }
        doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('EXPLOSIÓN DE MATERIALES', M, y);
        y += 2;
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          head: [['Código', 'Material', 'Categoría', 'Unidad', 'Cantidad total']],
          body: materiales.map((m) => [
            m.material_codigo, m.material_nombre, m.categoria, m.unidad,
            Number(m.cantidad_total).toFixed(4),
          ]),
          styles: { fontSize: 8, cellPadding: 1.4 },
          headStyles: { fillColor: GRIS, textColor: 255, halign: 'center' },
          columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
        y = doc.lastAutoTable.finalY + 8;

        // ─── Pivot productos × tallas ───────────────────────────────────────
        if (y > pageH - 40) { doc.addPage(); y = M; }
        doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('PRODUCTOS Y TALLAS DEL PLAN', M, y);
        y += 2;
        const ordenTallas = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD','TU'];
        const tallasPresentes = ordenTallas.filter((t) => lineasProductos.some((l) => l.talla === t));
        type ProdAgg = { nombre: string; porTalla: Map<string, number>; total: number };
        const productosMap = new Map<string, ProdAgg>();
        for (const l of lineasProductos) {
          const key = `${l.producto_codigo}|${l.producto_nombre}`;
          if (!productosMap.has(key)) productosMap.set(key, { nombre: l.producto_nombre, porTalla: new Map(), total: 0 });
          const pa = productosMap.get(key)!;
          pa.porTalla.set(l.talla, (pa.porTalla.get(l.talla) ?? 0) + l.cantidad);
          pa.total += l.cantidad;
        }
        const productosOrdenados = [...productosMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
        const body = productosOrdenados.map((p) => [
          p.nombre,
          ...tallasPresentes.map((t) => { const v = p.porTalla.get(t); return v ? String(v) : ''; }),
          String(p.total),
        ]);
        const totalesPorTalla = tallasPresentes.map((t) => productosOrdenados.reduce((s, p) => s + (p.porTalla.get(t) ?? 0), 0));
        const foot = [['Total', ...totalesPorTalla.map((v) => String(v)), String(totalUnidades)]];
        const head = [['Producto', ...tallasPresentes.map((t) => formatTallaChip(t)), 'Total']];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const columnStyles: Record<number, any> = { 0: { halign: 'left', fontStyle: 'bold' } };
        for (let i = 1; i <= tallasPresentes.length; i++) columnStyles[i] = { halign: 'center' };
        columnStyles[tallasPresentes.length + 1] = { halign: 'right', fontStyle: 'bold' };
        autoTable(doc, {
          startY: y, margin: { left: M, right: M }, head, body, foot,
          styles: { fontSize: 8, cellPadding: 1.4 },
          headStyles: { fillColor: [16, 185, 129], textColor: 255, halign: 'center' },
          columnStyles,
          alternateRowStyles: { fillColor: [248, 250, 252] },
          footStyles: { fillColor: [240, 253, 244], textColor: 0, fontStyle: 'bold', halign: 'center' },
        });
      }

      // ─── Footer ───────────────────────────────────────────────────────────
      const total = doc.internal.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        doc.setFontSize(6); doc.setTextColor(...GRIS); doc.setFont('helvetica', 'italic');
        doc.text(
          `Plan ${planCodigo} — Documento interno emitido por HAPPY SAC ERP · Pág. ${i}/${total}`,
          pageW / 2, pageH - 8, { align: 'center' },
        );
      }

      doc.save(`plan-${planCodigo.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`);
      toast.success('PDF del plan descargado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={descargar} disabled={loading || totalLineas === 0} className="gap-1.5">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
      Descargar PDF
    </Button>
  );
}
