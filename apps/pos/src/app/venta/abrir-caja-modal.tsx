'use client';

/**
 * Overlay/modal de APERTURA DE CAJA.
 *
 * Aparece SIEMPRE cuando no hay sesión activa. Sin sesión, el resto del
 * terminal está bloqueado (sólo se ve este overlay).
 */

import { useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Banknote, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { abrirSesion } from '@/server/actions/caja';

export function AbrirCajaModal({
  cajeroNombre,
  cajaNombre,
  montoDefault,
  onAbierta,
}: {
  cajeroNombre: string;
  cajaNombre: string | null;
  montoDefault: number;
  onAbierta: () => void;
}) {
  const [monto, setMonto] = useState<string>(montoDefault.toFixed(2));
  const [obs, setObs] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Monto inválido');
      return;
    }
    start(async () => {
      try {
        await abrirSesion({ monto_apertura: n, observacion: obs || null });
        toast.success('Caja abierta');
        onAbierta();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-happy-100 p-2">
            <LogIn className="h-5 w-5 text-happy-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-corp-900">Abrir caja</h2>
            <p className="text-xs text-slate-500">No puedes vender hasta abrir tu sesión de caja.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cajero</Label>
              <Input value={cajeroNombre} readOnly className="mt-1 bg-slate-50" />
            </div>
            <div>
              <Label className="text-xs">Caja</Label>
              <Input value={cajaNombre ?? '—'} readOnly className="mt-1 bg-slate-50" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Monto inicial en efectivo (S/)</Label>
            <div className="relative mt-1">
              <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="h-12 pl-9 text-xl font-display"
                autoFocus
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Por defecto S/ {montoDefault.toFixed(2)} (configurable por caja).
            </p>
          </div>

          <div>
            <Label className="text-xs">Observación (opcional)</Label>
            <Input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ej. turno mañana, billete falso retenido…"
              className="mt-1"
            />
          </div>
        </div>

        <Button
          onClick={submit}
          variant="premium"
          size="lg"
          disabled={pending}
          className="mt-6 w-full"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Abrir caja
        </Button>
      </Card>
    </div>
  );
}
