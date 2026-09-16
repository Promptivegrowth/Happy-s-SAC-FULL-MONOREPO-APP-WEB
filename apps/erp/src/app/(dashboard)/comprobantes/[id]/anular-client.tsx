'use client';

/**
 * Botón para anular una boleta.
 *
 * Pide un motivo obligatorio: es lo único que después explica por qué falta un
 * número en la secuencia, y quien pregunte va a ser SUNAT o el contador, no el
 * que la anuló.
 *
 * Avisa antes de hacerlo qué va a pasar con la mercadería y con la plata,
 * porque anular no es solo tachar un papel: el stock vuelve al almacén y la
 * venta deja de contar en la caja.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Label } from '@happy/ui/label';
import { Ban, Loader2, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { anularBoleta } from '@/server/actions/anular-comprobante';

export function AnularBoletaButton({
  comprobanteId,
  numero,
  yaAceptada,
}: {
  comprobanteId: string;
  numero: string;
  /** Si SUNAT ya la aceptó, la baja va en el resumen del día siguiente. */
  yaAceptada: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [pendiente, start] = useTransition();

  function confirmar() {
    if (motivo.trim().length < 5) {
      toast.error('Escribe el motivo de la anulación');
      return;
    }
    start(async () => {
      const r = await anularBoleta({ comprobanteId, motivo: motivo.trim() });
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo anular');
        return;
      }
      const d = r.data;
      toast.success(
        `${d?.numero} anulada. ` +
          (d?.unidadesDevueltas
            ? `${d.unidadesDevueltas} unidad(es) devueltas al almacén. `
            : '') +
          'La baja se comunica a SUNAT en el resumen de esta noche.',
        { duration: 9000 },
      );
      if (d?.cajaCerrada) {
        toast.warning(
          'La caja de ese turno ya estaba cerrada: la devolución del dinero hay que ' +
            'registrarla como egreso de caja chica en el turno actual.',
          { duration: 12000 },
        );
      }
      setAbierto(false);
      setMotivo('');
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Button variant="outline" onClick={() => setAbierto(true)} className="gap-2">
        <Ban className="h-4 w-4" /> Anular boleta
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Ban className="h-5 w-5 text-red-600" /> Anular {numero}
          </h2>
          <button
            onClick={() => setAbierto(false)}
            disabled={pendiente}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-start gap-2 font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Esto no se puede deshacer
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>La mercadería vuelve al stock del almacén donde se vendió.</li>
            <li>La venta deja de contar en el cuadre de caja.</li>
            <li>
              {yaAceptada
                ? 'SUNAT ya aceptó esta boleta: la baja se le comunica en el próximo resumen diario.'
                : 'Todavía no se había informado a SUNAT: irá como anulada en el resumen de esta noche.'}
            </li>
            <li>El número queda usado: no se reutiliza para otra venta.</li>
          </ul>
        </div>

        <div className="mt-4">
          <Label htmlFor="motivo">Motivo de la anulación</Label>
          <textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            disabled={pendiente}
            placeholder="Ej.: el cliente pidió factura / se cargó un monto equivocado / se emitió dos veces"
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Queda guardado junto al comprobante. Es lo que después explica por qué falta ese
            número.
          </p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAbierto(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={pendiente} className="gap-2">
            {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Anular definitivamente
          </Button>
        </div>
      </Card>
    </div>
  );
}
