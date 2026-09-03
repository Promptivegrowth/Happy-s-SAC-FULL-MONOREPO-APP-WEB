'use client';

/**
 * Modal de actualización MASIVA de stock. Dos modos:
 *
 *  1. CONTEO (fijar stock final): el usuario indica cuánto DEBE quedar cada
 *     ítem (toma física / carga inicial). El sistema calcula el delta vs el
 *     stock actual e inserta el ajuste (entrada o salida) que corresponda.
 *     Ej: si hay 80 y pones 20 → registra una salida de 60. (pedido 2026-08-31)
 *
 *  2. MOVIMIENTO (sumar/restar): registra el mismo ajuste (entrada + o salida −)
 *     sumando/restando la cantidad indicada. Útil para cargar entradas/mermas.
 *
 * Ambos muestran el STOCK ACTUAL y CÓMO QUEDA cada ítem antes de confirmar.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Textarea } from '@happy/ui/textarea';
import { PackagePlus, Loader2, Trash2, Search, Zap, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { registrarMovimientoStockBatch, ajustarStockBatch, obtenerStockVariantes } from '@/server/actions/inventario';
import { formatTallaChip } from '@happy/lib';

type Almacen = { id: string; nombre: string; codigo: string };
type Variante = { id: string; sku: string; talla: string; producto_nombre: string };

type Modo = 'CONTEO' | 'MOVIMIENTO';
const TIPOS = [
  { value: 'ENTRADA_AJUSTE', label: '+ Sumar (entrada)' },
  { value: 'SALIDA_AJUSTE', label: '− Restar (salida)' },
] as const;

type Linea = { uid: string; varianteId: string; sku: string; producto: string; talla: string; valor: string };
let UID = 0;
const nextUid = () => `m${++UID}`;

export function MovimientoMasivoButton({
  almacenes,
  variantes,
}: {
  almacenes: Almacen[];
  variantes: Variante[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [modo, setModo] = useState<Modo>('CONTEO');
  const [almacenId, setAlmacenId] = useState<string>(almacenes[0]?.id ?? '');
  const [tipo, setTipo] = useState<typeof TIPOS[number]['value']>('ENTRADA_AJUSTE');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);

  // Stock actual por variante en el almacén seleccionado (para las columnas).
  const [stockActual, setStockActual] = useState<Record<string, number>>({});
  const [cargandoStock, setCargandoStock] = useState(false);

  // Carga rápida
  const [bulkText, setBulkText] = useState('');
  const [bulkQty, setBulkQty] = useState('1');
  const [scanInput, setScanInput] = useState('');
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);

  const lineasKey = lineas.map((l) => l.varianteId).join(',');

  // Traer el stock actual cada vez que cambia el almacén o las líneas.
  useEffect(() => {
    const ids = lineas.map((l) => l.varianteId);
    if (!almacenId || ids.length === 0) {
      setStockActual({});
      return;
    }
    let cancel = false;
    setCargandoStock(true);
    obtenerStockVariantes(almacenId, ids)
      .then((m) => { if (!cancel) setStockActual(m); })
      .finally(() => { if (!cancel) setCargandoStock(false); });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenId, lineasKey]);

  const variantesFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return variantes
      .filter((v) =>
        v.sku.toLowerCase().includes(q) ||
        v.producto_nombre.toLowerCase().includes(q) ||
        v.talla.toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [search, variantes]);

  function reset() {
    setLineas([]);
    setBulkText('');
    setObservacion('');
    setSearch('');
    setScanInput('');
    setStockActual({});
  }

  function onOpenChange(o: boolean) {
    setOpen(o);
    if (!o) reset();
  }

  function buscarPorCodigo(codigo: string): Variante | null {
    const c = codigo.trim().toUpperCase();
    if (!c) return null;
    return variantes.find((v) => v.sku.toUpperCase() === c) ?? null;
  }

  // Añade la línea si no existe. `set` fija el valor; si no, incrementa en `by`.
  function upsertLinea(v: Variante, opts: { set?: number; by?: number }) {
    setLineas((prev) => {
      const idx = prev.findIndex((l) => l.varianteId === v.id);
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
        { uid: nextUid(), varianteId: v.id, sku: v.sku, producto: v.producto_nombre, talla: v.talla, valor: String(inicial) },
      ];
    });
  }

  function agregarDelBuscador(v: Variante) {
    // En conteo, agregar arranca en el stock actual (para que solo ajustes lo
    // que cambie); en movimiento arranca en 1.
    if (modo === 'CONTEO') {
      const actual = stockActual[v.id] ?? 0;
      upsertLinea(v, { set: actual });
    } else {
      upsertLinea(v, { by: 1 });
    }
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
      const v = buscarPorCodigo(codigo);
      if (v && Number.isFinite(cant) && cant >= 0) {
        upsertLinea(v, { set: cant }); // pegar SIEMPRE fija el valor indicado
        ok++;
      } else {
        noEnc.push(codigo || fila);
      }
    }
    setBulkText('');
    if (ok > 0) toast.success(`${ok} cargados`);
    if (noEnc.length > 0) toast.warning(`No encontrados: ${noEnc.join(', ')}`);
  }

  function procesarScan() {
    const c = scanInput.trim();
    if (!c) return;
    const v = buscarPorCodigo(c);
    if (v) {
      // Escanear cuenta +1 (contar físico) o suma +1 (movimiento).
      if (modo === 'CONTEO') {
        const idx = lineas.findIndex((l) => l.varianteId === v.id);
        if (idx < 0) upsertLinea(v, { set: 1 });
        else upsertLinea(v, { by: 1 });
      } else {
        upsertLinea(v, { by: 1 });
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

  // Resultado por línea según el modo.
  function resultado(l: Linea): { actual: number; final: number; delta: number } {
    const actual = stockActual[l.varianteId] ?? 0;
    const val = Number(l.valor) || 0;
    if (modo === 'CONTEO') {
      return { actual, final: val, delta: val - actual };
    }
    const final = tipo === 'ENTRADA_AJUSTE' ? actual + val : actual - val;
    return { actual, final, delta: final - actual };
  }

  function enviar() {
    if (!almacenId) return toast.error('Selecciona un almacén');
    if (lineas.length === 0) return toast.error('Agrega al menos una línea');

    if (modo === 'CONTEO') {
      for (const l of lineas) {
        const c = Number(l.valor);
        if (!Number.isFinite(c) || c < 0) return toast.error(`Cantidad inválida en ${l.sku}`);
      }
      const conCambio = lineas.filter((l) => resultado(l).delta !== 0);
      if (conCambio.length === 0) return toast.error('Ningún ítem cambia de stock');
      start(async () => {
        const r = await ajustarStockBatch({
          almacen_id: almacenId,
          observacion: observacion.trim() || undefined,
          lineas: lineas.map((l) => ({ variante_id: l.varianteId, cantidad_nueva: Number(l.valor) })),
        });
        if (r.ok && r.data) {
          toast.success(
            `${r.data.aplicados} ajustes (${r.data.entradas} entradas · ${r.data.salidas} salidas)` +
              (r.data.sin_cambio ? ` · ${r.data.sin_cambio} sin cambio` : ''),
          );
          setOpen(false);
          reset();
          router.refresh();
        } else {
          toast.error(r.error ?? 'Error al ajustar el stock');
        }
      });
      return;
    }

    // MOVIMIENTO (sumar/restar)
    for (const l of lineas) {
      const c = Number(l.valor);
      if (!c || c <= 0) return toast.error(`Cantidad inválida en ${l.sku}`);
    }
    start(async () => {
      const r = await registrarMovimientoStockBatch({
        almacen_id: almacenId,
        tipo,
        observacion: observacion.trim() || undefined,
        lineas: lineas.map((l) => ({ variante_id: l.varianteId, cantidad: Number(l.valor) })),
      });
      if (r.ok && r.data) {
        toast.success(`${r.data.insertados} movimientos registrados`);
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error al registrar movimientos');
      }
    });
  }

  const conCambio = lineas.filter((l) => resultado(l).delta !== 0).length;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} title="Actualizar el stock de varios productos a la vez">
        <PackagePlus className="h-4 w-4" /> Movimiento masivo
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Actualización masiva de stock</DialogTitle>
            <DialogDescription>
              {modo === 'CONTEO'
                ? 'Indica cuánto DEBE quedar cada producto (toma física). El sistema ajusta la diferencia automáticamente.'
                : 'Suma o resta la misma cantidad a varios productos a la vez.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Selector de modo */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setModo('CONTEO')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${modo === 'CONTEO' ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Fijar stock (conteo físico)
              </button>
              <button
                type="button"
                onClick={() => setModo('MOVIMIENTO')}
                className={`rounded-md px-3 py-1.5 font-medium transition ${modo === 'MOVIMIENTO' ? 'bg-white text-happy-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Sumar / restar
              </button>
            </div>

            {/* Cabecera: almacén + (tipo solo en movimiento) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Almacén</Label>
                <select
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  disabled={pending}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                  ))}
                </select>
              </div>
              {modo === 'MOVIMIENTO' && (
                <div>
                  <Label className="text-xs">Operación (aplica a TODAS las líneas)</Label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as typeof TIPOS[number]['value'])}
                    disabled={pending}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Carga rápida: 3 modos */}
            <div className="grid gap-2 md:grid-cols-3">
              {/* Buscador individual */}
              <div className="space-y-1 rounded-lg border bg-slate-50/40 p-2">
                <Label className="text-[10px] uppercase text-slate-500">Buscar y agregar</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
                    placeholder="SKU / nombre / talla"
                    className="h-8 pl-7 text-xs"
                  />
                </div>
                {showResults && variantesFiltradas.length > 0 && (
                  <div className="max-h-32 overflow-y-auto rounded border bg-white">
                    {variantesFiltradas.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => agregarDelBuscador(v)}
                        className="block w-full px-2 py-1 text-left text-[11px] hover:bg-slate-50"
                      >
                        <span className="font-mono text-slate-500">{v.sku}</span> · {v.producto_nombre} · {formatTallaChip(v.talla)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Escaneo */}
              <div className="space-y-1 rounded-lg border border-sky-200 bg-sky-50/40 p-2">
                <Label className="text-[10px] uppercase text-sky-700">Escanear (+1 c/u)</Label>
                <Input
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); procesarScan(); } }}
                  placeholder="Esperando…"
                  className="h-8 text-xs"
                />
                <p className="text-[9px] text-slate-500">Lector USB + Enter cuenta 1</p>
              </div>

              {/* Pegar lista */}
              <div className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/40 p-2">
                <Label className="text-[10px] uppercase text-violet-700">Pegar lista</Label>
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={'PRD0101 20\nPRD0102 8\nAC0003 15'}
                  rows={2}
                  className="font-mono text-[10px]"
                />
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-slate-500">Sin cantidad usa:</span>
                  <Input
                    type="number"
                    min="0"
                    value={bulkQty}
                    onChange={(e) => setBulkQty(e.target.value)}
                    className="h-7 w-14 text-xs"
                  />
                  <Button type="button" onClick={procesarBulk} size="sm" className="ml-auto h-7 bg-violet-600 text-white hover:bg-violet-700">
                    <Zap className="h-3 w-3" /> Cargar
                  </Button>
                </div>
              </div>
            </div>
            <p className="-mt-2 text-[10px] text-slate-500">
              Formato de pegado: un ítem por línea → <span className="font-mono">CÓDIGO CANTIDAD</span> (separado por espacio, coma, punto y coma o tab).
              En “fijar stock” la cantidad es el stock final; en “sumar/restar” es la cantidad a mover.
            </p>

            {/* Tabla de líneas */}
            {lineas.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500">
                Sin líneas. Usa la carga rápida de arriba para agregar.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">Producto · Talla</th>
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
                          <td className="px-2 py-1.5 font-mono">{l.sku}</td>
                          <td className="px-2 py-1.5">
                            {l.producto} · <span className="text-slate-500">{formatTallaChip(l.talla)}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                            {cargandoStock ? '…' : actual}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <Input
                              type="number"
                              min="0"
                              value={l.valor}
                              onChange={(e) => updateValor(l.uid, e.target.value)}
                              className="h-7 w-20 text-right text-xs"
                            />
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
                            <button
                              type="button"
                              onClick={() => eliminar(l.uid)}
                              className="text-rose-500 hover:text-rose-700"
                              title="Eliminar"
                            >
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

            {/* Observación común */}
            <div>
              <Label className="text-xs">Observación común (opcional)</Label>
              <Textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Aplica a todas las líneas. Ej: 'Inventario fin de mes', 'Carga inicial', etc."
                rows={2}
                className="mt-1"
              />
            </div>

            {/* Resumen + acción */}
            <div className="flex items-center justify-between rounded-md bg-slate-50 p-3">
              <div>
                <p className="text-[10px] uppercase text-slate-500">Resumen</p>
                <p className="text-sm">
                  <span className="font-semibold">{lineas.length}</span> ítem{lineas.length === 1 ? '' : 's'}
                  {modo === 'CONTEO' && (
                    <> · <span className="font-semibold">{conCambio}</span> con cambio</>
                  )}
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
