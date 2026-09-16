'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { formatTallaChip, ordenTalla } from '@happy/lib';
import { Printer, Loader2, Search, Eraser, AlertTriangle, Tag, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  FORMATOS,
  contarEtiquetas,
  generarEtiquetasPDF,
  nombreCorto,
  tituloEtiqueta,
  type EtiquetaItem,
} from './etiquetas-pdf';
import { construirEtiquetasZpl, etiquetasABase64 } from '@happy/lib/zpl';
import { encolarEtiquetas, equiposConEtiquetas } from '@/server/actions/impresion';

export type VarianteEtiqueta = {
  sku: string;
  codigo_barras: string | null;
  talla: string;
};

export type ProductoEtiqueta = {
  id: string;
  codigo: string | null;
  nombre: string;
  variantes: VarianteEtiqueta[];
};

/** Rollo de 50 × 30 mm: el que más se parece a la etiqueta que ya usan. */
/*
 * El rollo que hay puesto en la Zebra del almacén: 50 × 25 mm troquelado de a
 * dos. Es el que se usa todos los días; los demás quedan para casos sueltos.
 */
const FORMATO_POR_DEFECTO = 'r50x25d';

/** Tope de productos dibujados a la vez: sin esto, 700 tarjetas cuelgan la vista. */
const MAX_VISIBLES = 40;

/** Cuántas etiquetas justifican un aviso antes de generar el PDF. */
const LOTE_GRANDE = 300;

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function SelectorEtiquetas({ productos }: { productos: ProductoEtiqueta[] }) {
  const [busqueda, setBusqueda] = useState('');
  const [formatoId, setFormatoId] = useState(FORMATO_POR_DEFECTO);
  const [usarSku, setUsarSku] = useState(true);
  const [generando, setGenerando] = useState(false);
  /** Cantidad por talla, indexada por SKU (único y estable). */
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  const formato = FORMATOS.find((f) => f.id === formatoId) ?? FORMATOS[0]!;

  /** El código que se va a imprimir para esta talla, o null si no hay ninguno. */
  function codigoDe(v: VarianteEtiqueta): string | null {
    const cb = (v.codigo_barras ?? '').trim();
    if (cb) return cb;
    // El POS busca por código de barras Y por SKU, así que imprimir el SKU
    // deja la prenda escaneable igual. Es la salida para las tallas a las que
    // todavía no se les cargó el código del sistema anterior.
    return usarSku ? v.sku.trim() || null : null;
  }

  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const lista = !q
      ? productos
      : productos.filter((p) => {
          const heno = normalizar(
            [p.nombre, p.codigo ?? '', ...p.variantes.map((v) => `${v.sku} ${v.codigo_barras ?? ''}`)].join(' '),
          );
          return q.split(/\s+/).every((t) => heno.includes(t));
        });
    return { lista: lista.slice(0, MAX_VISIBLES), total: lista.length };
  }, [productos, busqueda]);

  /** Líneas elegidas, con su producto, para el resumen y para el PDF. */
  const elegidas = useMemo(() => {
    const porSku = new Map<string, { producto: ProductoEtiqueta; variante: VarianteEtiqueta }>();
    for (const p of productos) for (const v of p.variantes) porSku.set(v.sku, { producto: p, variante: v });

    return Object.entries(cantidades)
      .filter(([, n]) => n > 0)
      .map(([sku, n]) => {
        const ref = porSku.get(sku);
        if (!ref) return null;
        return { sku, cantidad: n, producto: ref.producto, variante: ref.variante };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort(
        (a, b) =>
          a.producto.nombre.localeCompare(b.producto.nombre, 'es') ||
          ordenTalla(a.variante.talla) - ordenTalla(b.variante.talla),
      );
  }, [cantidades, productos]);

  const items: EtiquetaItem[] = useMemo(
    () =>
      elegidas.map((e) => ({
        nombre: e.producto.nombre,
        talla: formatTallaChip(e.variante.talla),
        codigo: codigoDe(e.variante) ?? '',
        cantidad: e.cantidad,
      })),
    // codigoDe depende de usarSku; se recalcula al cambiarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elegidas, usarSku],
  );

  const total = contarEtiquetas(items);
  const sinCodigo = elegidas.filter((e) => codigoDe(e.variante) === null).length;

  function setCantidad(sku: string, n: number) {
    setCantidades((prev) => {
      const sig = { ...prev };
      if (n > 0) sig[sku] = Math.min(999, Math.floor(n));
      else delete sig[sku];
      return sig;
    });
  }

  function unaPorTalla(p: ProductoEtiqueta) {
    setCantidades((prev) => {
      const sig = { ...prev };
      for (const v of p.variantes) if (codigoDe(v)) sig[v.sku] = Math.max(1, sig[v.sku] ?? 0);
      return sig;
    });
  }

  function limpiarProducto(p: ProductoEtiqueta) {
    setCantidades((prev) => {
      const sig = { ...prev };
      for (const v of p.variantes) delete sig[v.sku];
      return sig;
    });
  }

  /*
   * Las computadoras que tienen la Zebra lista.
   *
   * Se piden al abrir la pantalla: si no hay ninguna, el botón de imprimir
   * directo no aparece y queda solo el PDF, que es el camino de siempre.
   */
  const [equiposZebra, setEquiposZebra] = useState<Array<{ id: string; nombre: string; impresora: string }>>([]);
  const [equipoZebra, setEquipoZebra] = useState<string>('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void equiposConEtiquetas()
      .then((lista) => {
        setEquiposZebra(lista);
        if (lista.length === 1) setEquipoZebra(lista[0]!.id);
      })
      .catch(() => setEquiposZebra([]));
  }, []);

  /**
   * Manda las etiquetas a la Zebra por el agente.
   *
   * El PDF sigue existiendo, pero por el navegador el rollo de dos columnas
   * sale mal: Windows estira el diseño de una etiqueta sobre las dos. Por acá
   * el ZPL llega tal cual y la impresora ubica cada código en su columna.
   */
  async function imprimirEnZebra() {
    if (total === 0) {
      toast.error('Elige al menos una talla y su cantidad');
      return;
    }
    if (!equipoZebra) {
      toast.error('Elige la computadora que tiene la Zebra');
      return;
    }
    if (formato.soporte === 'a4') {
      toast.error('La hoja A4 va por el PDF, no por la Zebra. Elige un rollo.');
      return;
    }
    if (total > LOTE_GRANDE && !confirm(`Vas a imprimir ${total} etiquetas. ¿Continuamos?`)) return;

    setEnviando(true);
    try {
      const datos = items
        .filter((i) => (i.codigo ?? '').trim() !== '')
        .map((i) => ({
          titulo: tituloEtiqueta(i.nombre, i.talla),
          codigo: i.codigo,
          cantidad: i.cantidad,
        }));
      if (datos.length === 0) {
        toast.error('Ninguna de las tallas elegidas tiene un código imprimible');
        return;
      }
      /*
       * El tamaño que se eligió arriba manda también acá.
       *
       * Antes el ZPL salía siempre con las medidas fijas del rollo del
       * almacén: si alguien elegía otro tamaño, el PDF le cambiaba y la Zebra
       * no, y no había manera de darse cuenta salvo mirando la tira impresa.
       *
       * La separación entre columnas solo tiene sentido si hay dos: 3 mm es lo
       * habitual en este troquelado, y es el número a corregir si el texto de
       * la segunda columna sale corrido.
       */
      const zpl = construirEtiquetasZpl(datos, {
        formato: {
          anchoEtiquetaMm: formato.ancho,
          altoEtiquetaMm: formato.alto,
          columnas: formato.columnas,
          separacionMm: formato.columnas > 1 ? 3 : 0,
          margenIzquierdoMm: 2,
        },
      });

      const r = await encolarEtiquetas(
        equipoZebra,
        etiquetasABase64(zpl),
        `Etiquetas · ${total} unidad(es) · ${formato.nombre}`,
      );
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo enviar a la impresora');
        return;
      }
      toast.success(`${total} etiqueta(s) enviadas a la Zebra`, { duration: 7000 });
    } catch (e) {
      toast.error((e as Error).message ?? 'No se pudo enviar a la impresora');
    } finally {
      setEnviando(false);
    }
  }

  async function generar() {
    if (total === 0) {
      toast.error('Elige al menos una talla y su cantidad');
      return;
    }
    if (total > LOTE_GRANDE && !confirm(`Vas a generar ${total} etiquetas. ¿Continuamos?`)) return;

    setGenerando(true);
    try {
      const r = await generarEtiquetasPDF(items, formato);
      if (r.impresas === 0) {
        toast.error('Ninguna de las tallas elegidas tiene un código imprimible');
        return;
      }
      const url = URL.createObjectURL(r.blob);
      // Se abre en una pestaña con el diálogo de impresión: desde ahí se elige
      // la Zebra. El PDF también queda descargable por si hay que reimprimir.
      const w = window.open(url, '_blank');
      if (!w) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast.success(`${r.impresas} etiqueta${r.impresas === 1 ? '' : 's'} en el PDF`);
      for (const a of r.avisos.slice(0, 4)) toast.warning(`${a.codigo}: ${a.motivo}`, { duration: 8000 });
    } catch (e) {
      toast.error(`No se pudo generar el PDF: ${(e as Error).message}`);
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-4 pb-28">
      {/* ---------------- Controles ---------------- */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[260px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Buscar producto
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, código interno o código de barras…"
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tamaño de etiqueta
            </label>
            <select
              value={formatoId}
              onChange={(e) => setFormatoId(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {FORMATOS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </div>

          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={usarSku} onChange={(e) => setUsarSku(e.target.checked)} className="h-4 w-4" />
            Si la talla no tiene código de barras, usar su SKU
          </label>
        </CardContent>
      </Card>

      {/* ---------------- Resumen de lo elegido ---------------- */}
      {elegidas.length > 0 && (
        <Card className="border-happy-200 bg-happy-50/40">
          <CardContent className="py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-happy-700">
                {elegidas.length} talla{elegidas.length === 1 ? '' : 's'} elegida{elegidas.length === 1 ? '' : 's'}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setCantidades({})}>
                <Eraser className="h-3.5 w-3.5" /> Vaciar todo
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {elegidas.map((e) => {
                const cod = codigoDe(e.variante);
                return (
                  <button
                    key={e.sku}
                    onClick={() => setCantidad(e.sku, 0)}
                    title="Quitar del lote"
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      cod ? 'border-happy-300 bg-white hover:bg-red-50' : 'border-amber-300 bg-amber-50 hover:bg-red-50'
                    }`}
                  >
                    {nombreCorto(e.producto.nombre)} · {formatTallaChip(e.variante.talla)}
                    <span className="ml-1 font-semibold">×{e.cantidad}</span>
                    {!cod && <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-600" />}
                  </button>
                );
              })}
            </div>
            {sinCodigo > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {sinCodigo} talla{sinCodigo === 1 ? '' : 's'} sin código: no saldrá{sinCodigo === 1 ? '' : 'n'} en el PDF.
                Cárgale el código en la ficha del producto o marca la opción de usar el SKU.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---------------- Lista de productos ---------------- */}
      {visibles.total === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            No hay productos que coincidan con “{busqueda}”.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibles.total > MAX_VISIBLES && (
            <p className="text-xs text-slate-500">
              Mostrando {MAX_VISIBLES} de {visibles.total} productos. Escribe en el buscador para acotar.
            </p>
          )}
          {visibles.lista.map((p) => {
            const tallas = [...p.variantes].sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla));
            const elegidasAqui = tallas.reduce((s, v) => s + (cantidades[v.sku] ?? 0), 0);
            return (
              <Card key={p.id} className={elegidasAqui > 0 ? 'border-happy-300' : undefined}>
                <CardContent className="py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.nombre}</span>
                    {p.codigo && <Badge variant="outline">{p.codigo}</Badge>}
                    {elegidasAqui > 0 && (
                      <Badge className="bg-happy-500 text-white">
                        <Check className="mr-1 h-3 w-3" />
                        {elegidasAqui}
                      </Badge>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => unaPorTalla(p)}>
                        1 por talla
                      </Button>
                      {elegidasAqui > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => limpiarProducto(p)}>
                          Limpiar
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tallas.map((v) => {
                      const cod = codigoDe(v);
                      const n = cantidades[v.sku] ?? 0;
                      return (
                        <div
                          key={v.sku}
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
                            n > 0 ? 'border-happy-400 bg-happy-50' : cod ? 'border-slate-200' : 'border-amber-200 bg-amber-50'
                          }`}
                        >
                          <div className="leading-tight">
                            <div className="text-sm font-semibold">{formatTallaChip(v.talla)}</div>
                            <div className="text-[10px] text-slate-500">
                              {cod ?? 'sin código'}
                              {cod && !v.codigo_barras && <span className="text-amber-600"> (SKU)</span>}
                            </div>
                          </div>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            value={n === 0 ? '' : n}
                            placeholder="0"
                            disabled={!cod}
                            onChange={(e) => setCantidad(v.sku, Number(e.target.value) || 0)}
                            className="h-8 w-14 rounded border border-input bg-background px-1.5 text-center text-sm disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------------- Barra fija de impresión ---------------- */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-white/95 px-4 py-3 shadow-lg backdrop-blur md:left-64">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="font-semibold">{total}</span> etiqueta{total === 1 ? '' : 's'}
            <span className="text-slate-500">
              {' '}· {formato.nombre}
              {formato.soporte === 'a4'
                ? ''
                : formato.columnas > 1
                  ? ` · ${formato.columnas} por fila`
                  : ' · una por fila'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/*
              El camino recomendado: directo a la Zebra.
              Solo aparece si hay una computadora con la impresora configurada
              y con el agente que sabe imprimirlas. Si no, queda el PDF.
            */}
            {equiposZebra.length > 0 && (
              <>
                {equiposZebra.length > 1 && (
                  <select
                    value={equipoZebra}
                    onChange={(e) => setEquipoZebra(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">¿En qué computadora?</option>
                    {equiposZebra.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                    ))}
                  </select>
                )}
                <Button
                  variant="premium"
                  onClick={() => void imprimirEnZebra()}
                  disabled={enviando || total === 0}
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Imprimir en la Zebra
                </Button>
              </>
            )}
            <Button
              variant={equiposZebra.length > 0 ? 'outline' : 'premium'}
              onClick={generar}
              disabled={generando || total === 0}
            >
              {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Generar PDF
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Aviso corto de cómo configurar la Zebra; se muestra arriba de la página. */
export function AyudaZebra() {
  const [abierto, setAbierto] = useState(false);
  return (
    <Card className="border-corp-200 bg-corp-50/50">
      <CardContent className="py-3">
        <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-medium text-corp-800">
          <Tag className="h-4 w-4" />
          Cómo imprimir en la Zebra ZD421
          <span className="ml-auto text-xs text-corp-600">{abierto ? 'ocultar' : 'ver'}</span>
        </button>
        {abierto && (
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Carga el rollo y calibra la impresora una vez (mantén pulsado el botón de avance hasta que pase dos etiquetas).</li>
            <li>En Windows, abre <b>Dispositivos e impresoras</b> → clic derecho en la ZD421 → <b>Preferencias de impresión</b>.</li>
            <li>Pon el <b>tamaño de papel</b> igual al que elegiste acá (por ejemplo 50 × 30 mm) y la <b>orientación</b> en horizontal.</li>
            <li>Escala: <b>Tamaño real</b> o 100 %. Si imprimes “ajustar a la página”, las barras se deforman y el lector falla.</li>
            <li>Genera el PDF, ábrelo y manda a imprimir eligiendo la ZD421.</li>
            <li>Prueba la primera etiqueta con la pistola en el POS antes de imprimir el lote completo.</li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
