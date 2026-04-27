'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Plus, Trash2, Loader2, CheckCircle2, Factory, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  agregarLineasPlanBatch,
  eliminarLineaPlan,
  aprobarPlan,
  generarOTsDelPlan,
  type TallaCantidad,
} from '@/server/actions/plan-maestro';

const TALLAS = ['T0', 'T2', 'T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'TS', 'TAD'] as const;

type Linea = {
  id: string;
  producto_id: string;
  talla: string;
  cantidad_planificada: number;
  prioridad: number | null;
  productos?: { codigo: string; nombre: string } | null;
};

export function LineasEditor({
  planId,
  lineas,
  productos,
  isEditable,
}: {
  planId: string;
  lineas: Linea[];
  productos: { id: string; codigo: string; nombre: string }[];
  isEditable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState('');
  const [productoSel, setProductoSel] = useState('');
  const [prioridad, setPrioridad] = useState(100);
  // Map de talla → cantidad. Si la talla no está, no se incluye.
  const [tallasSel, setTallasSel] = useState<Record<string, number>>({});

  const filtrados = useMemo(
    () =>
      productos
        .filter(
          (p) =>
            !busca ||
            p.nombre.toLowerCase().includes(busca.toLowerCase()) ||
            p.codigo.toLowerCase().includes(busca.toLowerCase()),
        )
        .slice(0, 100),
    [productos, busca],
  );

  // Tallas que ya están en el plan para este producto (para deshabilitarlas).
  const tallasYaExistentes = useMemo(() => {
    if (!productoSel) return new Set<string>();
    return new Set(lineas.filter((l) => l.producto_id === productoSel).map((l) => l.talla));
  }, [lineas, productoSel]);

  function toggleTalla(t: string) {
    if (tallasYaExistentes.has(t)) return;
    setTallasSel((prev) => {
      const copy = { ...prev };
      if (t in copy) delete copy[t];
      else copy[t] = 50;
      return copy;
    });
  }

  function setCantidad(t: string, c: number) {
    setTallasSel((prev) => ({ ...prev, [t]: Math.max(1, c) }));
  }

  function aplicarCantidadATodas(c: number) {
    setTallasSel((prev) => {
      const copy = { ...prev };
      for (const t of Object.keys(copy)) copy[t] = Math.max(1, c);
      return copy;
    });
  }

  function reset() {
    setProductoSel('');
    setBusca('');
    setPrioridad(100);
    setTallasSel({});
  }

  function submit() {
    if (!productoSel) return toast.error('Selecciona un producto');
    const tallas = Object.entries(tallasSel)
      .filter(([, c]) => c > 0)
      .map(([talla, cantidad]) => ({ talla: talla as (typeof TALLAS)[number], cantidad }));
    if (tallas.length === 0) return toast.error('Selecciona al menos una talla con cantidad');

    start(async () => {
      const r = await agregarLineasPlanBatch({
        plan_id: planId,
        producto_id: productoSel,
        prioridad,
        tallas: tallas as TallaCantidad[],
      });
      if (r.ok && r.data) {
        toast.success(
          r.data.duplicadas > 0
            ? `${r.data.insertadas} líneas agregadas (${r.data.duplicadas} duplicadas omitidas)`
            : `${r.data.insertadas} líneas agregadas`,
        );
        reset();
        setOpen(false);
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  function remove(id: string) {
    if (!confirm('¿Eliminar esta línea?')) return;
    start(async () => {
      const r = await eliminarLineaPlan(id, planId);
      if (r.ok) toast.success('Eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  const totalUnidadesNuevas = Object.values(tallasSel).reduce((a, b) => a + (b || 0), 0);
  const productoElegido = productos.find((p) => p.id === productoSel);

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-corp-900">Líneas del plan</h3>
        {isEditable && !open && (
          <Button variant="premium" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Agregar líneas
          </Button>
        )}
      </div>

      {open && (
        <Card className="mb-4 border-happy-300 bg-happy-50/40 p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-display text-sm font-semibold text-corp-900">
                Agregar producto + tallas
              </h4>
              <Button variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }} disabled={pending}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Step 1: producto */}
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                1. Producto
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar producto por nombre o código…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              {productoSel && productoElegido && (
                <div className="mt-2 flex items-center gap-2 rounded-md border border-happy-300 bg-white px-3 py-2 text-sm">
                  <Badge variant="success" className="text-[10px]">Seleccionado</Badge>
                  <span className="font-mono text-xs text-slate-500">{productoElegido.codigo}</span>
                  <span className="font-medium">{productoElegido.nombre}</span>
                  <button
                    type="button"
                    onClick={() => { setProductoSel(''); setTallasSel({}); }}
                    className="ml-auto text-slate-400 hover:text-danger"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {!productoSel && filtrados.length > 0 && busca.length > 0 && (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border bg-white">
                  {filtrados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setProductoSel(p.id); setBusca(''); }}
                      className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50"
                    >
                      <span className="font-mono text-[10px] text-slate-500">{p.codigo}</span>
                      <span className="font-medium">{p.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: tallas múltiples */}
            {productoSel && (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    2. Selecciona las tallas (click para agregar/quitar)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TALLAS.map((t) => {
                      const yaExiste = tallasYaExistentes.has(t);
                      const seleccionada = t in tallasSel;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTalla(t)}
                          disabled={yaExiste}
                          title={yaExiste ? 'Ya existe en el plan' : seleccionada ? 'Quitar' : 'Agregar'}
                          className={`min-w-[44px] rounded-md border px-3 py-2 text-sm font-medium transition ${
                            yaExiste
                              ? 'cursor-not-allowed border-dashed border-slate-300 bg-slate-100 text-slate-400 line-through'
                              : seleccionada
                                ? 'border-happy-500 bg-happy-500 text-white shadow-sm'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-happy-400'
                          }`}
                        >
                          {t.replace('T', '')}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Las tallas tachadas ya están en el plan para este producto.
                  </p>
                </div>

                {/* Step 3: cantidades */}
                {Object.keys(tallasSel).length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        3. Cantidad por talla
                      </label>
                      <button
                        type="button"
                        onClick={() => aplicarCantidadATodas(50)}
                        className="text-[11px] font-medium text-happy-600 hover:underline"
                      >
                        Aplicar 50 a todas
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {Object.entries(tallasSel).map(([t, c]) => (
                        <div key={t} className="flex items-center gap-2 rounded-md border bg-white px-3 py-1.5">
                          <Badge variant="outline" className="min-w-10 justify-center">
                            {t.replace('T', '')}
                          </Badge>
                          <Input
                            type="number"
                            min={1}
                            value={c}
                            onChange={(e) => setCantidad(t, Number(e.target.value))}
                            className="h-8 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => toggleTalla(t)}
                            className="text-slate-400 hover:text-danger"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 4: prioridad + acciones */}
            {productoSel && Object.keys(tallasSel).length > 0 && (
              <FormGrid cols={2}>
                <FormRow label="Prioridad" hint="Menor = más prioritario">
                  <Input
                    type="number"
                    min={0}
                    value={prioridad}
                    onChange={(e) => setPrioridad(Number(e.target.value))}
                  />
                </FormRow>
                <div className="flex items-end justify-end gap-2">
                  <Badge variant="success" className="text-[11px]">
                    {Object.keys(tallasSel).length} talla{Object.keys(tallasSel).length === 1 ? '' : 's'} ·{' '}
                    {totalUnidadesNuevas} unid total
                  </Badge>
                </div>
              </FormGrid>
            )}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={pending}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="premium"
                onClick={submit}
                disabled={pending || !productoSel || Object.keys(tallasSel).length === 0}
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Agregar {Object.keys(tallasSel).length > 0 ? `${Object.keys(tallasSel).length} línea${Object.keys(tallasSel).length === 1 ? '' : 's'}` : ''}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {lineas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-400">
          Sin líneas. Agrega productos al plan.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-mono text-xs">{l.productos?.codigo}</TableCell>
                <TableCell className="font-medium">{l.productos?.nombre}</TableCell>
                <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>
                <TableCell className="text-right font-mono">{l.cantidad_planificada}</TableCell>
                <TableCell>{l.prioridad ?? 100}</TableCell>
                <TableCell className="text-right">
                  {isEditable && (
                    <Button variant="ghost" size="sm" onClick={() => remove(l.id)} disabled={pending}>
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

export function AccionesPlan({ planId, estado, hayLineas }: { planId: string; estado: string; hayLineas: boolean }) {
  const [pending, start] = useTransition();

  function aprobar() {
    if (!confirm('¿Aprobar el plan? Después no se podrán editar líneas.')) return;
    start(async () => {
      const r = await aprobarPlan(planId);
      if (r.ok) toast.success('Plan aprobado');
      else toast.error(r.error ?? 'Error');
    });
  }

  function generar() {
    if (!confirm('Esto generará una OT por cada producto del plan. ¿Continuar?')) return;
    start(async () => {
      const r = await generarOTsDelPlan(planId);
      if (r.ok && r.data) toast.success(`${r.data.otsCreadas} OT(s) generadas`);
      else toast.error(r.error ?? 'Error');
    });
  }

  if (estado === 'BORRADOR') {
    return (
      <Button
        onClick={aprobar}
        disabled={pending || !hayLineas}
        title={!hayLineas ? 'Agrega al menos una línea para poder aprobar' : 'Aprobar plan'}
        variant="premium-corp"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Aprobar plan
      </Button>
    );
  }
  if (estado === 'APROBADO') {
    return (
      <Button onClick={generar} disabled={pending} variant="premium">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Factory className="h-4 w-4" />}
        Generar OTs
      </Button>
    );
  }
  return null;
}
