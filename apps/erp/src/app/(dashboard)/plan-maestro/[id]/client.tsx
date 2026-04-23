'use client';

import { useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Plus, Trash2, Loader2, CheckCircle2, Factory } from 'lucide-react';
import { toast } from 'sonner';
import { agregarLineaPlan, eliminarLineaPlan, aprobarPlan, generarOTsDelPlan } from '@/server/actions/plan-maestro';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

type Linea = {
  id: string;
  producto_id: string;
  talla: string;
  cantidad_planificada: number;
  prioridad: number | null;
  productos?: { codigo: string; nombre: string } | null;
};

export function LineasEditor({ planId, lineas, productos, isEditable }: {
  planId: string;
  lineas: Linea[];
  productos: { id: string; codigo: string; nombre: string }[];
  isEditable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState('');

  function add(fd: FormData) {
    fd.append('plan_id', planId);
    start(async () => {
      const r = await agregarLineaPlan(null, fd);
      if (r.ok) { toast.success('Línea agregada'); setOpen(false); }
      else toast.error(r.error ?? 'Error');
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

  const filtrados = productos.filter((p) => !busca || p.nombre.toLowerCase().includes(busca.toLowerCase()) || p.codigo.toLowerCase().includes(busca.toLowerCase()));

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-corp-900">Líneas del plan</h3>
        {isEditable && !open && <Button variant="premium" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Agregar línea</Button>}
      </div>

      {open && (
        <Card className="mb-4 border-happy-300 bg-happy-50/40 p-4">
          <form action={add} className="space-y-3">
            <Input placeholder="Buscar producto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <FormGrid cols={3}>
              <FormRow label="Producto" required>
                <select name="producto_id" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— Seleccionar —</option>
                  {filtrados.slice(0, 100).map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
                </select>
              </FormRow>
              <FormRow label="Talla" required>
                <select name="talla" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {TALLAS.map((t) => <option key={t} value={t}>{t.replace('T', '')}</option>)}
                </select>
              </FormRow>
              <FormRow label="Cantidad" required>
                <Input name="cantidad_planificada" type="number" min={1} required defaultValue={50} />
              </FormRow>
              <FormRow label="Prioridad" hint="Menor = más prioritario">
                <Input name="prioridad" type="number" min={0} defaultValue={100} />
              </FormRow>
            </FormGrid>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Agregar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {lineas.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-400">Sin líneas. Agrega productos al plan.</div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Producto</TableHead><TableHead>Talla</TableHead>
            <TableHead className="text-right">Cantidad</TableHead><TableHead>Prioridad</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
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
      <Button onClick={aprobar} disabled={pending || !hayLineas} variant="premium-corp">
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
