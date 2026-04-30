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
      const ok = confirm(
        'Encender la categoría PUBLICARÁ todos sus productos en la web.\n\n¿Continuar?',
      );
      if (!ok) return;
    } else {
      const ok = confirm(
        'Apagar la categoría DESPUBLICARÁ todos sus productos en la web.\n\n' +
          'Al volver a encenderla, todos se publican de nuevo automáticamente.\n\n¿Continuar?',
      );
      if (!ok) return;
    }

    start(async () => {
      const r = await toggleCategoriaActivo(id, v);
      if (r.ok) {
        setVal(v);
        const cant = r.data?.afectados ?? 0;
        if (v) {
          toast.success(
            cant > 0
              ? `✨ Categoría encendida · ${cant} productos publicados en la web`
              : '✨ Categoría encendida (sin productos para publicar)',
          );
        } else {
          toast.success(
            cant > 0
              ? `Categoría apagada · ${cant} productos despublicados`
              : 'Categoría apagada',
          );
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
