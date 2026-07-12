'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { FilePlus2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { crearReceta } from '@/server/actions/recetas';

/**
 * Botón que crea una receta v1.0 vacía para el producto y redirige al
 * editor. Cliente reportó (2026-07-10) que "Superman especial para niño"
 * no aparecía en el buscador de /recetas porque no tenía receta creada
 * — la única forma de crearla era abrir el modal desde /recetas. Ahora
 * también existe este botón dentro de la página del producto, para el
 * caso natural en que el usuario ya está viendo el producto y quiere
 * crear su receta.
 */
export function CrearRecetaInline({ productoId }: { productoId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      const r = await crearReceta(productoId);
      if (r.ok && r.data) {
        toast.success('Receta v1.0 creada · agregá líneas BOM');
        router.push(`/recetas/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'Error al crear la receta');
      }
    });
  }

  return (
    <Button
      variant="premium"
      className="gap-2"
      onClick={onClick}
      disabled={pending}
      title="Crear receta v1.0 vacía para este producto"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
      Crear receta
    </Button>
  );
}
