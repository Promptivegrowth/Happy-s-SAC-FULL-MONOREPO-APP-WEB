'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@happy/ui/button';
import { consultarGuia, reenviarGuia, enlaceArchivoGuia, datosImpresionGuia } from '@/server/actions/guias';
import { descargarGuiaPdf } from './guia-pdf';
import { Copy, FileCode, FileDown, Loader2, RefreshCw, Send, ShieldCheck } from 'lucide-react';

export function AccionesGuia({ id, estado, tieneXml, tieneCdr }: { id: string; estado: string; tieneXml: boolean; tieneCdr: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const avisar = (r: { ok: boolean; data?: { estado: string; mensaje: string }; error?: string }) => {
    if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo'); return; }
    const { estado: e, mensaje } = r.data;
    if (e === 'ACEPTADO') toast.success('SUNAT aceptó la guía');
    else if (e === 'RECHAZADO') toast.error(`SUNAT rechazó la guía: ${mensaje}`);
    else if (e === 'EMITIDO') toast.info('SUNAT todavía la está procesando. Vuelve a consultar en un rato.');
    else toast.warning(mensaje, { duration: 10000 });
    router.refresh();
  };

  const descargar = (archivo: 'xml' | 'cdr') => start(async () => {
    const r = await enlaceArchivoGuia(id, archivo);
    if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo descargar'); return; }
    window.location.href = r.data.url;
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="premium" disabled={pending} onClick={() => start(async () => {
        const r = await datosImpresionGuia(id);
        if (!r.ok || !r.data) { toast.error(r.error ?? 'No se pudo armar el PDF'); return; }
        await descargarGuiaPdf(r.data);
      })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} PDF
      </Button>
      {tieneXml && <Button variant="outline" disabled={pending} onClick={() => descargar('xml')}><FileCode className="h-4 w-4" /> XML</Button>}
      {tieneCdr && <Button variant="outline" disabled={pending} onClick={() => descargar('cdr')}><ShieldCheck className="h-4 w-4" /> CDR</Button>}
      {estado === 'EMITIDO' && (
        <Button variant="outline" disabled={pending} onClick={() => start(async () => avisar(await consultarGuia(id)))}>
          <RefreshCw className="h-4 w-4" /> Consultar a SUNAT
        </Button>
      )}
      {estado === 'BORRADOR' && (
        <Button variant="outline" disabled={pending} onClick={() => start(async () => avisar(await reenviarGuia(id)))}>
          <Send className="h-4 w-4" /> Enviar a SUNAT
        </Button>
      )}
      <Button asChild variant="ghost">
        <Link href={`/guias/nueva?copiar=${id}`}><Copy className="h-4 w-4" /> {estado === 'RECHAZADO' ? 'Corregir y emitir otra' : 'Emitir otra igual'}</Link>
      </Button>
    </div>
  );
}
