'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { exportarInventarioExcel } from '@/server/actions/inventario-export';

/**
 * Descarga el inventario en Excel. Si hay un almacén filtrado, exporta solo ese;
 * si no, genera un libro con hoja "Consolidado" + una hoja por almacén.
 */
export function ExportarInventarioButton({ almacenId }: { almacenId?: string }) {
  const [loading, setLoading] = useState(false);

  async function descargar() {
    setLoading(true);
    try {
      const r = await exportarInventarioExcel(almacenId);
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: r.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(almacenId ? 'Inventario del almacén exportado' : 'Inventario (consolidado + por almacén) exportado');
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      className="gap-2"
      onClick={descargar}
      disabled={loading}
      title={almacenId ? 'Descargar Excel de este almacén' : 'Descargar Excel: consolidado + una hoja por almacén'}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      Exportar Excel
    </Button>
  );
}
