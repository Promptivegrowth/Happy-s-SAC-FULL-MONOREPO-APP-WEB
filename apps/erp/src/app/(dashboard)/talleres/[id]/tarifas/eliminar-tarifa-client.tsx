'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { eliminarTarifa } from '@/server/actions/tarifas-talleres';

export function EliminarTarifaButton({ tarifaId, tallerId }: { tarifaId: string; tallerId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (!confirm('¿Eliminar esta tarifa?')) return;
    start(async () => {
      const r = await eliminarTarifa(tarifaId, tallerId);
      if (r.ok) {
        toast.success('Tarifa eliminada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending} title="Eliminar tarifa">
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-danger" />}
    </Button>
  );
}
