'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Textarea } from '@happy/ui/textarea';
import { PackagePlus, Loader2, Search, Pencil, Layers, Trash2, Zap, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  registrarMovimientoMaterial, ajustarStockMaterial,
  ajustarStockMaterialBatch, registrarMovimientoMaterialBatch, obtenerStockMateriales,
} from '@/server/actions/inventario';

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
  permitirAjuste = false,
}: {
  almacenes: Almacen[];
  materiales: Material[];
  almacenPreseleccionado?: string;
  /** Los tipos de AJUSTE solo se muestran a gerencia (pedido cliente 2026-08-24). */
  permitirAjuste?: boolean;
}) {
  // Sin permiso de gerencia, se ocultan las opciones de ajuste (entrada/salida).
  const tiposDisponibles = permitirAjuste
    ? TIPOS_MATERIAL
    : TIPOS_MATERIAL.filter((t) => t.value !== 'ENTRADA_AJUSTE' && t.value !== 'SALIDA_AJUSTE');
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
                {tiposDisponibles.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
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

// ===========================================================================
// MOVIMIENTO MASIVO DE MATERIALES (conteo físico + sumar/restar)
// ===========================================================================

type ModoMat = 'CONTEO' | 'MOVIMIENTO';
const TIPOS_MAT_MASIVO = [
  { value: 'ENTRADA_AJUSTE', label: '+ Sumar (entrada)' },
  { value: 'SALIDA_AJUSTE', label: '− Restar (salida)' },
] as const;
type LineaMat = { uid: string; materialId: string; codigo: string; nombre: string; unidad: string; valor: string };
let MUID = 0;
const nextMuid = () => `mm${++MUID}`;

export function MaterialMasivoButton({
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

  const [modo, setModo] = useState<ModoMat>('CONTEO');
  const [almacenId, setAlmacenId] = useState(almacenPreseleccionado ?? almacenes[0]?.id ?? '');
  const [tipo, setTipo] = useState<(typeof TIPOS_MAT_MASIVO)[number]['value']>('ENTRADA_AJUSTE');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaMat[]>([]);
  const [stockActual, setStockActual] = useState<Record<string, number>>({});
  const [cargandoStock, setCargandoStock] = useState(false);

  const [bulkText, setBulkText] = useState('');
  const [bulkQty, setBulkQty] = useState('1');
  const [scanInput, setScanInput] = useState('');
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);

  const lineasKey = lineas.map((l) => l.materialId).join(',');

  useEffect(() => {
    const ids = lineas.map((l) => l.materialId);
    if (!almacenId || ids.length === 0) { setStockActual({}); return; }
    let cancel = false;
    setCargandoStock(true);
    obtenerStockMateriales(almacenId, ids)
      .then((m) => { if (!cancel) setStockActual(m); })
      .finally(() => { if (!cancel) setCargandoStock(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenId, lineasKey]);

  const materialesFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return materiales
      .filter((m) => m.codigo.toLowerCase().includes(q) || m.nombre.toLowerCase().includes(q))
      .slice(0, 20);
  }, [search, materiales]);

  function reset() {
    setLineas([]); setBulkText(''); setObservacion(''); setSearch(''); setScanInput(''); setStockActual({});
  }
  function onOpenChange(o: boolean) { setOpen(o); if (!o) reset(); }

  function buscarPorCodigo(codigo: string): Material | null {
    const c = codigo.trim().toUpperCase();
    if (!c) return null;
    return materiales.find((m) => m.codigo.toUpperCase() === c) ?? null;
  }

  function upsertLinea(m: Material, opts: { set?: number; by?: number }) {
    setLineas((prev) => {
      const idx = prev.findIndex((l) => l.materialId === m.id);
      if (idx >= 0) {
        const copia = [...prev];
        const actual = Number(copia[idx]!.valor) || 0;
        const nuevo = opts.set !== undefined ? opts.set : actual + (opts.by ?? 0);
        copia[idx] = { ...copia[idx]!, valor: String(nuevo) };
        return copia;
      }
      const inicial = opts.set !== undefined ? opts.set : (opts.by ?? 0);
      return [
        ...prev,
        { uid: nextMuid(), materialId: m.id, codigo: m.codigo, nombre: m.nombre, unidad: m.unidad ?? '', valor: String(inicial) },
      ];
    });
  }

  function agregarDelBuscador(m: Material) {
    if (modo === 'CONTEO') upsertLinea(m, { set: stockActual[m.id] ?? 0 });
    else upsertLinea(m, { by: 1 });
    setSearch('');
    setShowResults(false);
  }

  function procesarBulk() {
    const comun = Number(bulkQty);
    const filas = bulkText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (filas.length === 0) return toast.error('Pega al menos un código');
    let ok = 0;
    const noEnc: string[] = [];
    for (const fila of filas) {
      const partes = fila.split(/[\s,;\t]+/).filter(Boolean);
      const codigo = partes[0] ?? '';
      const cant = partes[1] !== undefined ? Number(partes[1]) : comun;
      const m = buscarPorCodigo(codigo);
      if (m && Number.isFinite(cant) && cant >= 0) { upsertLinea(m, { set: cant }); ok++; }
      else noEnc.push(codigo || fila);
    }
    setBulkText('');
    if (ok > 0) toast.success(`${ok} cargados`);
    if (noEnc.length > 0) toast.warning(`No encontrados: ${noEnc.join(', ')}`);
  }

  function procesarScan() {
    const c = scanInput.trim();
    if (!c) return;
    const m = buscarPorCodigo(c);
    if (m) {
      if (modo === 'CONTEO') {
        const idx = lineas.findIndex((l) => l.materialId === m.id);
        if (idx < 0) upsertLinea(m, { set: 1 }); else upsertLinea(m, { by: 1 });
      } else {
        upsertLinea(m, { by: 1 });
      }
      setScanInput('');
    } else {
      toast.error(`Código no encontrado: ${c}`);
      setScanInput('');
    }
  }

  function updateValor(uid: string, val: string) {
    setLineas((prev) => prev.map((l) => (l.uid === uid ? { ...l, valor: val } : l)));
  }
  function eliminar(uid: string) {
    setLineas((prev) => prev.filter((l) => l.uid !== uid));
  }

  function resultado(l: LineaMat): { actual: number; final: number; delta: number } {
    const actual = stockActual[l.materialId] ?? 0;
    const val = Number(l.valor) || 0;
    if (modo === 'CONTEO') return { actual, final: val, delta: val - actual };
    const final = tipo === 'ENTRADA_AJUSTE' ? actual + val : actual - val;
    return { actual, final, delta: final - actual };
  }

  function enviar() {
    if (!almacenId) return toast.error('Selecciona un almacén');
    if (lineas.length === 0) return toast.error('Agrega al menos una línea');

    if (modo === 'CONTEO') {
      for (const l of lineas) {
        const c = Number(l.valor);
        if (!Number.isFinite(c) || c < 0) return toast.error(`Cantidad inválida en ${l.codigo}`);
      }
      const conCambio = lineas.filter((l) => resultado(l).delta !== 0);
      if (conCambio.length === 0) return toast.error('Ningún material cambia de stock');
      start(async () => {
        const r = await ajustarStockMaterialBatch({
          almacen_id: almacenId,
          observacion: observacion.trim() || undefined,
          lineas: lineas.map((l) => ({ material_id: l.materialId, cantidad_nueva: Number(l.valor) })),
        });
        if (r.ok && r.data) {
          toast.success(
            `${r.data.aplicados} ajustes (${r.data.entradas} entradas · ${r.data.salidas} salidas)` +
              (r.data.sin_cambio ? ` · ${r.data.sin_cambio} sin cambio` : ''),
          );
          setOpen(false); reset(); router.refresh();
        } else {
          toast.error(r.error ?? 'Error al ajustar el stock');
        }
      });
      return;
    }

    for (const l of lineas) {
      const c = Number(l.valor);
      if (!c || c <= 0) return toast.error(`Cantidad inválida en ${l.codigo}`);
    }
    start(async () => {
      const r = await registrarMovimientoMaterialBatch({
        almacen_id: almacenId,
        tipo,
        observacion: observacion.trim() || undefined,
        lineas: lineas.map((l) => ({ material_id: l.materialId, cantidad: Number(l.valor) })),
      });
      if (r.ok && r.data) {
        toast.success(`${r.data.insertados} movimientos registrados`);
        setOpen(false); reset(); router.refresh();
      } else {
        toast.error(r.error ?? 'Error al registrar movimientos');
      }
    });
  }

  const conCambio = lineas.filter((l) => resultado(l).delta !== 0).length;

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)} title="Actualizar el stock de varios materiales a la vez">
        <Layers className="h-4 w-4" /> Masivo
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Actualización masiva de materiales</DialogTitle>
            <DialogDescription>
              {modo === 'CONTEO'
                ? 'Indica cuánto DEBE quedar cada material (toma física). El sistema ajusta la diferencia automáticamente.'
                : 'Suma o resta la misma cantidad a varios materiales a la vez.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button type="button" onClick={() => setModo('CONTEO')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${modo === 'CONTEO' ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                Fijar stock (conteo físico)
              </button>
              <button type="button" onClick={() => setModo('MOVIMIENTO')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${modo === 'MOVIMIENTO' ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                Sumar / restar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Almacén</Label>
                <select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} disabled={pending}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
                </select>
              </div>
              {modo === 'MOVIMIENTO' && (
                <div>
                  <Label className="text-xs">Operación (aplica a TODAS las líneas)</Label>
                  <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} disabled={pending}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {TIPOS_MAT_MASIVO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1 rounded-lg border bg-slate-50/40 p-2">
                <Label className="text-[10px] uppercase text-slate-500">Buscar y agregar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
                    placeholder="Código / nombre" className="h-8 pl-7 text-xs" />
                </div>
                {showResults && materialesFiltrados.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded border bg-white">
                    {materialesFiltrados.map((m) => (
                      <button key={m.id} type="button" onClick={() => agregarDelBuscador(m)}
                        className="block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50">
                        <span className="font-mono text-slate-500">{m.codigo}</span> · {m.nombre}
                        {m.unidad && <span className="ml-1 text-slate-400">({m.unidad})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 rounded-lg border border-sky-200 bg-sky-50/40 p-2">
                <Label className="text-[10px] uppercase text-sky-700">Escanear (+1 c/u)</Label>
                <Input value={scanInput} onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); procesarScan(); } }}
                  placeholder="Esperando…" className="h-8 text-xs" />
                <p className="text-[9px] text-slate-500">Lector USB + Enter cuenta 1</p>
              </div>

              <div className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/40 p-2">
                <Label className="text-[10px] uppercase text-violet-700">Pegar lista</Label>
                <Textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)}
                  placeholder={'TELM0001 12.5\nAV0002 8\nTELM0003 40'} rows={2} className="font-mono text-[10px]" />
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-500">Sin cantidad usa:</span>
                  <Input type="number" min="0" step="0.0001" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} className="h-7 w-14 text-xs" />
                  <Button type="button" onClick={procesarBulk} size="sm" className="ml-auto h-7 bg-violet-600 text-white hover:bg-violet-700">
                    <Zap className="h-3 w-3" /> Cargar
                  </Button>
                </div>
              </div>
            </div>
            <p className="-mt-2 text-[10px] text-slate-500">
              Formato de pegado: un material por línea → <span className="font-mono">CÓDIGO CANTIDAD</span> (separador espacio, coma, punto y coma o tab).
              Admite decimales (metros/kilos). En “fijar stock” la cantidad es el stock final.
            </p>

            {lineas.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500">
                Sin líneas. Usa la carga rápida de arriba para agregar.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Código</th>
                      <th className="px-2 py-1.5 text-left">Material</th>
                      <th className="px-2 py-1.5 text-right w-16">Actual</th>
                      <th className="px-2 py-1.5 text-right w-24">{modo === 'CONTEO' ? 'Stock final' : 'Cantidad'}</th>
                      <th className="px-2 py-1.5 text-right w-28">Queda</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => {
                      const { actual, final, delta } = resultado(l);
                      return (
                        <tr key={l.uid} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 font-mono">{l.codigo}</td>
                          <td className="px-2 py-1.5">{l.nombre}{l.unidad && <span className="ml-1 text-slate-400">({l.unidad})</span>}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-500">{cargandoStock ? '…' : actual}</td>
                          <td className="px-2 py-1.5 text-right">
                            <Input type="number" min="0" step="0.0001" value={l.valor}
                              onChange={(e) => updateValor(l.uid, e.target.value)} className="h-7 w-20 text-right text-xs" />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono">
                            <span className={final < 0 ? 'text-rose-600 font-semibold' : 'text-corp-900'}>{final}</span>
                            {delta !== 0 && (
                              <span className={`ml-1 text-[10px] ${delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                ({delta > 0 ? '+' : ''}{delta})
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5">
                            <button type="button" onClick={() => eliminar(l.uid)} className="text-rose-500 hover:text-rose-700" title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div>
              <Label className="text-xs">Observación común (opcional)</Label>
              <Textarea value={observacion} onChange={(e) => setObservacion(e.target.value)}
                placeholder="Aplica a todas las líneas. Ej: 'Inventario fin de mes', 'Carga inicial', etc." rows={2} className="mt-1" />
            </div>

            <div className="flex items-center justify-between rounded-md bg-slate-50 p-3">
              <div>
                <p className="text-[10px] uppercase text-slate-500">Resumen</p>
                <p className="text-sm">
                  <span className="font-semibold">{lineas.length}</span> material{lineas.length === 1 ? '' : 'es'}
                  {modo === 'CONTEO' && <> · <span className="font-semibold">{conCambio}</span> con cambio</>}
                </p>
              </div>
              <Button onClick={enviar} disabled={pending || lineas.length === 0} variant="premium">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {modo === 'CONTEO' ? `Aplicar ${conCambio} ajuste${conCambio === 1 ? '' : 's'}` : `Registrar ${lineas.length} movimientos`}
              </Button>
            </div>
          </div>
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
