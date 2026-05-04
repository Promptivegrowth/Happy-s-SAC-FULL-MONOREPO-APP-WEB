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
import { ComboboxBusqueda } from '../../../corte/nuevo/form-client';
import { crearTarifa } from '@/server/actions/tarifas-talleres';

const PROCESOS = [
  'TRAZADO', 'TENDIDO', 'CORTE', 'HABILITADO', 'COSTURA', 'BORDADO', 'ESTAMPADO',
  'SUBLIMADO', 'PLISADO', 'ACABADO', 'PLANCHADO', 'OJAL_BOTON', 'CONTROL_CALIDAD',
  'EMBALAJE', 'DECORADO',
] as const;
const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

type Producto = { id: string; codigo: string; nombre: string };

export function NuevaTarifaButton({ tallerId, productos }: { tallerId: string; productos: Producto[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [productoId, setProductoId] = useState('');
  const [proceso, setProceso] = useState('');
  const [talla, setTalla] = useState('');
  const [precio, setPrecio] = useState('');
  const [observacion, setObservacion] = useState('');

  function reset() {
    setProductoId('');
    setProceso('');
    setTalla('');
    setPrecio('');
    setObservacion('');
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function submit() {
    const p = Number(precio);
    if (!p || p <= 0) {
      toast.error('Tarifa inválida');
      return;
    }
    start(async () => {
      const r = await crearTarifa({
        taller_id: tallerId,
        producto_id: productoId || '',
        proceso: (proceso || '') as (typeof PROCESOS)[number] | '',
        talla: (talla || '') as (typeof TALLAS)[number] | '',
        precio_unitario: p,
        observacion,
      });
      if (r.ok) {
        toast.success('Tarifa creada');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error al crear tarifa');
      }
    });
  }

  const productoOptions = productos.map((p) => ({
    id: p.id,
    label: p.nombre,
    sublabel: p.codigo,
  }));

  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nueva tarifa
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva tarifa</DialogTitle>
            <DialogDescription>
              Dejá un campo vacío para que aplique a CUALQUIER valor de ese campo. Tip: empezá por
              "Solo proceso" (ej. COSTURA = S/ 4.50) y agregá excepciones después.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Producto (opcional, vacío = todos)</Label>
              <ComboboxBusqueda
                options={productoOptions}
                value={productoId}
                onChange={setProductoId}
                placeholder="Buscar producto…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proceso">Proceso (opcional)</Label>
                <select
                  id="proceso"
                  value={proceso}
                  onChange={(e) => setProceso(e.target.value)}
                  disabled={pending}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Cualquier proceso —</option>
                  {PROCESOS.map((p) => (
                    <option key={p} value={p}>
                      {p.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="talla">Talla (opcional)</Label>
                <select
                  id="talla"
                  value={talla}
                  onChange={(e) => setTalla(e.target.value)}
                  disabled={pending}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Cualquier talla —</option>
                  {TALLAS.map((t) => (
                    <option key={t} value={t}>{t.replace('T', '')}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="precio">Tarifa por unidad (S/)</Label>
              <Input
                id="precio"
                type="number"
                step="0.01"
                min="0"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                disabled={pending}
                placeholder="4.50"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs">Notas (opcional)</Label>
              <Input
                id="obs"
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                disabled={pending}
                placeholder="Ej: incluye plancha. Vigente Q2 2026."
                maxLength={300}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="premium" onClick={submit} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creando…
                </>
              ) : (
                'Crear tarifa'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
