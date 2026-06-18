'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { exportarReclamoPDF } from '@/server/actions/reclamos';
import { cargarEmpresaPDF } from '@/server/empresa-pdf-helper';
import { generarReclamoPdf } from './pdf';

export function DescargarReclamoPdfButton({
  id,
  numero,
}: {
  id: string;
  numero: string;
}) {
  const [loading, setLoading] = useState(false);

  async function descargar() {
    setLoading(true);
    try {
      const [res, empresa] = await Promise.all([
        exportarReclamoPDF(id),
        cargarEmpresaPDF(),
      ]);
      if (!res.ok || !res.data) {
        throw new Error(res.error ?? 'No se pudo cargar el reclamo');
      }
      await generarReclamoPdf(res.data, empresa);
      toast.success('PDF descargado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={descargar}
      disabled={loading}
      className="gap-1.5"
      title={`Descargar PDF del reclamo ${numero}`}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      Descargar PDF
    </Button>
  );
}
