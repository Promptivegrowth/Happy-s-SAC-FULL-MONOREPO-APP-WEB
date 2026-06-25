'use client';

/**
 * Modal de APERTURA DE CAJA.
 *
 * El cajero lo abre manualmente desde el botón "Abrir caja" del terminal
 * cuando no hay sesión activa. Puede cerrarlo con la X si solo quiere
 * consultar historial/reportes sin abrir un turno nuevo.
 */

import { useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Banknote, Loader2, LogIn, X } from 'lucide-react';
import { toast } from 'sonner';
import { abrirSesion } from '@/server/actions/caja';

export function AbrirCajaModal({
  cajeroNombre,
  cajaNombre,
  cajaId,
  cajasDisponibles,
  montoDefault,
  onAbierta,
  onClose,
}: {
  cajeroNombre: string;
  cajaNombre: string | null;
  cajaId: string | null;
  cajasDisponibles: { id: string; codigo: string; nombre: string }[];
  montoDefault: number;
  onAbierta: () => void;
  onClose?: () => void;
}) {
  const [monto, setMonto] = useState<string>(montoDefault.toFixed(2));
  const [obs, setObs] = useState('');
  // Si el usuario no tiene caja asignada, se obliga a elegir. Si hay solo una
  // disponible, se preselecciona. Si tiene caja_default, ese valor manda.
  const [cajaSel, setCajaSel] = useState<string>(() => {
    if (cajaId) return cajaId;
    if (cajasDisponibles.length === 1) return cajasDisponibles[0]!.id;
    return '';
  });
  const [pending, start] = useTransition();
  const necesitaElegirCaja = !cajaId;

  function submit() {
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Monto inválido');
      return;
    }
    if (!cajaSel) {
      toast.error('Seleccioná una caja');
      return;
    }
    start(async () => {
      try {
        // Pasamos caja_id solo si el cajero la eligió manualmente (no hay default)
        await abrirSesion({
          monto_apertura: n,
          caja_id: necesitaElegirCaja ? cajaSel : null,
          observacion: obs || null,
        });
        toast.success('Caja abierta');
        onAbierta();
      } catch (e) {
        toast.error((e as Error).message);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/70 backdrop-blur-sm p-4"
      onClick={() => !pending && onClose?.()}
    >
      <Card
        className="relative w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={onClose}
            disabled={pending}
            className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-happy-100 p-2">
            <LogIn className="h-5 w-5 text-happy-600" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-corp-900">Abrir caja</h2>
            <p className="text-xs text-slate-500">Iniciá tu turno con el monto inicial en efectivo.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Cajero</Label>
              <Input value={cajeroNombre} readOnly className="mt-1 bg-slate-50" />
            </div>
            <div>
              <Label className="text-xs">Caja {necesitaElegirCaja && <span className="text-rose-600">*</span>}</Label>
              {!necesitaElegirCaja ? (
                <Input value={cajaNombre ?? '—'} readOnly className="mt-1 bg-slate-50" />
              ) : cajasDisponibles.length === 0 ? (
                <div className="mt-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
                  No hay cajas configuradas en el sistema. El gerente debe crear al menos
                  una caja desde el ERP antes de poder vender.
                </div>
              ) : (
                <>
                  <select
                    value={cajaSel}
                    onChange={(e) => setCajaSel(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
                  >
                    <option value="">— Elegí una caja —</option>
                    {cajasDisponibles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} · {c.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">
                    No tenés caja asignada. La que elijas se guardará como tu predeterminada.
                  </p>
                </>
              )}
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
          disabled={pending || (necesitaElegirCaja && cajasDisponibles.length === 0)}
          className="mt-6 w-full"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Abrir caja
        </Button>
      </Card>
    </div>
  );
}
