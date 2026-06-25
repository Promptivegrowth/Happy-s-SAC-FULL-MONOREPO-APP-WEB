'use client';

import { useState } from 'react';
import { Button } from '@happy/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarGuiaRemisionPdf } from './guia-remision-pdf';
import type { TrasladoDetalle, TrasladoLineaDetalle } from '@/server/actions/traslados';
import type { EmpresaPDFData } from '@/server/empresa-pdf-helper';

export function DescargarGuiaButton({
  traslado,
  lineas,
  empresa,
}: {
  traslado: TrasladoDetalle;
  lineas: TrasladoLineaDetalle[];
  empresa: EmpresaPDFData | null;
}) {
  const [pending, setPending] = useState(false);

  async function descargar() {
    setPending(true);
    try {
      await generarGuiaRemisionPdf(traslado, lineas, empresa);
      toast.success('Guía de remisión descargada');
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al generar guía');
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      onClick={descargar}
      disabled={pending}
      variant="outline"
      size="sm"
      className="border-amber-300 text-amber-700 hover:bg-amber-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Guía de remisión PDF
    </Button>
  );
}
