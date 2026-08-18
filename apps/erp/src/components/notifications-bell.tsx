'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Button } from '@happy/ui/button';
import {
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  type NotificacionUI,
} from '@/server/actions/notificaciones';

function haceCuanto(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.round(h / 24);
  return `hace ${dias} d`;
}

export function NotificationsBell({ items, noLeidas }: { items: NotificacionUI[]; noLeidas: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function abrir(n: NotificacionUI) {
    start(async () => {
      if (!n.leido) await marcarNotificacionLeida(n.id);
      setOpen(false);
      if (n.enlace) router.push(n.enlace);
      router.refresh();
    });
  }

  function marcarTodas() {
    start(async () => {
      await marcarTodasNotificacionesLeidas();
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" title="Notificaciones" onClick={() => setOpen((v) => !v)}>
        <div className="relative">
          <Bell className="h-4 w-4" />
          {noLeidas > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {noLeidas > 9 ? '9+' : noLeidas}
            </span>
          )}
        </div>
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-lg border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-corp-900">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodas} disabled={pending} className="flex items-center gap-1 text-[11px] text-happy-600 hover:underline">
                {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400">No tienes notificaciones.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => abrir(n)}
                  disabled={pending}
                  className={`block w-full border-b px-3 py-2.5 text-left transition hover:bg-slate-50 ${n.leido ? 'opacity-60' : 'bg-happy-50/40'}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.leido && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-happy-500" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-corp-900">{n.titulo}</p>
                      {n.mensaje && <p className="mt-0.5 text-[11px] text-slate-600">{n.mensaje}</p>}
                      <p className="mt-0.5 text-[10px] text-slate-400">{haceCuanto(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
