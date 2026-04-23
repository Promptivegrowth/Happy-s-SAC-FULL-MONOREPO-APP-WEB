'use client';

import { useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cambiarEstadoOS } from '@/server/actions/corte';

const FLOW: Record<string, string[]> = {
  EMITIDA: ['DESPACHADA','ANULADA'],
  DESPACHADA: ['EN_PROCESO'],
  EN_PROCESO: ['RECEPCIONADA'],
  RECEPCIONADA: ['CERRADA'],
};

export function OsTransitions({ osId, estado }: { osId: string; estado: string }) {
  const [pending, start] = useTransition();
  const next = FLOW[estado] ?? [];
  if (next.length === 0) return null;

  function go(nuevo: string) {
    if (!confirm(`¿Cambiar estado a ${nuevo.replace('_', ' ')}?`)) return;
    start(async () => {
      const r = await cambiarEstadoOS(osId, nuevo);
      if (r.ok) toast.success('Estado actualizado');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((n) => (
        <Button
          key={n}
          variant={n === 'ANULADA' ? 'destructive' : n === 'CERRADA' || n === 'RECEPCIONADA' ? 'premium' : 'corp'}
          size="sm"
          onClick={() => go(n)}
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {n.replace('_', ' ')}
        </Button>
      ))}
    </div>
  );
}
