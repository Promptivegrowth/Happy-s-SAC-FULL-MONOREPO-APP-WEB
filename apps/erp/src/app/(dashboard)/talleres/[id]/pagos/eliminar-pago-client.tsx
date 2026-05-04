'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { eliminarPagoTaller } from '@/server/actions/pagos-talleres';

export function EliminarPagoButton({ pagoId, tallerId }: { pagoId: string; tallerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;
    start(async () => {
      const r = await eliminarPagoTaller(pagoId, tallerId);
      if (r.ok) {
        toast.success('Pago eliminado');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} title="Eliminar pago">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
    </Button>
  );
}
