'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@happy/ui/dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  action: () => Promise<{ ok: boolean; error?: string }>;
  label?: string;
  itemName?: string;
  /** Si se pasa, navega ahí después de eliminar exitosamente. */
  redirectTo?: string;
};

export function DeleteButton({ action, label = 'Eliminar', itemName = 'este registro', redirectTo }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onConfirm() {
    start(async () => {
      try {
        const r = await action();
        if (r.ok) {
          toast.success('Eliminado');
          setOpen(false);
          if (redirectTo) {
            router.push(redirectTo);
          } else {
            router.refresh();
          }
        } else {
          toast.error(r.error ?? 'No se pudo eliminar');
        }
      } catch (e) {
        // Algunos server actions hacen redirect() y eso lanza una "exception"
        // que en realidad es el mecanismo de Next para navegar. La capturamos
        // silenciosamente y dejamos que el redirect fluya.
        const msg = (e as Error)?.message ?? '';
        if (msg.includes('NEXT_REDIRECT')) {
          setOpen(false);
          return;
        }
        toast.error(msg || 'Error al eliminar');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Eliminar?</DialogTitle>
          <DialogDescription>
            Vas a eliminar {itemName}. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Sí, eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
