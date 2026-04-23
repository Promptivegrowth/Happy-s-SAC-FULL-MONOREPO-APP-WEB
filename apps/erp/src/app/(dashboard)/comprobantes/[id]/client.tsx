'use client';

import { useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { emitirComprobanteSunat } from '@/server/actions/sunat';

export function EmitirSunatButton({ comprobanteId, estado }: { comprobanteId: string; estado: string }) {
  const [pending, start] = useTransition();

  function emitir() {
    if (!confirm('Esto enviará el comprobante a SUNAT. ¿Continuar?')) return;
    start(async () => {
      const r = await emitirComprobanteSunat(comprobanteId);
      if (r.ok && r.data) {
        toast.success(`SUNAT [${r.data.codigo}]: ${r.data.descripcion}`);
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  const label =
    estado === 'BORRADOR' ? 'Enviar a SUNAT' :
    estado === 'OBSERVADO' || estado === 'RECHAZADO' ? 'Reintentar envío' :
    'Re-enviar';

  return (
    <Button variant="premium" onClick={emitir} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {label}
    </Button>
  );
}
