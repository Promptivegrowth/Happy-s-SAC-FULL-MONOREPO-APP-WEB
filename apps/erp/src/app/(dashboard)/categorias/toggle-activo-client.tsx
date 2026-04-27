'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@happy/ui/switch';
import { Badge } from '@happy/ui/badge';
import { toast } from 'sonner';
import { toggleCategoriaActivo } from '@/server/actions/categorias';

export function ToggleCategoriaActivo({ id, activo }: { id: string; activo: boolean }) {
  const [val, setVal] = useState(activo);
  const [pending, start] = useTransition();

  function onToggle(v: boolean) {
    if (v) {
      // Encender — confirmar con cascada
      const ok = confirm(
        'Activar esta categoría también PUBLICARÁ todos sus productos en la web. ' +
          '\n\n¿Continuar?\n\n(Tip: si solo querés re-mostrar productos ya publicados, podés cancelar y usar el botón ⋮ con "Publicar todos" — ambos funcionan igual.)',
      );
      if (!ok) return;
    } else {
      const ok = confirm(
        'Apagar la categoría OCULTARÁ todos sus productos en la web (sin despublicarlos). ' +
          '\n\nAl reactivarla, los productos vuelven a aparecer.\n\n¿Continuar?',
      );
      if (!ok) return;
    }

    start(async () => {
      const r = await toggleCategoriaActivo(id, v, true);
      if (r.ok) {
        setVal(v);
        if (v) {
          const cant = r.data?.publicados ?? 0;
          toast.success(
            cant > 0
              ? `✨ Categoría activa · ${cant} productos publicados en la web`
              : '✨ Categoría activa (sin productos para publicar)',
          );
        } else {
          toast.success('Categoría apagada · productos ocultos en la web');
        }
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={val} onCheckedChange={onToggle} disabled={pending} />
      {val ? (
        <Badge variant="success" className="text-[10px]">Activa</Badge>
      ) : (
        <Badge variant="secondary" className="text-[10px]">Apagada</Badge>
      )}
    </div>
  );
}
