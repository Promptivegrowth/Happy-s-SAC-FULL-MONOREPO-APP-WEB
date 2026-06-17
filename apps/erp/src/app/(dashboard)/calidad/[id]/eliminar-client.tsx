'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { eliminarControl } from '@/server/actions/calidad';

export function EliminarControlButton({ id, numero }: { id: string; numero: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (
      !confirm(
        `Eliminar el control ${numero}. Esta acción no puede deshacerse. ¿Continuar?`,
      )
    ) {
      return;
    }
    start(async () => {
      const r = await eliminarControl(id);
      if (r.ok) {
        toast.success(`Control ${numero} eliminado`);
        router.push('/calidad');
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Eliminar control
    </Button>
  );
}
