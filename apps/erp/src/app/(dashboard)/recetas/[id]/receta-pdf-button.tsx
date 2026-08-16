'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarRecetaPdf, type RecetaPdfData } from './receta-pdf';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';

/**
 * Botón para descargar/imprimir la receta (materiales + procesos) en PDF.
 * Recibe los datos ya armados server-side; genera el PDF en el cliente con jsPDF.
 */
export function RecetaPdfButton({
  data,
  empresa,
}: {
  data: RecetaPdfData;
  empresa: EmpresaPDFData | null;
}) {
  const [loading, setLoading] = useState(false);
  async function imprimir() {
    setLoading(true);
    try {
      await generarRecetaPdf(data, empresa);
      toast.success('PDF de la receta generado');
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button variant="outline" className="gap-1" onClick={imprimir} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      Descargar PDF
    </Button>
  );
}
