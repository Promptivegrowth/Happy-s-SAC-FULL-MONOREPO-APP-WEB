'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Loader2, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ComboboxBusqueda } from './form-client';
import { crearCorte } from '@/server/actions/corte';

export type Operario = { id: string; codigo: string; nombre: string };
export type Producto = { id: string; codigo: string; nombre: string };

/**
 * Una OT con sus productos planificados. En el flujo normal cada OT tiene
 * 1 solo producto (las OT se generan así desde el plan), pero soportamos
 * el caso de múltiples por seguridad.
 */
export type OtConProductos = {
  id: string;
  numero: string;
  productos: Producto[];
};

export function NuevoCorteForm({
  ots,
  operarios,
  defaultOtId,
}: {
  ots: OtConProductos[];
  operarios: Operario[];
  defaultOtId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [otId, setOtId] = useState(defaultOtId ?? '');
  const [productoId, setProductoId] = useState('');
  const [operarioId, setOperarioId] = useState('');
  const [capas, setCapas] = useState('');
  const [metros, setMetros] = useState('');
  const [mermaMetros, setMermaMetros] = useState('');
  const [observacion, setObservacion] = useState('');

  const otSel = useMemo(() => ots.find((o) => o.id === otId) ?? null, [ots, otId]);
  const productosDeOt = otSel?.productos ?? [];
  // Producto efectivo: si la OT tiene 1 solo producto, ese gana. Si tiene
  // varios, usa el seleccionado por el usuario.
  const productoEfectivo = useMemo(() => {
    if (!otSel) return null;
    if (productosDeOt.length === 1) return productosDeOt[0];
    return productosDeOt.find((p) => p.id === productoId) ?? null;
  }, [otSel, productosDeOt, productoId]);

  const otOptions = ots.map((o) => ({ id: o.id, label: o.numero }));
  const opOptions = operarios.map((o) => ({
    id: o.id,
    label: o.nombre || o.codigo,
    sublabel: o.codigo,
  }));
  const productoOptions = productosDeOt.map((p) => ({
    id: p.id,
    label: p.nombre,
    sublabel: p.codigo,
  }));

  function submit() {
    if (!otId) return toast.error('Seleccioná una OT');
    if (!productoEfectivo) {
      return toast.error(
        productosDeOt.length > 1
          ? 'Esta OT tiene varios productos: elegí uno'
          : 'La OT seleccionada no tiene líneas con producto',
      );
    }
    const fd = new FormData();
    fd.set('ot_id', otId);
    fd.set('producto_id', productoEfectivo.id);
    if (operarioId) fd.set('responsable_operario_id', operarioId);
    fd.set('capas_tendidas', capas || '0');
    fd.set('metros_consumidos', metros || '0');
    fd.set('merma_metros', mermaMetros || '0');
    if (observacion) fd.set('observacion', observacion);

    start(async () => {
      const r = await crearCorte(null, fd);
      if (r.ok && r.data) {
        toast.success('Corte creado');
        router.push(`/corte/${r.data.id}`);
      } else if (!r.ok) {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <Card className="max-w-3xl p-6">
      <div className="space-y-6">
        <FormGrid cols={2}>
          <FormRow label="OT" required hint="El modelo se toma de la OT">
            <ComboboxBusqueda
              options={otOptions}
              value={otId}
              onChange={(id) => { setOtId(id); setProductoId(''); }}
              placeholder="Buscar OT por número…"
            />
          </FormRow>
          <FormRow label="Modelo" hint={otSel ? 'Auto-derivado de la OT' : 'Elegí una OT primero'}>
            {!otSel ? (
              <div className="flex h-10 items-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">
                Esperando OT…
              </div>
            ) : productosDeOt.length === 0 ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                La OT no tiene líneas planificadas
              </div>
            ) : productosDeOt.length === 1 ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-happy-300 bg-happy-50/40 px-3 text-sm">
                <Package className="h-4 w-4 text-happy-600" />
                <span className="font-medium text-corp-900">{productoEfectivo!.nombre}</span>
                <span className="ml-auto font-mono text-[10px] text-slate-500">{productoEfectivo!.codigo}</span>
              </div>
            ) : (
              <ComboboxBusqueda
                options={productoOptions}
                value={productoId}
                onChange={setProductoId}
                placeholder="Esta OT tiene varios productos — elegí uno"
              />
            )}
          </FormRow>
          <FormRow label="Responsable (operario)">
            <ComboboxBusqueda
              options={opOptions}
              value={operarioId}
              onChange={setOperarioId}
              placeholder="Buscar operario…"
            />
          </FormRow>
          <FormRow label="Capas tendidas" hint="Cantidad de capas que se tendieron">
            <Input
              type="number"
              min={0}
              value={capas}
              onChange={(e) => setCapas(e.target.value)}
              placeholder="0"
            />
          </FormRow>
          <FormRow label="Metros consumidos" hint="Total de tela usada en este corte">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={metros}
              onChange={(e) => setMetros(e.target.value)}
              placeholder="0.00"
            />
          </FormRow>
          <FormRow label="Merma (metros)" hint="Tela perdida por desperdicio del trazo">
            <Input
              type="number"
              step="0.01"
              min={0}
              value={mermaMetros}
              onChange={(e) => setMermaMetros(e.target.value)}
              placeholder="0.00"
            />
          </FormRow>
        </FormGrid>
        <FormRow label="Observación">
          <Textarea
            rows={2}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </FormRow>
        {otSel && productosDeOt.length === 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            La OT seleccionada no tiene líneas — no se puede liquidar corte sobre ella. Cargá líneas en la OT primero.
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            variant="premium"
            size="lg"
            onClick={submit}
            disabled={pending || !otId || !productoEfectivo}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Crear corte
          </Button>
        </div>
        {otSel && productoEfectivo && (
          <p className="text-[11px] text-slate-500">
            Después de crear el corte, vas a poder cargar las cantidades cortadas por talla. Las cantidades teóricas se proponen automáticamente desde el plan de la OT (<Badge variant="secondary" className="text-[9px]">{otSel.numero}</Badge>).
          </p>
        )}
      </div>
    </Card>
  );
}
