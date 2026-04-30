'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import { crearVariante, eliminarVariante } from '@/server/actions/productos';

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
  precio_costo_estandar: number | null;
  activo: boolean;
};

export function VariantesSection({ productoId, variantes }: { productoId: string; variantes: Variante[] }) {
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
              <Input name="precio_publico" type="number" step="0.01" min="0" required defaultValue={50} />
            </FormRow>
            <FormRow label="Precio mayorista A (S/)" hint="6+ unidades">
              <Input name="precio_mayorista_a" type="number" step="0.01" min="0" />
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
            <TableHead className="text-right">Precio público</TableHead>
            <TableHead className="text-right">Mayorista A</TableHead>
            <TableHead className="text-right">Costo</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {variantes.map((v) => (
              <TableRow key={v.id}>
                <TableCell><Badge variant="outline">{v.talla.replace('T', '')}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">{v.codigo_barras ?? '—'}</TableCell>
                <TableCell className="text-right font-medium">{formatPEN(Number(v.precio_publico ?? 0))}</TableCell>
                <TableCell className="text-right text-sm">{v.precio_mayorista_a ? formatPEN(Number(v.precio_mayorista_a)) : '—'}</TableCell>
                <TableCell className="text-right text-sm text-slate-500">{v.precio_costo_estandar ? formatPEN(Number(v.precio_costo_estandar)) : '—'}</TableCell>
                <TableCell>{v.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onDelete(v.id)} disabled={pending}>
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
