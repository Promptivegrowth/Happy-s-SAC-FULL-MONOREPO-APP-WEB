'use client';

import { useMemo, useState, useTransition } from 'react';
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
import { PackagePlus, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { registrarMovimientoStock } from '@/server/actions/inventario';

type Almacen = { id: string; nombre: string; codigo: string };
type Variante = { id: string; sku: string; talla: string; producto_nombre: string };

const TIPOS = [
  { value: 'ENTRADA_COMPRA', label: '+ Ingreso compra (entrada por compra a proveedor)' },
  { value: 'ENTRADA_AJUSTE', label: '+ Ajuste manual (entrada — agregar stock)' },
  { value: 'ENTRADA_DEVOLUCION_CLIENTE', label: '+ Devolución de cliente' },
  { value: 'ENTRADA_DEVOLUCION_TALLER', label: '+ Devolución de taller' },
  { value: 'SALIDA_AJUSTE', label: '− Ajuste manual (salida — quitar stock)' },
  { value: 'SALIDA_MERMA', label: '− Merma / descarte' },
] as const;

export function NuevoMovimientoButton({
  almacenes,
  variantes,
}: {
  almacenes: Almacen[];
  variantes: Variante[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState('');
  const [varianteId, setVarianteId] = useState<string>('');
  const [almacenId, setAlmacenId] = useState<string>(almacenes[0]?.id ?? '');
  const [tipo, setTipo] = useState<typeof TIPOS[number]['value']>('ENTRADA_AJUSTE');
  const [cantidad, setCantidad] = useState('5');
  const [observacion, setObservacion] = useState('');

  // Filtro client-side de variantes (label + sku)
  const variantesFiltradas = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return variantes.slice(0, 50);
    return variantes
      .filter(
        (v) =>
          v.sku.toLowerCase().includes(t) ||
          v.producto_nombre.toLowerCase().includes(t) ||
          v.talla.toLowerCase().includes(t),
      )
      .slice(0, 50);
  }, [search, variantes]);

  const seleccionada = variantes.find((v) => v.id === varianteId);

  function reset() {
    setSearch('');
    setVarianteId('');
    setTipo('ENTRADA_AJUSTE');
    setCantidad('5');
    setObservacion('');
  }

  function onOpenChange(v: boolean) {
    setOpen(v);
    if (!v) reset();
  }

  function submit() {
    if (!varianteId) {
      toast.error('Seleccioná una variante');
      return;
    }
    if (!almacenId) {
      toast.error('Seleccioná un almacén');
      return;
    }
    const n = Number(cantidad);
    if (Number.isNaN(n) || n <= 0) {
      toast.error('Cantidad inválida');
      return;
    }
    start(async () => {
      const r = await registrarMovimientoStock({
        almacen_id: almacenId,
        variante_id: varianteId,
        tipo,
        cantidad: n,
        observacion,
      });
      if (r.ok) {
        toast.success(`Movimiento ${tipo} · ${n} unidades registradas`);
        setOpen(false);
      } else {
        toast.error(r.error ?? 'Error al registrar');
      }
    });
  }

  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <PackagePlus className="h-4 w-4" /> Nuevo movimiento
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nuevo movimiento de stock</DialogTitle>
            <DialogDescription>
              Genera un movimiento en kardex y actualiza stock_actual automáticamente. Sirve también para variantes que aún no tienen stock en este almacén.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Buscador + selección de variante */}
            <div className="space-y-1.5">
              <Label htmlFor="search">Variante (buscá por SKU, producto o talla)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setVarianteId('');
                  }}
                  disabled={pending}
                  placeholder="Ej. PRIN-T4, princesa, T6…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-48 overflow-y-auto rounded border bg-white">
                {variantesFiltradas.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">Sin coincidencias</p>
                ) : (
                  variantesFiltradas.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVarianteId(v.id);
                        setSearch(`${v.producto_nombre} · ${v.talla.replace('T', '')}`);
                      }}
                      className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-xs transition hover:bg-happy-50 ${
                        varianteId === v.id ? 'bg-happy-100 font-semibold' : ''
                      }`}
                    >
                      <span>
                        <span className="font-mono text-slate-500">{v.sku}</span> ·{' '}
                        {v.producto_nombre}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono">
                        {v.talla.replace('T', '')}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {seleccionada && (
                <p className="text-xs text-emerald-700">
                  ✓ {seleccionada.producto_nombre} · talla {seleccionada.talla.replace('T', '')} ·{' '}
                  {seleccionada.sku}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="almacen">Almacén destino</Label>
                <select
                  id="almacen"
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  disabled={pending}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cantidad">Cantidad</Label>
                <Input
                  id="cantidad"
                  type="number"
                  min={0}
                  step={1}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo de movimiento</Label>
              <select
                id="tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as typeof tipo)}
                disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
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
                placeholder="Ej. compra OC-1234, devolución cliente Pérez, etc."
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending || !varianteId}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Registrando…
                </>
              ) : (
                'Registrar movimiento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
