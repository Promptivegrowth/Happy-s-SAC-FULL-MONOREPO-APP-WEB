'use client';

/**
 * Modal de movimiento MASIVO — permite registrar el mismo tipo de movimiento
 * (ej. SALIDA_MERMA, ENTRADA_COMPRA) sobre VARIAS variantes a la vez.
 *
 * Útil cuando hay que cargar decenas de SKUs sin abrir el modal individual
 * una por una (ej. recibir un lote de 30 SKUs distintos, ajustar inventario
 * tras conteo masivo, registrar merma de un lote completo).
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Textarea } from '@happy/ui/textarea';
import { PackagePlus, Loader2, Plus, Trash2, Search, Zap, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { registrarMovimientoStockBatch } from '@/server/actions/inventario';

type Almacen = { id: string; nombre: string; codigo: string };
type Variante = { id: string; sku: string; talla: string; producto_nombre: string };

// Solo AJUSTES (decisión cliente). Otros tipos vienen de sus flujos automáticos.
const TIPOS = [
  { value: 'ENTRADA_AJUSTE', label: '+ Ajuste de inventario (entrada)' },
  { value: 'SALIDA_AJUSTE', label: '− Ajuste de inventario (salida)' },
] as const;

type Linea = { uid: string; varianteId: string; sku: string; producto: string; talla: string; cantidad: string };
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

  const [almacenId, setAlmacenId] = useState<string>(almacenes[0]?.id ?? '');
  const [tipo, setTipo] = useState<typeof TIPOS[number]['value']>('ENTRADA_AJUSTE');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);

  // Carga rápida
  const [bulkText, setBulkText] = useState('');
  const [bulkQty, setBulkQty] = useState('1');
  const [scanInput, setScanInput] = useState('');
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);

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

  function agregarOSumar(v: Variante, cant: number) {
    setLineas((prev) => {
      const idx = prev.findIndex((l) => l.varianteId === v.id);
      if (idx >= 0) {
        const copia = [...prev];
        const nuevaCant = (Number(copia[idx]!.cantidad) || 0) + cant;
        copia[idx] = { ...copia[idx]!, cantidad: String(nuevaCant) };
        return copia;
      }
      return [
        ...prev,
        {
          uid: nextUid(),
          varianteId: v.id,
          sku: v.sku,
          producto: v.producto_nombre,
          talla: v.talla,
          cantidad: String(cant),
        },
      ];
    });
  }

  function agregarDelBuscador(v: Variante) {
    agregarOSumar(v, 1);
    setSearch('');
    setShowResults(false);
  }

  function procesarBulk() {
    const qty = Number(bulkQty);
    if (!qty || qty <= 0) return toast.error('Cantidad inválida');
    const codigos = bulkText.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
    if (codigos.length === 0) return toast.error('Pegá al menos un código');
    let ok = 0;
    const noEnc: string[] = [];
    for (const c of codigos) {
      const v = buscarPorCodigo(c);
      if (v) {
        agregarOSumar(v, qty);
        ok++;
      } else {
        noEnc.push(c);
      }
    }
    setBulkText('');
    if (ok > 0) toast.success(`${ok} agregados`);
    if (noEnc.length > 0) toast.warning(`No encontrados: ${noEnc.join(', ')}`);
  }

  function procesarScan() {
    const c = scanInput.trim();
    if (!c) return;
    const v = buscarPorCodigo(c);
    if (v) {
      agregarOSumar(v, 1);
      setScanInput('');
    } else {
      toast.error(`Código no encontrado: ${c}`);
      setScanInput('');
    }
  }

  function updateCantidad(uid: string, val: string) {
    setLineas((prev) => prev.map((l) => (l.uid === uid ? { ...l, cantidad: val } : l)));
  }

  function eliminar(uid: string) {
    setLineas((prev) => prev.filter((l) => l.uid !== uid));
  }

  function enviar() {
    if (!almacenId) return toast.error('Seleccioná almacén');
    if (lineas.length === 0) return toast.error('Agregá al menos una línea');
    for (const l of lineas) {
      const c = Number(l.cantidad);
      if (!c || c <= 0) return toast.error(`Cantidad inválida en ${l.sku}`);
    }
    start(async () => {
      const r = await registrarMovimientoStockBatch({
        almacen_id: almacenId,
        tipo,
        observacion: observacion.trim() || undefined,
        lineas: lineas.map((l) => ({ variante_id: l.varianteId, cantidad: Number(l.cantidad) })),
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

  const totalUnidades = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} title="Registrar mismo movimiento sobre varias variantes a la vez">
        <PackagePlus className="h-4 w-4" /> Movimiento masivo
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar movimiento masivo</DialogTitle>
            <DialogDescription>
              Registrá el mismo tipo de movimiento sobre <strong>varias variantes</strong> a la vez.
              Usá la carga rápida (escaneo o pegar lista) para acelerar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cabecera: almacén + tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">
                  Almacén ({tipo.startsWith('ENTRADA') ? 'destino' : 'origen'})
                </Label>
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
              <div>
                <Label className="text-xs">Tipo de movimiento (aplica a TODAS las líneas)</Label>
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
                        <span className="font-mono text-slate-500">{v.sku}</span> · {v.producto_nombre} · T{v.talla.replace('T', '')}
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
                <p className="text-[9px] text-slate-500">Disparar lector USB y Enter agrega 1</p>
              </div>

              {/* Pegar lista */}
              <div className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/40 p-2">
                <Label className="text-[10px] uppercase text-violet-700">Pegar lista (cantidad común)</Label>
                <Textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="PR0001&#10;AC0002&#10;..."
                  rows={2}
                  className="font-mono text-[10px]"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="1"
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

            {/* Tabla de líneas */}
            {lineas.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500">
                Sin líneas. Usá los modos de carga rápida arriba para agregar.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">Producto · Talla</th>
                      <th className="px-2 py-1.5 text-right w-24">Cantidad</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.uid} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 font-mono">{l.sku}</td>
                        <td className="px-2 py-1.5">
                          {l.producto} · <span className="text-slate-500">T{l.talla.replace('T', '')}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <Input
                            type="number"
                            min="1"
                            value={l.cantidad}
                            onChange={(e) => updateCantidad(l.uid, e.target.value)}
                            className="h-7 w-20 text-right text-xs"
                          />
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
                    ))}
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
                placeholder="Aplicará a todas las líneas. Ej: 'Recepción OC-1234', 'Inventario fin de mes', etc."
                rows={2}
                className="mt-1"
              />
            </div>

            {/* Resumen + acción */}
            <div className="flex items-center justify-between rounded-md bg-slate-50 p-3">
              <div>
                <p className="text-[10px] uppercase text-slate-500">Resumen</p>
                <p className="text-sm">
                  <span className="font-semibold">{lineas.length}</span> ítem{lineas.length === 1 ? '' : 's'} ·{' '}
                  <span className="font-semibold">{totalUnidades}</span> unidades total
                </p>
              </div>
              <Button onClick={enviar} disabled={pending || lineas.length === 0} variant="premium">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Registrar {lineas.length} movimientos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
