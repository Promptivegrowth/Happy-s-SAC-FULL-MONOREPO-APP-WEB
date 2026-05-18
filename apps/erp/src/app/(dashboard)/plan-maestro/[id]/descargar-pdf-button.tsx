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

type Props = {
  planCodigo: string;
  totalLineas: number;
  totalUnidades: number;
  materiales: Material[];
};

/**
 * Descarga la explosión de materiales como PDF tabular.
 * Usa jspdf + jspdf-autotable cargados dinámicamente para no inflar el bundle
 * principal — solo se descargan cuando el usuario hace click.
 */
export function DescargarPdfButton({ planCodigo, totalLineas, totalUnidades, materiales }: Props) {
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
