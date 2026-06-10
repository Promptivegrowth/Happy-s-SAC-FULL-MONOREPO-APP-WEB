'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Trash2, Loader2, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import { crearVariante, actualizarVariante, eliminarVariante } from '@/server/actions/productos';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

type Variante = {
  id: string;
  sku: string;
  talla: string;
  codigo_barras: string | null;
  precio_publico: number | null;
  precio_mayorista_a: number | null;
  precio_mayorista_b: number | null;
  precio_mayorista_c: number | null;
  precio_industrial: number | null;
  precio_costo_estandar: number | null;
  activo: boolean;
};

/** Costo real de la última OS cerrada que incluyó esta talla. */
type UltimoCosto = {
  costoUnitario: number;
  pagoTaller: number;
  materiales: number;
  osNumero: string;
  osFecha: string | null;
};

export function VariantesSection({
  productoId,
  variantes,
  ultimosCostos = {},
}: {
  productoId: string;
  variantes: Variante[];
  /** Map talla → último costo real (calculado en el server). Opcional. */
  ultimosCostos?: Record<string, UltimoCosto>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [skuPrefix, setSkuPrefix] = useState('');

  function onCreate(fd: FormData) {
    fd.append('producto_id', productoId);
    start(async () => {
      const r = await crearVariante(null, fd);
      if (r.ok) {
        toast.success('Variante creada');
        setOpen(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  function onDelete(id: string) {
    if (!confirm('¿Eliminar esta variante?')) return;
    start(async () => {
      const r = await eliminarVariante(id, productoId);
      if (r.ok) toast.success('Eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  const tallasUsadas = variantes.map((v) => v.talla);
  const tallasDisponibles = TALLAS.filter((t) => !tallasUsadas.includes(t));

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-corp-900">Variantes (tallas)</h2>
          <p className="text-sm text-slate-500">Cada variante es un SKU independiente con stock y precio.</p>
        </div>
        {!open && tallasDisponibles.length > 0 && (
          <Button variant="premium" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Agregar variante
          </Button>
        )}
      </div>

      {open && (
        <form action={onCreate} className="mb-6 rounded-lg border border-dashed bg-happy-50/40 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormRow label="Talla" required>
              <select name="talla" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {tallasDisponibles.map((t) => <option key={t} value={t}>{t.replace('T', '')}</option>)}
              </select>
            </FormRow>
            <FormRow
              label="SKU (código)"
              hint="Opcional. Si lo dejas vacío, se autogenera como HLW0001, DNZ0001 según la categoría del producto."
            >
              <Input
                name="sku"
                value={skuPrefix}
                onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())}
                placeholder="Auto desde categoría"
                maxLength={40}
              />
            </FormRow>
            <FormRow label="Código de barras (EAN-13)">
              <Input name="codigo_barras" placeholder="opcional" />
            </FormRow>
            <FormRow label="Precio público (S/)" required>
              <Input name="precio_publico" type="number" step="0.01" min="0" required placeholder="Ej. 49.90" />
            </FormRow>
            <FormRow label="Precio mayorista A (S/)" hint="6+ unidades">
              <Input name="precio_mayorista_a" type="number" step="0.01" min="0" />
            </FormRow>
            <FormRow label="Precio mayorista B (S/)" hint="12+ unidades">
              <Input name="precio_mayorista_b" type="number" step="0.01" min="0" />
            </FormRow>
            <FormRow label="Precio mayorista C (S/)" hint="50+ unidades">
              <Input name="precio_mayorista_c" type="number" step="0.01" min="0" />
            </FormRow>
            <FormRow label="Precio fábrica (S/)" hint="100+ unidades">
              <Input name="precio_industrial" type="number" step="0.01" min="0" />
            </FormRow>
            <FormRow label="Precio costo estándar (S/)">
              <Input name="precio_costo_estandar" type="number" step="0.01" min="0" />
            </FormRow>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button type="submit" variant="premium" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </Button>
          </div>
        </form>
      )}

      {variantes.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-500">
          Sin variantes aún. Agrega al menos una talla para poder vender este producto.
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Talla</TableHead><TableHead>SKU</TableHead><TableHead>Código barras</TableHead>
            <TableHead className="text-right">Público</TableHead>
            <TableHead className="text-right" title="6+ unidades">May. A</TableHead>
            <TableHead className="text-right" title="12+ unidades">May. B</TableHead>
            <TableHead className="text-right" title="50+ unidades">May. C</TableHead>
            <TableHead className="text-right" title="100+ unidades">Fábrica</TableHead>
            <TableHead className="text-right">Costo estándar</TableHead>
            <TableHead className="text-right">Última prod.</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {variantes.map((v) => (
              <VarianteRow
                key={v.id}
                productoId={productoId}
                variante={v}
                ultimoCosto={ultimosCostos[v.talla]}
                onDelete={onDelete}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** Fila individual con modo lectura / edición inline. */
function VarianteRow({
  productoId,
  variante: v,
  ultimoCosto: u,
  onDelete,
}: {
  productoId: string;
  variante: Variante;
  ultimoCosto: UltimoCosto | undefined;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [sku, setSku] = useState(v.sku);
  const [codigoBarras, setCodigoBarras] = useState(v.codigo_barras ?? '');
  const [precioPublico, setPrecioPublico] = useState(String(v.precio_publico ?? ''));
  const [mayoristaA, setMayoristaA] = useState(v.precio_mayorista_a != null ? String(v.precio_mayorista_a) : '');
  const [mayoristaB, setMayoristaB] = useState(v.precio_mayorista_b != null ? String(v.precio_mayorista_b) : '');
  const [mayoristaC, setMayoristaC] = useState(v.precio_mayorista_c != null ? String(v.precio_mayorista_c) : '');
  const [industrial, setIndustrial] = useState(v.precio_industrial != null ? String(v.precio_industrial) : '');
  const [costoEstandar, setCostoEstandar] = useState(v.precio_costo_estandar != null ? String(v.precio_costo_estandar) : '');
  const [activo, setActivo] = useState(v.activo);

  function cancel() {
    setSku(v.sku);
    setCodigoBarras(v.codigo_barras ?? '');
    setPrecioPublico(String(v.precio_publico ?? ''));
    setMayoristaA(v.precio_mayorista_a != null ? String(v.precio_mayorista_a) : '');
    setMayoristaB(v.precio_mayorista_b != null ? String(v.precio_mayorista_b) : '');
    setMayoristaC(v.precio_mayorista_c != null ? String(v.precio_mayorista_c) : '');
    setIndustrial(v.precio_industrial != null ? String(v.precio_industrial) : '');
    setCostoEstandar(v.precio_costo_estandar != null ? String(v.precio_costo_estandar) : '');
    setActivo(v.activo);
    setEditing(false);
  }

  function save() {
    if (!sku.trim()) {
      toast.error('SKU requerido');
      return;
    }
    if (!precioPublico.trim() || Number(precioPublico) < 0) {
      toast.error('Precio público inválido');
      return;
    }
    start(async () => {
      const r = await actualizarVariante(v.id, productoId, {
        sku: sku.trim().toUpperCase(),
        codigo_barras: codigoBarras.trim(),
        precio_publico: Number(precioPublico),
        precio_mayorista_a: mayoristaA.trim() === '' ? '' : Number(mayoristaA),
        precio_mayorista_b: mayoristaB.trim() === '' ? '' : Number(mayoristaB),
        precio_mayorista_c: mayoristaC.trim() === '' ? '' : Number(mayoristaC),
        precio_industrial: industrial.trim() === '' ? '' : Number(industrial),
        precio_costo_estandar: costoEstandar.trim() === '' ? '' : Number(costoEstandar),
        activo,
      });
      if (r.ok) {
        toast.success('Variante actualizada');
        setEditing(false);
      } else {
        toast.error(r.error ?? 'No se pudo actualizar');
      }
    });
  }

  const estandar = Number(v.precio_costo_estandar ?? 0);
  const diff = u && estandar > 0 ? (u.costoUnitario - estandar) / estandar : 0;
  const sube = diff > 0.05;
  const baja = diff < -0.05;

  if (!editing) {
    return (
      <TableRow>
        <TableCell><Badge variant="outline">{v.talla.replace('T', '')}</Badge></TableCell>
        <TableCell className="font-mono text-xs">{v.sku}</TableCell>
        <TableCell className="font-mono text-xs text-slate-500">{v.codigo_barras ?? '—'}</TableCell>
        <TableCell className="text-right font-medium">{formatPEN(Number(v.precio_publico ?? 0))}</TableCell>
        <TableCell className="text-right text-sm">{v.precio_mayorista_a ? formatPEN(Number(v.precio_mayorista_a)) : '—'}</TableCell>
        <TableCell className="text-right text-sm">{v.precio_mayorista_b ? formatPEN(Number(v.precio_mayorista_b)) : '—'}</TableCell>
        <TableCell className="text-right text-sm">{v.precio_mayorista_c ? formatPEN(Number(v.precio_mayorista_c)) : '—'}</TableCell>
        <TableCell className="text-right text-sm">{v.precio_industrial ? formatPEN(Number(v.precio_industrial)) : '—'}</TableCell>
        <TableCell className="text-right text-sm text-slate-500">{v.precio_costo_estandar ? formatPEN(estandar) : '—'}</TableCell>
        <TableCell className="text-right text-sm">
          {u ? (
            <span
              className={sube ? 'font-medium text-danger' : baja ? 'font-medium text-emerald-600' : 'text-slate-700'}
              title={`OS ${u.osNumero}${u.osFecha ? ` (${u.osFecha})` : ''}\nTaller: ${formatPEN(u.pagoTaller)}\nMateriales: ${formatPEN(u.materiales)}`}
            >
              {formatPEN(u.costoUnitario)}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </TableCell>
        <TableCell>{v.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} title="Editar variante">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(v.id)} title="Eliminar variante">
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-happy-50/40">
      <TableCell><Badge variant="outline">{v.talla.replace('T', '')}</Badge></TableCell>
      <TableCell>
        <Input value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="h-8 font-mono text-xs" disabled={pending} />
      </TableCell>
      <TableCell>
        <Input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} placeholder="opcional" className="h-8 font-mono text-xs" disabled={pending} />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0" value={precioPublico} onChange={(e) => setPrecioPublico(e.target.value)} className="h-8 w-24 text-right text-xs ml-auto" disabled={pending} />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0" value={mayoristaA} onChange={(e) => setMayoristaA(e.target.value)} placeholder="—" className="h-8 w-24 text-right text-xs ml-auto" disabled={pending} />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0" value={mayoristaB} onChange={(e) => setMayoristaB(e.target.value)} placeholder="—" className="h-8 w-24 text-right text-xs ml-auto" disabled={pending} />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0" value={mayoristaC} onChange={(e) => setMayoristaC(e.target.value)} placeholder="—" className="h-8 w-24 text-right text-xs ml-auto" disabled={pending} />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0" value={industrial} onChange={(e) => setIndustrial(e.target.value)} placeholder="—" className="h-8 w-24 text-right text-xs ml-auto" disabled={pending} />
      </TableCell>
      <TableCell className="text-right">
        <Input type="number" step="0.01" min="0" value={costoEstandar} onChange={(e) => setCostoEstandar(e.target.value)} placeholder="—" className="h-8 w-24 text-right text-xs ml-auto" disabled={pending} />
      </TableCell>
      <TableCell className="text-right text-xs text-slate-400">
        {u ? formatPEN(u.costoUnitario) : '—'}
      </TableCell>
      <TableCell>
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} disabled={pending} />
          {activo ? 'Activa' : 'Inactiva'}
        </label>
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button variant="premium" size="sm" onClick={save} disabled={pending} className="h-8 px-2" title="Guardar">
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={cancel} disabled={pending} className="h-8 px-1" title="Cancelar">
            <X className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
