'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { aprobarSolicitudOS, rechazarSolicitudOS } from '@/server/actions/corte';

export function AprobarRechazarSolicitud({ solicitudId }: { solicitudId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accion, setAccion] = useState<'aprobar' | 'rechazar' | null>(null);

  function aprobar() {
    if (!confirm('¿Aprobar esta solicitud? Se generará la orden de servicio automáticamente.')) return;
    setAccion('aprobar');
    start(async () => {
      const r = await aprobarSolicitudOS(solicitudId);
      if (r.ok) { toast.success('Solicitud aprobada · OS generada'); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo aprobar');
      setAccion(null);
    });
  }

  function rechazar() {
    const motivo = prompt('Motivo del rechazo (se le avisará al solicitante):');
    if (motivo === null) return;
    setAccion('rechazar');
    start(async () => {
      const r = await rechazarSolicitudOS(solicitudId, motivo);
      if (r.ok) { toast.success('Solicitud rechazada'); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo rechazar');
      setAccion(null);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="premium" size="sm" className="h-7 gap-1 px-2" onClick={aprobar} disabled={pending}>
        {pending && accion === 'aprobar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Aprobar
      </Button>
      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-danger" onClick={rechazar} disabled={pending}>
        {pending && accion === 'rechazar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />} Rechazar
      </Button>
    </div>
  );
}
