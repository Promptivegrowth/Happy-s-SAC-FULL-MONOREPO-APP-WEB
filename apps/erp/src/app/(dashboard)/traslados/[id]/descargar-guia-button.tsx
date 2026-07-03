'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarGuiaRemisionPdf } from './guia-remision-pdf';
import { generarGuiaRemisionExcel } from './guia-remision-excel';
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
  const [pendingPdf, setPendingPdf] = useState(false);
  const [pendingXlsx, setPendingXlsx] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoTriggeredRef = useRef(false);

  async function descargarPdf() {
    setPendingPdf(true);
    try {
      await generarGuiaRemisionPdf(traslado, lineas, empresa);
      toast.success('Guía de remisión PDF descargada');
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al generar guía PDF');
    } finally {
      setPendingPdf(false);
    }
  }

  async function descargarExcel() {
    setPendingXlsx(true);
    try {
      await generarGuiaRemisionExcel(traslado, lineas, empresa);
      toast.success('Guía de remisión Excel descargada');
    } catch (e) {
      toast.error((e as Error).message ?? 'Error al generar guía Excel');
    } finally {
      setPendingXlsx(false);
    }
  }

  // Auto-disparo: si la URL viene con ?guia=1 (desde el botón del listado),
  // descarga PDF automáticamente y limpia el query param.
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (searchParams.get('guia') === '1') {
      autoTriggeredRef.current = true;
      void descargarPdf().finally(() => {
        router.replace(`/traslados/${traslado.id}`, { scroll: false });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={descargarPdf}
        disabled={pendingPdf}
        variant="outline"
        size="sm"
        className="border-amber-300 text-amber-700 hover:bg-amber-50"
      >
        {pendingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Guía PDF
      </Button>
      <Button
        onClick={descargarExcel}
        disabled={pendingXlsx}
        variant="outline"
        size="sm"
        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
      >
        {pendingXlsx ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
        Guía Excel
      </Button>
    </div>
  );
}
