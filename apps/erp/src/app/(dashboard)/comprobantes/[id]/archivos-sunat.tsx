'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@happy/ui/button';
import { Download, FileCode, Loader2, ShieldCheck } from 'lucide-react';
import { enlaceArchivoComprobante, type ArchivoComprobante } from '@/server/actions/comprobante-archivos';

/** Botones XML / CDR del comprobante (o del resumen diario, en boletas). */
export function ArchivosSunat({ id, esBoleta, tieneXml, tieneCdr, tieneResumen }: {
  id: string; esBoleta: boolean; tieneXml: boolean; tieneCdr: boolean; tieneResumen: boolean;
}) {
  const [pending, start] = useTransition();
  const bajar = (archivo: ArchivoComprobante) => start(async () => {
    const r = await enlaceArchivoComprobante(id, archivo);
    if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo descargar'); return; }
    window.location.href = r.data.url;
  });
  const icono = (I: typeof FileCode) => (pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <I className="h-4 w-4" />);

  if (esBoleta) {
    if (!tieneResumen) return null;
    return (
      <>
        <Button variant="outline" disabled={pending} onClick={() => bajar('xml_resumen')} title="XML del resumen diario en que SUNAT recibió esta boleta">
          {icono(FileCode)} XML resumen
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => bajar('cdr_resumen')} title="Constancia de recepción (CDR) de SUNAT del resumen diario">
          {icono(ShieldCheck)} CDR resumen
        </Button>
      </>
    );
  }
  return (
    <>
      {tieneXml && <Button variant="outline" disabled={pending} onClick={() => bajar('xml')}>{icono(FileCode)} XML</Button>}
      {tieneCdr && <Button variant="outline" disabled={pending} onClick={() => bajar('cdr')}>{icono(ShieldCheck)} CDR</Button>}
    </>
  );
}

/** CDR de un envío puntual, en la tabla de envíos. */
export function CdrEnvioButton({ id, envioId }: { id: string; envioId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => {
      const r = await enlaceArchivoComprobante(id, 'cdr', envioId);
      if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo descargar'); return; }
      window.location.href = r.data.url;
    })}>
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} CDR
    </Button>
  );
}
