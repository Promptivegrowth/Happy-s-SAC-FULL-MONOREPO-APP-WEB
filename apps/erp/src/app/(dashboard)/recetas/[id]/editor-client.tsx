'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Switch } from '@happy/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Trash2, Loader2, Search, X, Copy, Scissors, Clock, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import {
  upsertReceta,
  eliminarLinea,
  toggleSaleAServicio,
  duplicarReceta,
  duplicarLineasTalla,
  agregarProceso,
  actualizarProceso,
  eliminarProceso,
} from '@/server/actions/recetas';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

type Mat = { id: string; codigo: string; nombre: string; categoria: string; precio_unitario?: number | null };
type Linea = {
  id: string;
  material_id: string;
  talla: string;
  cantidad: number;
  sale_a_servicio: boolean;
  cantidad_almacen: number | null;
  unidad_id: string | null;
  observacion: string | null;
  materiales?: { codigo: string; nombre: string; categoria: string; precio_unitario: number | null } | null;
};
type Unidad = { id: string; codigo: string; nombre: string };
type Producto = { id: string; codigo: string; nombre: string };
type Area = { id: string; codigo: string; nombre: string; valor_minuto: number | null };
type Proceso = {
  id: string;
  proceso: string;
  area_id: string | null;
  talla: string | null;
  orden: number;
  tiempo_estandar_min: number | null;
  es_tercerizado: boolean;
  observacion: string | null;
  areas_produccion?: { id: string; codigo: string; nombre: string; valor_minuto: number | null } | null;
};

export function RecetaEditor({
  recetaId,
  productoId,
  materiales,
  unidades,
  lineas,
  productos = [],
  areas = [],
  procesos = [],
}: {
  recetaId: string;
  productoId: string;
  materiales: Mat[];
  unidades: Unidad[];
  lineas: Linea[];
  productos?: Producto[];
  areas?: Area[];
  procesos?: Proceso[];
}) {
  return (
    <Tabs defaultValue="materiales">
      <TabsList>
        <TabsTrigger value="materiales">Materiales (BOM)</TabsTrigger>
        <TabsTrigger value="procesos">
          Procesos / Operaciones <Badge variant="secondary" className="ml-1.5 text-[9px]">{procesos.length}</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="materiales">
        <BomEditor
          recetaId={recetaId}
          productoId={productoId}
          materiales={materiales}
          unidades={unidades}
          lineas={lineas}
          productos={productos}
        />
      </TabsContent>

      <TabsContent value="procesos">
        <ProcesosEditor productoId={productoId} areas={areas} procesos={procesos} />
      </TabsContent>
    </Tabs>
  );
}

// ============================================================================
// Materiales / BOM
// ============================================================================

function BomEditor({
  recetaId,
  productoId,
  materiales,
  unidades,
  lineas,
  productos,
}: {
  recetaId: string;
  productoId: string;
  materiales: Mat[];
  unidades: Unidad[];
  lineas: Linea[];
  productos: Producto[];
}) {
  const [filtroTalla, setFiltroTalla] = useState<string>('');
  const [openForm, setOpenForm] = useState(false);
  const [openDup, setOpenDup] = useState(false);
  const [openDupTalla, setOpenDupTalla] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saleAServicio, setSaleAServicio] = useState(true);

  const filtrado = lineas.filter((l) => !filtroTalla || l.talla === filtroTalla);

  function onSubmit(fd: FormData) {
    fd.append('receta_id', recetaId);
    fd.set('sale_a_servicio', saleAServicio ? 'on' : 'off');
    start(async () => {
      const r = await upsertReceta(null, fd);
      if (r.ok) {
        toast.success('Línea agregada/actualizada');
        setOpenForm(false);
        setSaleAServicio(true);
      } else toast.error(r.error);
    });
  }

  function onDelete(id: string) {
    if (!confirm('¿Eliminar esta línea de la receta?')) return;
    start(async () => {
      const r = await eliminarLinea(id);
      if (r.ok) toast.success('Línea eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  function onToggleSale(id: string, valor: boolean) {
    start(async () => {
      const r = await toggleSaleAServicio(id, valor);
      if (r.ok) toast.success(valor ? 'Marcado para taller' : 'Queda en almacén');
      else toast.error(r.error ?? 'Error');
    });
  }

  // Agrupar líneas por talla
  const porTalla = TALLAS.reduce<Record<string, Linea[]>>((acc, t) => {
    acc[t] = filtrado.filter((l) => l.talla === t);
    return acc;
  }, {} as Record<string, Linea[]>);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Filtrar talla:</span>
          <Badge
            variant={!filtroTalla ? 'default' : 'outline'}
            onClick={() => setFiltroTalla('')}
            className="cursor-pointer"
          >
            Todas
          </Badge>
          {TALLAS.map((t) => {
            const cantidad = lineas.filter((l) => l.talla === t).length;
            const sinReceta = cantidad === 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => !sinReceta && setFiltroTalla(t)}
                disabled={sinReceta}
                title={sinReceta ? 'Esta talla aún no tiene receta' : `${cantidad} línea${cantidad === 1 ? '' : 's'}`}
                className={`relative inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  sinReceta
                    ? 'cursor-not-allowed border-dashed border-slate-300 bg-slate-100 text-slate-400 opacity-60 line-through'
                    : filtroTalla === t
                      ? 'border-transparent bg-happy-500 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-happy-400 hover:bg-happy-50'
                }`}
              >
                {t.replace('T', '')}
                {!sinReceta && (
                  <span className={`text-[9px] font-mono ${filtroTalla === t ? 'text-white/80' : 'text-slate-400'}`}>
                    ·{cantidad}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenDup(true)}>
              <Copy className="h-3.5 w-3.5" /> Duplicar a otro producto
            </Button>
            <Button variant="premium" size="sm" onClick={() => setOpenForm(true)}>
              <Plus className="h-4 w-4" /> Agregar línea
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Las tallas en gris/tachadas todavía no tienen líneas. Con el botón <strong>Duplicar talla</strong> en el header de cada talla podés copiar las líneas a otra talla y solo ajustar las cantidades.
        </p>
      </Card>

      {openForm && (
        <Card className="border-happy-300 bg-happy-50/40 p-4">
          <form action={onSubmit} className="space-y-4">
            <h3 className="font-display text-sm font-semibold">Nueva línea de receta</h3>

            <MaterialCombobox materiales={materiales} />

            <FormGrid cols={3}>
              <FormRow label="Talla" required>
                <select name="talla" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {TALLAS.map((t) => <option key={t} value={t}>{t.replace('T', '')}</option>)}
                </select>
              </FormRow>
              <FormRow label="Cantidad" required>
                <Input name="cantidad" type="number" step="0.0001" min="0" required defaultValue={1} />
              </FormRow>
              <FormRow label="Unidad">
                <select name="unidad_id" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">—</option>
                  {unidades.map((u) => <option key={u.id} value={u.id}>{u.codigo}</option>)}
                </select>
              </FormRow>
            </FormGrid>

            {/* Sale al taller — toggle visible (antes era un select escondido) */}
            <div className="flex items-start gap-3 rounded-lg border-2 border-dashed border-happy-300 bg-white p-3">
              <Switch
                checked={saleAServicio}
                onCheckedChange={(v) => setSaleAServicio(!!v)}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-corp-900">
                  {saleAServicio ? '✂️ Avío sale a costura' : '📦 Queda en almacén'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {saleAServicio
                    ? 'Este material se incluye en el paquete que se envía al taller junto al corte.'
                    : 'Este material se aplica internamente (decoración, control de calidad, etc.).'}
                </p>
              </div>
              {saleAServicio && (
                <FormRow label="Cant. queda en alm." className="w-36">
                  <Input name="cantidad_almacen" type="number" step="0.0001" min="0" defaultValue={0} />
                </FormRow>
              )}
            </div>

            <FormRow label="Observación">
              <Input name="observacion" />
            </FormRow>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Agregar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {filtroTalla ? (
        <RecetaTabla lineas={porTalla[filtroTalla] ?? []} onDelete={onDelete} onToggleSale={onToggleSale} pending={pending} />
      ) : (
        TALLAS.filter((t) => porTalla[t]!.length > 0).map((t) => (
          <Card key={t} className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
              <h3 className="font-display text-sm font-semibold">Talla {t.replace('T', '')}</h3>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{porTalla[t]!.length} líneas</Badge>
                <Button variant="ghost" size="sm" onClick={() => setOpenDupTalla(t)} title="Duplicar líneas a otra talla">
                  <Copy className="h-3 w-3" /> Duplicar talla
                </Button>
              </div>
            </div>
            <RecetaTabla lineas={porTalla[t]!} onDelete={onDelete} onToggleSale={onToggleSale} pending={pending} compact />
          </Card>
        ))
      )}

      {openDup && (
        <DuplicarRecetaModal
          recetaId={recetaId}
          productoActualId={productoId}
          productos={productos}
          onClose={() => setOpenDup(false)}
        />
      )}

      {openDupTalla && (
        <DuplicarTallaModal
          recetaId={recetaId}
          tallaOrigen={openDupTalla}
          tallasYaUsadas={Object.keys(porTalla).filter((t) => porTalla[t]!.length > 0)}
          onClose={() => setOpenDupTalla(null)}
        />
      )}
    </div>
  );
}

function RecetaTabla({
  lineas,
  onDelete,
  onToggleSale,
  pending,
  compact,
}: {
  lineas: Linea[];
  onDelete: (id: string) => void;
  onToggleSale: (id: string, valor: boolean) => void;
  pending: boolean;
  compact?: boolean;
}) {
  if (lineas.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-slate-400">Sin líneas para esta talla</div>;
  }
  return (
    <Table>
      <TableHeader><TableRow>
        {!compact && <TableHead>Talla</TableHead>}
        <TableHead>Material</TableHead>
        <TableHead>Categoría</TableHead>
        <TableHead className="text-right">Cantidad</TableHead>
        <TableHead className="text-right">Costo total</TableHead>
        <TableHead>✂️ Va al taller</TableHead>
        <TableHead></TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {lineas.map((l) => {
          const costo = l.materiales?.precio_unitario ? Number(l.materiales.precio_unitario) * Number(l.cantidad) : 0;
          return (
            <TableRow key={l.id}>
              {!compact && <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>}
              <TableCell>
                <div className="font-medium text-sm">{l.materiales?.nombre}</div>
                <div className="font-mono text-[10px] text-slate-500">{l.materiales?.codigo}</div>
              </TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{l.materiales?.categoria}</Badge></TableCell>
              <TableCell className="text-right font-mono text-sm">{Number(l.cantidad).toFixed(4)}</TableCell>
              <TableCell className="text-right text-sm">S/ {costo.toFixed(2)}</TableCell>
              <TableCell>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={l.sale_a_servicio}
                    onCheckedChange={(v) => onToggleSale(l.id, !!v)}
                    disabled={pending}
                  />
                  <span className={l.sale_a_servicio ? 'font-medium text-emerald-700' : 'text-slate-500'}>
                    {l.sale_a_servicio ? `Sí · queda ${Number(l.cantidad_almacen ?? 0).toFixed(2)} alm.` : 'No'}
                  </span>
                </label>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onDelete(l.id)} disabled={pending}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function MaterialCombobox({ materiales }: { materiales: Mat[] }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [seleccionado, setSeleccionado] = useState<Mat | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtrados = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q && seleccionado) return [];
    if (!q) return materiales.slice(0, 30);
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return materiales
      .filter((m) =>
        norm(m.codigo).includes(qn) ||
        norm(m.nombre).includes(qn) ||
        m.categoria?.toLowerCase().includes(qn),
      )
      .slice(0, 30);
  }, [materiales, text, seleccionado]);

  function elegir(m: Mat) {
    setSeleccionado(m);
    setText(`${m.codigo} · ${m.nombre}`);
    setOpen(false);
  }

  function limpiar() {
    setSeleccionado(null);
    setText('');
    setOpen(true);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name="material_id" value={seleccionado?.id ?? ''} required />
      <label className="mb-1 block text-xs font-medium text-slate-700">
        Material <span className="text-danger">*</span>
        <span className="ml-1 font-normal text-slate-400">— buscar por código o nombre</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSeleccionado(null);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtrados.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[highlight]) elegir(filtrados[highlight]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Ej: TEL0001, hilo azul, COTTON…"
          className={`h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-happy-200 ${
            seleccionado ? 'border-happy-400 bg-happy-50/40' : ''
          }`}
        />
        {seleccionado && (
          <button type="button" onClick={limpiar} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && filtrados.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-white shadow-lg">
          {filtrados.map((m, i) => (
            <button
              type="button"
              key={m.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(m)}
              className={`flex w-full items-start gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${i === highlight ? 'bg-happy-50' : ''}`}
            >
              <Badge variant="secondary" className="mt-0.5 text-[9px]">{m.categoria}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-corp-900">{m.nombre}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {m.codigo}
                  {m.precio_unitario != null && (
                    <span className="ml-2 text-slate-400">· S/ {Number(m.precio_unitario).toFixed(2)}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && filtrados.length === 0 && text.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border bg-white p-3 text-center text-xs text-slate-500 shadow-lg">
          Sin coincidencias para &quot;{text}&quot;
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Modales: duplicar receta / duplicar talla
// ============================================================================

function DuplicarRecetaModal({
  recetaId,
  productoActualId,
  productos,
  onClose,
}: {
  recetaId: string;
  productoActualId: string;
  productos: Producto[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState('');
  const filtrados = productos
    .filter((p) => p.id !== productoActualId)
    .filter((p) => !busca || p.nombre.toLowerCase().includes(busca.toLowerCase()) || p.codigo.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 30);

  function ejecutar() {
    if (!seleccionadoId) return toast.error('Elegí un producto destino');
    start(async () => {
      const r = await duplicarReceta(recetaId, seleccionadoId);
      if (r.ok && r.data) {
        toast.success(`✨ ${r.data.lineas} líneas duplicadas`);
        onClose();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">Duplicar receta</h3>
            <p className="text-xs text-slate-500">Copia todas las líneas de esta receta a otro producto.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <Input placeholder="Buscar producto destino…" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-2" />
        <div className="max-h-60 overflow-auto rounded-md border">
          {filtrados.length === 0 ? (
            <p className="p-3 text-center text-xs text-slate-400">Sin productos</p>
          ) : (
            filtrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSeleccionadoId(p.id)}
                className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${
                  seleccionadoId === p.id ? 'bg-happy-100 ring-1 ring-happy-400' : ''
                }`}
              >
                <span>
                  <span className="font-medium">{p.nombre}</span>
                  <span className="ml-2 font-mono text-[10px] text-slate-500">{p.codigo}</span>
                </span>
                {seleccionadoId === p.id && <Badge variant="success" className="text-[9px]">Elegido</Badge>}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="premium" onClick={ejecutar} disabled={pending || !seleccionadoId}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DuplicarTallaModal({
  recetaId,
  tallaOrigen,
  tallasYaUsadas,
  onClose,
}: {
  recetaId: string;
  tallaOrigen: string;
  tallasYaUsadas: string[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const tallasDisponibles = TALLAS.filter((t) => !tallasYaUsadas.includes(t));

  function copiar(tallaDestino: string) {
    start(async () => {
      const r = await duplicarLineasTalla(recetaId, tallaOrigen, tallaDestino);
      if (r.ok && r.data) {
        toast.success(`✨ ${r.data.lineas} líneas copiadas a talla ${tallaDestino.replace('T', '')}`);
        onClose();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">
              Duplicar líneas de talla {tallaOrigen.replace('T', '')}
            </h3>
            <p className="text-xs text-slate-500">Elegí la talla destino. Las líneas se copian con sus cantidades; ajustás después.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {tallasDisponibles.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-center text-sm text-slate-500">
            Todas las tallas ya tienen líneas. Elimina alguna primero.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {tallasDisponibles.map((t) => (
              <Button
                key={t}
                variant="outline"
                onClick={() => copiar(t)}
                disabled={pending}
                className="h-12"
              >
                {t.replace('T', '')}
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// Procesos / Operaciones
// ============================================================================

function ProcesosEditor({
  productoId,
  areas,
  procesos,
}: {
  productoId: string;
  areas: Area[];
  procesos: Proceso[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [orderBy, setOrderBy] = useState<'orden' | 'area' | 'tiempo'>('orden');

  const [proceso, setProceso] = useState<(typeof PROCESOS)[number]>('CORTE');
  const [areaId, setAreaId] = useState('');
  const [tallaProc, setTallaProc] = useState<string>('');
  const [tiempo, setTiempo] = useState<string>('');
  const [tercerizado, setTercerizado] = useState(false);
  const [obs, setObs] = useState('');

  function reset() {
    setProceso('CORTE');
    setAreaId('');
    setTallaProc('');
    setTiempo('');
    setTercerizado(false);
    setObs('');
  }

  function agregar() {
    start(async () => {
      const r = await agregarProceso(productoId, {
        producto_id: productoId,
        proceso,
        area_id: areaId || '',
        talla: (tallaProc || '') as (typeof TALLAS)[number] | '',
        orden: 0,
        tiempo_estandar_min: tiempo === '' ? '' : Number(tiempo),
        es_tercerizado: tercerizado,
        observacion: obs,
      });
      if (r.ok) {
        toast.success('Operación agregada');
        reset();
        setOpen(false);
      } else toast.error(r.error ?? 'Error');
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar esta operación?')) return;
    start(async () => {
      const r = await eliminarProceso(id);
      if (r.ok) toast.success('Eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  const ordenados = useMemo(() => {
    const copy = [...procesos];
    if (orderBy === 'orden') copy.sort((a, b) => a.orden - b.orden);
    else if (orderBy === 'area')
      copy.sort((a, b) =>
        (a.areas_produccion?.nombre ?? a.proceso).localeCompare(b.areas_produccion?.nombre ?? b.proceso),
      );
    else if (orderBy === 'tiempo')
      copy.sort((a, b) => Number(b.tiempo_estandar_min ?? 0) - Number(a.tiempo_estandar_min ?? 0));
    return copy;
  }, [procesos, orderBy]);

  const totalMin = procesos.reduce((s, p) => s + Number(p.tiempo_estandar_min ?? 0), 0);
  const costoTotal = procesos.reduce(
    (s, p) => s + Number(p.tiempo_estandar_min ?? 0) * Number(p.areas_produccion?.valor_minuto ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Scissors className="h-5 w-5 text-happy-500" />
          <div className="flex-1">
            <h3 className="font-display text-sm font-semibold">Secuencia de operaciones del producto</h3>
            <p className="text-xs text-slate-500">
              Define qué procesos se aplican y en qué orden. El costo se calcula con el valor/minuto de cada área.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Ordenar por:</span>
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as 'orden' | 'area' | 'tiempo')}
              className="h-8 rounded-md border bg-white px-2 text-xs"
            >
              <option value="orden">Orden / secuencia</option>
              <option value="area">Área</option>
              <option value="tiempo">Tiempo (mayor primero)</option>
            </select>
          </div>
          <Button variant="premium" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Agregar operación
          </Button>
        </div>
      </Card>

      {open && (
        <Card className="border-happy-300 bg-happy-50/40 p-4">
          <h3 className="mb-3 font-display text-sm font-semibold">Nueva operación</h3>
          <FormGrid cols={3}>
            <FormRow label="Proceso" required>
              <select
                value={proceso}
                onChange={(e) => setProceso(e.target.value as (typeof PROCESOS)[number])}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROCESOS.map((p) => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
              </select>
            </FormRow>
            <FormRow label="Área" hint="De aquí sale el costo/minuto">
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— sin asignar —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre} {a.valor_minuto ? `(S/${Number(a.valor_minuto).toFixed(3)}/min)` : ''}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Tiempo estándar (min)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={tiempo}
                onChange={(e) => setTiempo(e.target.value)}
                placeholder="Ej: 15"
              />
            </FormRow>
            <FormRow label="Talla (opcional)" hint="Vacío = aplica a todas">
              <select
                value={tallaProc}
                onChange={(e) => setTallaProc(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todas</option>
                {TALLAS.map((t) => <option key={t} value={t}>{t.replace('T', '')}</option>)}
              </select>
            </FormRow>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={tercerizado} onCheckedChange={(v) => setTercerizado(!!v)} />
                <span>Tercerizado (taller externo)</span>
              </label>
            </div>
          </FormGrid>
          <FormRow label="Observación">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </FormRow>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={pending}>Cancelar</Button>
            <Button variant="premium" onClick={agregar} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Agregar
            </Button>
          </div>
        </Card>
      )}

      {procesos.length === 0 ? (
        <Card className="p-10 text-center">
          <ListOrdered className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">
            Aún no hay operaciones definidas para este producto.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Más adelante se podrán importar masivamente desde Excel.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Orden</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead className="text-right">Tiempo (min)</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead>Tercerizado</TableHead>
                <TableHead>Observación</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((p) => {
                const tiempoMin = Number(p.tiempo_estandar_min ?? 0);
                const valorMin = Number(p.areas_produccion?.valor_minuto ?? 0);
                const costo = tiempoMin * valorMin;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.orden}</TableCell>
                    <TableCell className="font-medium">{p.proceso.replace('_', ' ')}</TableCell>
                    <TableCell>
                      {p.areas_produccion ? (
                        <Badge variant="secondary">{p.areas_produccion.nombre}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.talla ? (
                        <Badge variant="outline">{p.talla.replace('T', '')}</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">Todas</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <InlineTiempo
                        valor={tiempoMin}
                        onChange={async (v) => {
                          start(async () => {
                            const r = await actualizarProceso(p.id, { tiempo_estandar_min: v });
                            if (r.ok) toast.success('Tiempo actualizado');
                            else toast.error(r.error ?? 'Error');
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {valorMin > 0 ? `S/ ${costo.toFixed(2)}` : <span className="text-xs text-slate-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {p.es_tercerizado ? (
                        <Badge variant="default" className="bg-amber-500 text-[10px]">Externo</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Interno</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-500">{p.observacion}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => eliminar(p.id)} disabled={pending}>
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-end gap-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Tiempo total:</span>
                <span className="font-mono font-semibold text-corp-900">{totalMin.toFixed(2)} min</span>
              </div>
              <div>
                <span className="text-slate-500">Costo MO total:</span>{' '}
                <span className="font-display text-base font-semibold text-happy-600">S/ {costoTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/** Edita el tiempo en línea con confirmación al perder focus o Enter. */
function InlineTiempo({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(valor));
  useEffect(() => { setV(String(valor)); }, [valor]);
  return (
    <input
      type="number"
      step="0.01"
      min={0}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v); if (n !== valor && Number.isFinite(n)) onChange(n); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-20 rounded border border-slate-200 bg-white px-2 text-right font-mono text-xs focus:border-happy-400 focus:outline-none focus:ring-2 focus:ring-happy-100"
    />
  );
}
