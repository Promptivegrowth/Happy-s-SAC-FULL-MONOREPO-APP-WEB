'use client';

import { useState, useTransition } from 'react';
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
import { Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ajustarStock } from '@/server/actions/inventario';

type Props = {
  almacenId: string;
  almacenNombre: string;
  varianteId: string;
  sku: string;
  productoNombre: string;
  talla: string;
  cantidadActual: number;
};

const MOTIVOS = [
  { value: 'CONTEO', label: 'Conteo físico (corregir al valor real)' },
  { value: 'INGRESO', label: 'Ingreso de mercadería' },
  { value: 'MERMA', label: 'Merma o descarte' },
  { value: 'OTRO', label: 'Otro' },
] as const;

export function AjustarStockButton(props: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [nuevaCantidad, setNuevaCantidad] = useState(String(props.cantidadActual));
  const [motivo, setMotivo] = useState<typeof MOTIVOS[number]['value']>('CONTEO');
  const [observacion, setObservacion] = useState('');

  function reset() {
    setNuevaCantidad(String(props.cantidadActual));
    setMotivo('CONTEO');
    setObservacion('');
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function submit() {
    const n = Number(nuevaCantidad);
    if (Number.isNaN(n) || n < 0) {
      toast.error('Cantidad inválida');
      return;
    }
    start(async () => {
      const r = await ajustarStock({
        almacen_id: props.almacenId,
        variante_id: props.varianteId,
        cantidad_nueva: n,
        motivo,
        observacion,
      });
      if (r.ok && r.data) {
        if (r.data.delta === 0) {
          toast.info('Sin cambios — la cantidad ya era esa');
        } else {
          const sentido = r.data.delta > 0 ? `+${r.data.delta}` : `${r.data.delta}`;
          toast.success(`Stock ajustado · ${sentido} unidades · total ${r.data.cantidad_final}`);
        }
        setOpen(false);
      } else {
        toast.error(r.error ?? 'Error al ajustar stock');
      }
    });
  }

  const delta = Number(nuevaCantidad) - props.cantidadActual;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="Ajustar stock"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar stock</DialogTitle>
            <DialogDescription>
              {props.productoNombre} · talla {props.talla.replace('T', '')} · SKU {props.sku} ·
              almacén {props.almacenNombre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Stock actual:</span>
                <span className="font-mono font-bold text-corp-900">{props.cantidadActual}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cantidad">Nueva cantidad (valor final)</Label>
              <Input
                id="cantidad"
                type="number"
                min={0}
                step={1}
                value={nuevaCantidad}
                onChange={(e) => setNuevaCantidad(e.target.value)}
                disabled={pending}
                autoFocus
              />
              {delta !== 0 && (
                <p className={`text-xs ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {delta > 0 ? `Se sumarán +${delta} unidades (entrada)` : `Se restarán ${Math.abs(delta)} unidades (salida)`}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="motivo">Motivo</Label>
              <select
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as typeof motivo)}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observacion">Observación (opcional)</Label>
              <Input
                id="observacion"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                disabled={pending}
                placeholder="Ej. inventario mensual, devolución cliente, etc."
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || delta === 0}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aplicando…
                </>
              ) : (
                'Aplicar ajuste'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
