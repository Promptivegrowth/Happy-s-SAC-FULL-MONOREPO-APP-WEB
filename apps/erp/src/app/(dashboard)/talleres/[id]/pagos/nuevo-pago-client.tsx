'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { crearPagoTaller } from '@/server/actions/pagos-talleres';

const MEDIOS = [
  { value: 'TRANSFERENCIA', label: 'Transferencia bancaria' },
  { value: 'YAPE', label: 'Yape' },
  { value: 'PLIN', label: 'Plin' },
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'DEPOSITO', label: 'Depósito en ventanilla' },
  { value: 'OTRO', label: 'Otro' },
] as const;

type OS = { id: string; numero: string; monto_total: number; estado: string };

export function NuevoPagoButton({
  tallerId,
  tallerNombre,
  bancoDefault,
  ordenesServicio,
}: {
  tallerId: string;
  tallerNombre: string;
  bancoDefault: string;
  ordenesServicio: OS[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(today);
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState<typeof MEDIOS[number]['value']>('TRANSFERENCIA');
  const [bancoDestino, setBancoDestino] = useState(bancoDefault);
  const [numeroOp, setNumeroOp] = useState('');
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [osId, setOsId] = useState('');
  const [concepto, setConcepto] = useState('');
  const [observacion, setObservacion] = useState('');

  function reset() {
    setFecha(today);
    setMonto('');
    setMedio('TRANSFERENCIA');
    setBancoDestino(bancoDefault);
    setNumeroOp('');
    setComprobanteUrl('');
    setOsId('');
    setConcepto('');
    setObservacion('');
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function submit() {
    if (!fecha) return toast.error('Fecha requerida');
    const m = Number(monto);
    if (!m || m <= 0) return toast.error('Monto inválido');

    const fd = new FormData();
    fd.set('taller_id', tallerId);
    fd.set('fecha', fecha);
    fd.set('monto', String(m));
    fd.set('medio_pago', medio);
    fd.set('banco_destino', bancoDestino);
    fd.set('numero_operacion', numeroOp);
    fd.set('comprobante_url', comprobanteUrl);
    fd.set('os_id', osId);
    fd.set('concepto', concepto);
    fd.set('observacion', observacion);

    start(async () => {
      const r = await crearPagoTaller(null, fd);
      if (r.ok) {
        toast.success('Pago registrado');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo registrar el pago');
      }
    });
  }

  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Registrar pago
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar pago al taller</DialogTitle>
            <DialogDescription>
              Pago a <strong>{tallerNombre}</strong>. Queda registrado para reportes y trazabilidad.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fecha">Fecha del pago</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="monto">Monto (S/)</Label>
              <Input
                id="monto"
                type="number"
                step="0.01"
                min="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                disabled={pending}
                placeholder="450.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="medio">Medio de pago</Label>
              <select
                id="medio"
                value={medio}
                onChange={(e) => setMedio(e.target.value as typeof medio)}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {MEDIOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banco">Banco destino</Label>
              <Input
                id="banco"
                value={bancoDestino}
                onChange={(e) => setBancoDestino(e.target.value)}
                disabled={pending}
                placeholder="BCP"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numop">Nº operación / voucher</Label>
              <Input
                id="numop"
                value={numeroOp}
                onChange={(e) => setNumeroOp(e.target.value)}
                disabled={pending}
                placeholder="000123456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp">URL del comprobante (opcional)</Label>
              <Input
                id="comp"
                value={comprobanteUrl}
                onChange={(e) => setComprobanteUrl(e.target.value)}
                disabled={pending}
                placeholder="https://..."
              />
            </div>
          </div>

          {ordenesServicio.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="os">Vincular a Orden de Servicio (opcional)</Label>
              <select
                id="os"
                value={osId}
                onChange={(e) => setOsId(e.target.value)}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— Sin vincular —</option>
                {ordenesServicio.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.numero} · S/ {o.monto_total.toFixed(2)} · {o.estado}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500">
                Si el pago corresponde a una OS específica, vinculala. Sino, dejalo vacío y usá "Concepto".
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="concepto">Concepto</Label>
            <Input
              id="concepto"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              disabled={pending}
              placeholder="Ej: Pago semana 18 · 30 prendas costura"
              maxLength={300}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="obs">Observación (opcional)</Label>
            <Input
              id="obs"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              disabled={pending}
              maxLength={500}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="premium" onClick={submit} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Registrando…
                </>
              ) : (
                'Registrar pago'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
