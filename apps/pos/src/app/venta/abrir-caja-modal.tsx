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
import { cerrarSesionUsuario } from '@/server/actions/auth';

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
  // La caja asignada viene preseleccionada, pero SE PUEDE CAMBIAR. Antes era un
  // campo de solo lectura y no habia forma de cambiarla en todo el sistema: el
  // ERP tampoco escribe caja_default en ninguna pantalla. Una cajera que cubre
  // el turno de la otra tienda quedaba atrapada.
  const [cajaSel, setCajaSel] = useState<string>(() => {
    if (cajaId) return cajaId;
    if (cajasDisponibles.length === 1) return cajasDisponibles[0]!.id;
    return '';
  });
  const [pending, start] = useTransition();
  const sinCajaAsignada = !cajaId;
  /** Cambiar de caja cambia tambien de tienda: conviene que se note. */
  const cambioDeCaja = Boolean(cajaId) && cajaSel !== cajaId;

  function submit() {
    const n = Number(monto);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Monto inválido');
      return;
    }
    if (!cajaSel) {
      toast.error('Elige una caja');
      return;
    }
    start(async () => {
      try {
        // Siempre se manda la caja elegida: el servidor la guarda como la nueva
        // predeterminada, asi que el proximo turno ya arranca con esta.
        await abrirSesion({
          monto_apertura: n,
          caja_id: cajaSel,
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
              {/* Texto y no un <Input readOnly>: un campo que se ve editable y
                  no lo es hace que la gente intente cambiar el cajero desde
                  acá. El turno es de quien inició sesión —suya es la plata del
                  cajón y suyo el cuadre al cerrar—, así que para cambiar de
                  cajero hay que cambiar de usuario. */}
              <div className="mt-1 flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-corp-900">
                {cajeroNombre}
              </div>
            </div>
            <div>
              <Label className="text-xs">Caja <span className="text-rose-600">*</span></Label>
              {cajasDisponibles.length === 0 ? (
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
                    <option value="">— Elige una caja —</option>
                    {cajasDisponibles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} · {c.nombre}
                      </option>
                    ))}
                  </select>
                  {sinCajaAsignada ? (
                    <p className="mt-1 text-[10px] text-slate-500">
                      No tienes caja asignada. La que elijas queda como tu predeterminada.
                    </p>
                  ) : cambioDeCaja ? (
                    <p className="mt-1 text-[10px] font-medium text-amber-700">
                      Cambias de {cajaNombre}. Vas a vender con el stock y las series de esta otra
                      tienda, y queda como tu caja predeterminada.
                    </p>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Tu caja habitual. Puedes cambiarla si hoy cubres otra tienda.
                    </p>
                  )}
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

        <p className="mt-3 text-[11px] text-slate-500">
          El turno queda a nombre de quien inició sesión, porque suyo es el dinero del cajón y suyo
          el cuadre al cerrar.{' '}
          <button
            type="button"
            onClick={() => {
              if (!confirm(`Vas a salir de la cuenta de ${cajeroNombre} para que entre otra persona. ¿Continuamos?`)) return;
              void cerrarSesionUsuario();
            }}
            className="font-medium text-happy-600 underline underline-offset-2 hover:text-happy-700"
          >
            ¿Es otra persona? Cambiar de usuario
          </button>
        </p>

        <Button
          onClick={submit}
          variant="premium"
          size="lg"
          disabled={pending || !cajaSel || cajasDisponibles.length === 0}
          className="mt-6 w-full"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Abrir caja
        </Button>
      </Card>
    </div>
  );
}
