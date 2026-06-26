'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoTriggeredRef = useRef(false);

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

  // Auto-disparo: si la URL viene con ?guia=1 (desde el botón del listado),
  // descarga automáticamente y limpia el query param.
  useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (searchParams.get('guia') === '1') {
      autoTriggeredRef.current = true;
      void descargar().finally(() => {
        // Limpiar el query param sin recargar
        router.replace(`/traslados/${traslado.id}`, { scroll: false });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
