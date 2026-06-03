'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
};

type Props = {
  planCodigo: string;
  totalLineas: number;
  totalUnidades: number;
  materiales: Material[];
  lineasProductos: LineaProductoTalla[];
};

/**
 * Descarga la explosión de materiales como PDF tabular.
 * Usa jspdf + jspdf-autotable cargados dinámicamente para no inflar el bundle
 * principal — solo se descargan cuando el usuario hace click.
 */
export function DescargarPdfButton({ planCodigo, totalLineas, totalUnidades, materiales, lineasProductos }: Props) {
  const [loading, setLoading] = useState(false);

  async function descargar() {
    if (materiales.length === 0) {
      toast.error('No hay materiales para exportar');
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
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      const fecha = new Date().toLocaleString('es-PE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Explosión de materiales — Plan ${planCodigo}`, 14, 18);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(110);
      doc.text(
        `Generado: ${fecha}  ·  Líneas del plan: ${totalLineas}  ·  Total unidades: ${totalUnidades}`,
        14,
        24,
      );
      doc.setTextColor(0);

      autoTable(doc, {
        startY: 30,
        head: [['Código', 'Material', 'Categoría', 'Unidad', 'Cantidad total']],
        body: materiales.map((m) => [
          m.material_codigo,
          m.material_nombre,
          m.categoria,
          m.unidad,
          Number(m.cantidad_total).toFixed(4),
        ]),
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255 },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      // Segunda tabla: pivot de productos × tallas (sugerencia del cliente).
      // Formato:
      //          | T0 | T2 | T4 | ... | Total
      //  Prod A  | 20 |    | 40 | ... | 130
      //  Prod B  | 10 | 50 | 40 | ... | 178
      //  Total   | 30 | 50 | 80 | ... | 308
      // Solo se muestran columnas de tallas que tienen al menos 1 valor.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastY: number = (doc as any).lastAutoTable?.finalY ?? 40;
      const startY2 = lastY + 12;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Productos y tallas del plan', 14, startY2 - 4);

      const ordenTallas = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'];

      // 1) Tallas que aparecen al menos una vez (ordenadas por convención).
      const tallasPresentes = ordenTallas.filter((t) =>
        lineasProductos.some((l) => l.talla === t),
      );

      // 2) Productos únicos ordenados alfabéticamente.
      type ProdAgg = { codigo: string; nombre: string; porTalla: Map<string, number>; total: number };
      const productosMap = new Map<string, ProdAgg>();
      for (const l of lineasProductos) {
        const key = `${l.producto_codigo}|${l.producto_nombre}`;
        if (!productosMap.has(key)) {
          productosMap.set(key, { codigo: l.producto_codigo, nombre: l.producto_nombre, porTalla: new Map(), total: 0 });
        }
        const pa = productosMap.get(key)!;
        pa.porTalla.set(l.talla, (pa.porTalla.get(l.talla) ?? 0) + l.cantidad);
        pa.total += l.cantidad;
      }
      const productosOrdenados = [...productosMap.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

      // 3) Filas del body: producto + 1 celda por talla presente + total fila.
      const body = productosOrdenados.map((p) => [
        p.nombre,
        ...tallasPresentes.map((t) => {
          const v = p.porTalla.get(t);
          return v ? String(v) : '';
        }),
        String(p.total),
      ]);

      // 4) Totales por columna (suma por talla) + total general.
      const totalesPorTalla = tallasPresentes.map((t) =>
        productosOrdenados.reduce((s, p) => s + (p.porTalla.get(t) ?? 0), 0),
      );
      const foot = [['Total', ...totalesPorTalla.map((v) => String(v)), String(totalUnidades)]];

      // 5) Cabeceras: "Producto" + cada talla sin la "T" inicial + "Total".
      const head = [['Producto', ...tallasPresentes.map((t) => t.replace('T', '')), 'Total']];

      // 6) Estilos: centrar columnas numéricas, derecha en "Total", celdas vacías sin fondo alterno raro.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const columnStyles: Record<number, any> = { 0: { halign: 'left', fontStyle: 'bold' } };
      for (let i = 1; i <= tallasPresentes.length; i++) columnStyles[i] = { halign: 'center' };
      columnStyles[tallasPresentes.length + 1] = { halign: 'right', fontStyle: 'bold' };

      autoTable(doc, {
        startY: startY2,
        head,
        body,
        foot,
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129], textColor: 255, halign: 'center' },
        columnStyles,
        alternateRowStyles: { fillColor: [248, 250, 252] },
        footStyles: { fillColor: [240, 253, 244], textColor: 0, fontStyle: 'bold', halign: 'center' },
      });

      doc.save(`explosion-materiales-${planCodigo}.pdf`);
      toast.success('PDF descargado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={descargar} disabled={loading || materiales.length === 0} className="gap-1.5">
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Descargar PDF
    </Button>
  );
}
