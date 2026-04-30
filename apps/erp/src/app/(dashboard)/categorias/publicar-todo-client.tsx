'use client';

import { useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { publicarTodoElCatalogo } from '@/server/actions/categorias';

export function PublicarTodoElCatalogoButton({ totalSinPublicar }: { totalSinPublicar: number }) {
  const [pending, start] = useTransition();

  function ejecutar() {
    if (totalSinPublicar === 0) {
      return toast.info('Todo el catálogo ya está publicado');
    }
    if (
      !confirm(
        `Esto publicará ${totalSinPublicar} productos sin publicar de TODAS las categorías activas en la web. ` +
          '\n\nÚsalo solo para poblar la web por primera vez. Después podés ocultar productos individualmente desde /web-catalogo.\n\n¿Continuar?',
      )
    ) {
      return;
    }
    start(async () => {
      const r = await publicarTodoElCatalogo();
      if (r.ok && r.data) {
        const { publicados, categorias, sinCategoria } = r.data;
        const extra = sinCategoria > 0 ? ` (incluyendo ${sinCategoria} sin categoría asignada)` : '';
        toast.success(
          `✨ ${publicados} productos publicados en ${categorias} categorías${extra}`,
        );
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  if (totalSinPublicar === 0) return null;

  return (
    <Button
      variant="default"
      size="sm"
      onClick={ejecutar}
      disabled={pending}
      className="gap-2 bg-emerald-600 hover:bg-emerald-700"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
      Publicar todo el catálogo ({totalSinPublicar})
    </Button>
  );
}
