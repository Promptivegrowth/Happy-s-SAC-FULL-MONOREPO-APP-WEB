'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { PackagePlus, Loader2, Search, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { registrarMovimientoMaterial, ajustarStockMaterial } from '@/server/actions/inventario';

type Almacen = { id: string; nombre: string; codigo: string };
type Material = { id: string; codigo: string; nombre: string; categoria: string; unidad?: string };

// Tipos de movimiento de material. El signo lo define el prefijo ENTRADA_/SALIDA_.
const TIPOS_MATERIAL = [
  { value: 'ENTRADA_COMPRA', label: '+ Compra recibida' },
  { value: 'ENTRADA_DEVOLUCION_TALLER', label: '+ Devolución de producción / taller' },
  { value: 'ENTRADA_AJUSTE', label: '+ Ingreso / ajuste' },
  { value: 'SALIDA_PRODUCCION', label: '− Salida a producción' },
  { value: 'SALIDA_TALLER_SERVICIO', label: '− Salida a taller / servicio' },
  { value: 'SALIDA_AJUSTE', label: '− Salida / ajuste' },
  { value: 'SALIDA_MERMA', label: '− Merma / baja' },
] as const;

export function MovimientoMaterialButton({
  almacenes,
  materiales,
  almacenPreseleccionado,
}: {
  almacenes: Almacen[];
  materiales: Material[];
  almacenPreseleccionado?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [search, setSearch] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [almacenId, setAlmacenId] = useState(almacenPreseleccionado ?? almacenes[0]?.id ?? '');
  const [tipo, setTipo] = useState<(typeof TIPOS_MATERIAL)[number]['value']>('ENTRADA_COMPRA');
  const [cantidad, setCantidad] = useState('');
  const [observacion, setObservacion] = useState('');

  const materialesFiltrados = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return materiales.slice(0, 50);
    return materiales
      .filter((m) => m.codigo.toLowerCase().includes(t) || m.nombre.toLowerCase().includes(t))
      .slice(0, 50);
  }, [search, materiales]);

  const seleccionado = materiales.find((m) => m.id === materialId);

  function reset() {
    setSearch(''); setMaterialId(''); setTipo('ENTRADA_COMPRA'); setCantidad(''); setObservacion('');
    setAlmacenId(almacenPreseleccionado ?? almacenes[0]?.id ?? '');
  }
  function onOpenChange(v: boolean) { setOpen(v); if (!v) reset(); }

  function submit() {
    if (!materialId) return toast.error('Seleccioná un material');
    if (!almacenId) return toast.error('Seleccioná un almacén');
    const n = Number(cantidad);
    if (Number.isNaN(n) || n <= 0) return toast.error('Cantidad inválida');
    start(async () => {
      const r = await registrarMovimientoMaterial({ almacen_id: almacenId, material_id: materialId, tipo, cantidad: n, observacion });
      if (r.ok) { toast.success(`Movimiento registrado · ${n}`); setOpen(false); reset(); router.refresh(); }
      else toast.error(r.error ?? 'Error al registrar');
    });
  }

  return (
    <>
      <Button variant="premium" className="gap-2" onClick={() => setOpen(true)}>
        <PackagePlus className="h-4 w-4" /> Movimiento de material
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Registrar movimiento de material</DialogTitle>
            <DialogDescription>
              Ingresos, compras, devoluciones de producción/servicio y salidas de telas, avíos e insumos.
              Alimenta el kardex y el stock del almacén.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mat-search">Material (buscá por código o nombre)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input id="mat-search" value={search} onChange={(e) => { setSearch(e.target.value); setMaterialId(''); }}
                  disabled={pending} placeholder="Ej. sermat, botón, TELM..." className="pl-9" />
              </div>
              <div className="max-h-48 overflow-y-auto rounded border bg-white">
                {materialesFiltrados.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">Sin coincidencias</p>
                ) : (
                  materialesFiltrados.map((m) => (
                    <button key={m.id} type="button"
                      onClick={() => { setMaterialId(m.id); setSearch(`${m.nombre}`); }}
                      className={`flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-xs transition hover:bg-happy-50 ${materialId === m.id ? 'bg-happy-100 font-semibold' : ''}`}>
                      <span className="min-w-0 truncate"><span className="font-mono text-slate-500">{m.codigo}</span> · {m.nombre}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {m.unidad && <span className="rounded bg-corp-100 px-1.5 py-0.5 text-corp-700">{m.unidad}</span>}
                        <span className="rounded bg-slate-100 px-2 py-0.5">{m.categoria}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
              {seleccionado && <p className="text-xs text-emerald-700">✓ {seleccionado.nombre} · {seleccionado.codigo}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mat-almacen">Almacén</Label>
                <select id="mat-almacen" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} disabled={pending}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-cantidad">
                  Cantidad{seleccionado?.unidad ? <span className="ml-1 font-normal text-corp-600">({seleccionado.unidad})</span> : ''}
                </Label>
                <Input id="mat-cantidad" type="number" min={0} step="0.0001" value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)} disabled={pending} placeholder="0" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mat-tipo">Tipo de movimiento</Label>
              <select id="mat-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} disabled={pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {TIPOS_MATERIAL.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mat-obs">Observación (opcional)</Label>
              <Input id="mat-obs" value={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={pending}
                placeholder="Ej. sobrante de OT-26-00030, compra directa, etc." maxLength={500} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={submit} disabled={pending || !materialId}>
              {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</> : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AjustarMaterialButton({
  almacenId, almacenNombre, materialId, materialCodigo, materialNombre, cantidadActual,
}: {
  almacenId: string; almacenNombre: string; materialId: string;
  materialCodigo: string; materialNombre: string; cantidadActual: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [valor, setValor] = useState(String(cantidadActual));
  const [obs, setObs] = useState('');

  function submit() {
    const n = Number(valor);
    if (Number.isNaN(n) || n < 0) return toast.error('Cantidad inválida');
    start(async () => {
      const r = await ajustarStockMaterial({ almacen_id: almacenId, material_id: materialId, cantidad_nueva: n, observacion: obs });
      if (r.ok) { toast.success('Stock ajustado'); setOpen(false); router.refresh(); }
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2" title="Corregir cantidad" onClick={() => { setValor(String(cantidadActual)); setOpen(true); }}>
        <Pencil className="h-3.5 w-3.5 text-slate-500" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Corregir cantidad</DialogTitle>
            <DialogDescription>{materialNombre} · {materialCodigo} · {almacenNombre}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="aj-mat">Cantidad real (conteo físico)</Label>
              <Input id="aj-mat" type="number" min={0} step="0.0001" value={valor} onChange={(e) => setValor(e.target.value)} disabled={pending} />
              <p className="text-[11px] text-slate-500">Actual: {cantidadActual}. Se genera un ajuste por la diferencia.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aj-mat-obs">Observación (opcional)</Label>
              <Input id="aj-mat-obs" value={obs} onChange={(e) => setObs(e.target.value)} disabled={pending} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
