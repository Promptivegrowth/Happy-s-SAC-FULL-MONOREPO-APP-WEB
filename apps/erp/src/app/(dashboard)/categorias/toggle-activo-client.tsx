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
    if (!v && !confirm('Apagar esta categoría también ocultará todos sus productos en la web. ¿Continuar?')) return;
    start(async () => {
      const r = await toggleCategoriaActivo(id, v);
      if (r.ok) {
        setVal(v);
        toast.success(v ? '✨ Categoría activa: productos visibles en web' : 'Categoría apagada: productos ocultos en web');
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
