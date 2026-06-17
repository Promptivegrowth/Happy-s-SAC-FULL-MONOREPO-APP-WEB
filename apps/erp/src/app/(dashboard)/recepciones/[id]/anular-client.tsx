'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { anularRecepcion } from '@/server/actions/recepciones';

export function AnularRecepcionButton({ id, numero }: { id: string; numero: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    if (
      !confirm(
        `Anular la recepción ${numero}. Se generarán movimientos de salida en kardex y se revertirán las cantidades recibidas en la OC. ¿Continuar?`,
      )
    ) {
      return;
    }
    start(async () => {
      const r = await anularRecepcion(id);
      if (r.ok) {
        toast.success(`Recepción ${numero} anulada`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo anular');
      }
    });
  }

  return (
    <Button variant="destructive" size="sm" onClick={onClick} disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
      Anular recepción
    </Button>
  );
}
