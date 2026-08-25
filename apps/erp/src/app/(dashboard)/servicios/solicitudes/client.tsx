'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@happy/ui/dialog';
import { Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { aprobarSolicitudOS, rechazarSolicitudOS } from '@/server/actions/corte';

export function AprobarRechazarSolicitud({
  solicitudId,
  esCampana,
  campanaUnit,
  movilidadUnit,
}: {
  solicitudId: string;
  esCampana: boolean;
  campanaUnit: number;
  movilidadUnit: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accion, setAccion] = useState<'aprobar' | 'rechazar' | null>(null);
  const [openAprobar, setOpenAprobar] = useState(false);
  // Gerencia puede EDITAR el monto al aprobar (pedido cliente 2026-08-24).
  const [campana, setCampana] = useState(String(campanaUnit ?? 0));
  const [movilidad, setMovilidad] = useState(String(movilidadUnit ?? 0));

  function confirmarAprobar() {
    setAccion('aprobar');
    start(async () => {
      const r = await aprobarSolicitudOS(solicitudId, {
        campana_por_unidad: esCampana ? Number(campana) : undefined,
        movilidad_por_unidad: Number(movilidad),
      });
      if (r.ok) { toast.success('Solicitud aprobada · OS generada'); setOpenAprobar(false); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo aprobar');
      setAccion(null);
    });
  }

  function rechazar() {
    const motivo = prompt('Motivo del rechazo (se le avisará al solicitante):');
    if (motivo === null) return;
    setAccion('rechazar');
    start(async () => {
      const r = await rechazarSolicitudOS(solicitudId, motivo);
      if (r.ok) { toast.success('Solicitud rechazada'); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo rechazar');
      setAccion(null);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button variant="premium" size="sm" className="h-7 gap-1 px-2" onClick={() => setOpenAprobar(true)} disabled={pending}>
        <Check className="h-3 w-3" /> Aprobar
      </Button>
      <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-danger" onClick={rechazar} disabled={pending}>
        {pending && accion === 'rechazar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />} Rechazar
      </Button>

      <Dialog open={openAprobar} onOpenChange={setOpenAprobar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Aprobar solicitud</DialogTitle>
            <DialogDescription>
              Puedes ajustar el monto antes de aprobar. Al confirmar, la OS se genera automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {esCampana ? (
              <div className="space-y-1.5">
                <Label htmlFor="campana">Campaña por unidad (S/)</Label>
                <Input id="campana" type="number" step="0.01" min={0} value={campana}
                  onChange={(e) => setCampana(e.target.value)} disabled={pending} />
                <p className="text-[11px] text-slate-500">Solicitado: S/ {Number(campanaUnit).toFixed(2)}. Puedes cambiarlo (ej. 0.60 → 0.90).</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="movilidad">Movilidad por unidad (S/)</Label>
                <Input id="movilidad" type="number" step="0.01" min={0} value={movilidad}
                  onChange={(e) => setMovilidad(e.target.value)} disabled={pending} />
                <p className="text-[11px] text-slate-500">Solicitado: S/ {Number(movilidadUnit).toFixed(2)}.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenAprobar(false)} disabled={pending}>Cancelar</Button>
            <Button variant="premium" onClick={confirmarAprobar} disabled={pending}>
              {pending && accion === 'aprobar' ? <><Loader2 className="h-4 w-4 animate-spin" /> Aprobando…</> : 'Aprobar y generar OS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
