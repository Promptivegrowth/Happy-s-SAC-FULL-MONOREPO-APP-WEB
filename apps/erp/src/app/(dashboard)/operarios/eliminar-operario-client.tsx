'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@happy/ui/dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { eliminarOperario } from '@/server/actions/operarios';

export function EliminarOperarioButton({ id, nombre }: { id: string; nombre: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onConfirm() {
    start(async () => {
      const r = await eliminarOperario(id);
      if (r.ok) {
        toast.success('Operario desactivado');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo desactivar');
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} title="Desactivar operario">
        <Trash2 className="h-3.5 w-3.5 text-danger" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Desactivar operario?</DialogTitle>
            <DialogDescription>
              Vas a desactivar a <strong>{nombre}</strong>. Quedará registrada la fecha de salida pero su histórico de producción se conserva.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Sí, desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
