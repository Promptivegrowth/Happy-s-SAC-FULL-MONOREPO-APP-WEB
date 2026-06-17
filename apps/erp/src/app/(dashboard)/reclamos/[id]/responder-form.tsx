'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { responderReclamo, cambiarEstadoReclamo } from '@/server/actions/reclamos';
import {
  transicionesEstado,
  type EstadoReclamo,
} from '@/server/actions/reclamos-helpers';

export function ResponderForm({
  id,
  estadoActual,
}: {
  id: string;
  estadoActual: EstadoReclamo;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [respuesta, setRespuesta] = useState('');

  // Solo permitimos terminar el caso desde el form (RESUELTO o DESESTIMADO).
  // El paso intermedio "marcar como EN_REVISION" tiene su propio botón.
  const transiciones = transicionesEstado(estadoActual).filter(
    (e) => e === 'RESUELTO' || e === 'DESESTIMADO',
  );
  const [nuevoEstado, setNuevoEstado] = useState<EstadoReclamo>(
    transiciones[0] ?? 'RESUELTO',
  );

  const puedeMarcarEnRevision = estadoActual === 'NUEVO';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (respuesta.trim().length < 10) {
      toast.error('La respuesta debe tener al menos 10 caracteres');
      return;
    }
    start(async () => {
      const r = await responderReclamo(id, {
        respuesta: respuesta.trim(),
        nuevo_estado: nuevoEstado as 'RESUELTO' | 'DESESTIMADO',
      });
      if (r.ok) {
        toast.success('Respuesta registrada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo registrar la respuesta');
      }
    });
  }

  function marcarEnRevision() {
    start(async () => {
      const r = await cambiarEstadoReclamo(id, 'EN_REVISION');
      if (r.ok) {
        toast.success('Reclamo marcado como EN REVISIÓN');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo actualizar');
      }
    });
  }

  return (
    <div className="space-y-3">
      {puedeMarcarEnRevision && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          <div>
            <p className="font-semibold text-blue-900">Reclamo nuevo sin tomar</p>
            <p className="text-blue-800">
              Marca como &quot;En revisión&quot; mientras preparas la respuesta formal.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={marcarEnRevision}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Marcar EN REVISIÓN
          </Button>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-[11px] font-semibold uppercase text-slate-600">
            Respuesta del proveedor *
          </label>
          <textarea
            name="respuesta"
            required
            rows={6}
            minLength={10}
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-white p-3 text-sm"
            placeholder="Explique la decisión tomada y, de corresponder, la solución ofrecida al consumidor."
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Esta respuesta queda registrada como descargo formal del proveedor (Ley 29571).
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase text-slate-600">
              Estado final *
            </span>
            <select
              value={nuevoEstado}
              onChange={(e) => setNuevoEstado(e.target.value as EstadoReclamo)}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              {transiciones.length === 0 ? (
                <option value="RESUELTO">RESUELTO</option>
              ) : (
                transiciones.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))
              )}
            </select>
          </label>
          <Button type="submit" variant="premium" size="sm" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar respuesta
          </Button>
        </div>
      </form>
    </div>
  );
}
