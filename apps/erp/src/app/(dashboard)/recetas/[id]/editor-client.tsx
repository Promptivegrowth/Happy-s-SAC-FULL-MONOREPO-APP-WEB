'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Trash2, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { upsertReceta, eliminarLinea } from '@/server/actions/recetas';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

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

export function RecetaEditor({ recetaId, materiales, unidades, lineas }: {
  recetaId: string; materiales: Mat[]; unidades: Unidad[]; lineas: Linea[];
}) {
  const [filtroTalla, setFiltroTalla] = useState<string>('');
  const [openForm, setOpenForm] = useState(false);
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState('');

  const filtrado = lineas.filter((l) => !filtroTalla || l.talla === filtroTalla);

  void busca; // mantener compatibilidad — el filtro ahora está dentro del MaterialCombobox

  function onSubmit(fd: FormData) {
    fd.append('receta_id', recetaId);
    start(async () => {
      const r = await upsertReceta(null, fd);
      if (r.ok) {
        toast.success('Línea agregada/actualizada');
        setOpenForm(false);
      } else {
        toast.error(r.error);
      }
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

  void materiales; // referencia para silenciar warning — usado dentro de MaterialCombobox

  // Agrupar líneas por talla para visualización
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
          <div className="ml-auto">
            <Button variant="premium" size="sm" onClick={() => setOpenForm(true)}>
              <Plus className="h-4 w-4" /> Agregar línea
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Las tallas en gris/tachadas todavía no tienen líneas — agregalas con el botón de arriba.
        </p>
      </Card>

      {openForm && (
        <Card className="border-happy-300 bg-happy-50/40 p-4">
          <form action={onSubmit} className="space-y-4">
            <h3 className="font-display text-sm font-semibold">Nueva línea de receta</h3>

            <MaterialCombobox materiales={materiales} />

            <FormGrid cols={3}>
              <FormRow label="Material seleccionado (oculto)" className="hidden">
                <Input name="_dummy" />
              </FormRow>
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
              <FormRow label="Cant. queda en almacén">
                <Input name="cantidad_almacen" type="number" step="0.0001" min="0" defaultValue={0} />
              </FormRow>
              <FormRow label="Sale al taller">
                <select name="sale_a_servicio" defaultValue="on" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="on">Sí, sale junto al corte</option>
                  <option value="off">No, queda en almacén</option>
                </select>
              </FormRow>
            </FormGrid>
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
        <RecetaTabla lineas={porTalla[filtroTalla] ?? []} onDelete={onDelete} pending={pending} />
      ) : (
        TALLAS.filter((t) => porTalla[t]!.length > 0).map((t) => (
          <Card key={t} className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
              <h3 className="font-display text-sm font-semibold">Talla {t.replace('T', '')}</h3>
              <Badge variant="secondary" className="text-[10px]">{porTalla[t]!.length} líneas</Badge>
            </div>
            <RecetaTabla lineas={porTalla[t]!} onDelete={onDelete} pending={pending} compact />
          </Card>
        ))
      )}
    </div>
  );
}

function RecetaTabla({ lineas, onDelete, pending, compact }: { lineas: Linea[]; onDelete: (id: string) => void; pending: boolean; compact?: boolean }) {
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
        <TableHead>Sale a taller</TableHead>
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
                {l.sale_a_servicio ? <Badge variant="default" className="text-[10px]">Sí · queda {Number(l.cantidad_almacen).toFixed(2)} alm.</Badge> : <Badge variant="secondary" className="text-[10px]">No</Badge>}
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

/**
 * Combobox: input que filtra in-memory por código + nombre + sub-categoría +
 * color, muestra dropdown con resultados, al seleccionar setea el hidden
 * input <input name="material_id" value={...}> que el form lee.
 */
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
        (m as Mat & { categoria?: string }).categoria?.toLowerCase().includes(qn),
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
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, filtrados.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (filtrados[highlight]) elegir(filtrados[highlight]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder="Ej: TEL0001, hilo azul, COTTON…"
          className={`h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-happy-200 ${
            seleccionado ? 'border-happy-400 bg-happy-50/40' : ''
          }`}
        />
        {seleccionado && (
          <button
            type="button"
            onClick={limpiar}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Limpiar"
          >
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
              className={`flex w-full items-start gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${
                i === highlight ? 'bg-happy-50' : ''
              }`}
            >
              <Badge variant="secondary" className="mt-0.5 text-[9px]">
                {(m as Mat & { categoria?: string }).categoria ?? ''}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-corp-900">{m.nombre}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {m.codigo}
                  {m.precio_unitario != null && (
                    <span className="ml-2 text-slate-400">
                      · S/ {Number(m.precio_unitario).toFixed(2)}
                    </span>
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
