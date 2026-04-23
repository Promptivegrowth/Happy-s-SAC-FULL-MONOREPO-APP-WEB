'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@happy/ui/switch';
import { Badge } from '@happy/ui/badge';
import { toast } from 'sonner';
import { togglePublicacionWeb } from '@/server/actions/productos';

export function ToggleClient({ productoId, publicado }: { productoId: string; publicado: boolean }) {
  const [pub, setPub] = useState(publicado);
  const [pending, start] = useTransition();

  function onToggle(v: boolean) {
    start(async () => {
      const r = await togglePublicacionWeb(productoId, v);
      if (r.ok) {
        setPub(v);
        toast.success(v ? '✨ Publicado' : 'Oculto');
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={pub} onCheckedChange={onToggle} disabled={pending} />
      {pub ? <Badge variant="success" className="text-[10px]">Visible</Badge> : <Badge variant="secondary" className="text-[10px]">Oculto</Badge>}
    </div>
  );
}
