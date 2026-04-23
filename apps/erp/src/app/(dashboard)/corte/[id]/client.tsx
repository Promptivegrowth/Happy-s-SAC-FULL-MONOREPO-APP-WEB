'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Loader2, CheckCircle2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { agregarLineaCorte, cerrarCorte, crearOS } from '@/server/actions/corte';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

type Linea = {
  id: string;
  talla: string;
  cantidad_teorica: number;
  cantidad_real: number | null;
  merma: number | null;
};

export function LineasCorteEditor({ corteId, lineas, editable }: { corteId: string; lineas: Linea[]; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function add(fd: FormData) {
    fd.append('corte_id', corteId);
    start(async () => {
      const r = await agregarLineaCorte(null, fd);
      if (r.ok) { toast.success('Línea agregada'); setOpen(false); }
      else toast.error(r.error ?? 'Error');
    });
  }

  const tallasUsadas = lineas.map((l) => l.talla);
  const disponibles = TALLAS.filter((t) => !tallasUsadas.includes(t));

  return (
    <div>
      {editable && open && (
        <Card className="m-4 border-happy-300 bg-happy-50/40 p-4">
          <form action={add}>
            <FormGrid cols={4}>
              <FormRow label="Talla" required>
                <select name="talla" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {disponibles.map((t) => <option key={t} value={t}>{t.replace('T', '')}</option>)}
                </select>
              </FormRow>
              <FormRow label="Cant. teórica" required>
                <Input name="cantidad_teorica" type="number" min={0} required defaultValue={50} />
              </FormRow>
              <FormRow label="Cant. real">
                <Input name="cantidad_real" type="number" min={0} placeholder="opcional" />
              </FormRow>
              <FormRow label="Merma">
                <Input name="merma" type="number" min={0} defaultValue={0} />
              </FormRow>
            </FormGrid>
            <div className="mt-3 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Agregar
              </Button>
            </div>
          </form>
        </Card>
      )}
      {editable && !open && (
        <div className="px-4 pt-4">
          <Button variant="premium" size="sm" onClick={() => setOpen(true)} disabled={disponibles.length === 0}>
            <Plus className="h-4 w-4" /> Agregar talla
          </Button>
        </div>
      )}
      <Table>
        <TableHeader><TableRow>
          <TableHead>Talla</TableHead>
          <TableHead className="text-right">Teórica</TableHead>
          <TableHead className="text-right">Real</TableHead>
          <TableHead className="text-right">Merma</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {lineas.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-400">Sin líneas. Agrega tallas para empezar.</TableCell></TableRow>
          ) : lineas.map((l) => {
            const dif = (l.cantidad_real ?? l.cantidad_teorica) - l.cantidad_teorica;
            return (
              <TableRow key={l.id}>
                <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>
                <TableCell className="text-right font-mono">{l.cantidad_teorica}</TableCell>
                <TableCell className="text-right font-mono">{l.cantidad_real ?? '—'}</TableCell>
                <TableCell className="text-right font-mono text-danger">{l.merma ?? 0}</TableCell>
                <TableCell className={`text-right font-mono ${dif < 0 ? 'text-danger' : dif > 0 ? 'text-emerald-600' : ''}`}>{dif > 0 ? '+' : ''}{dif}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function AccionCerrarCorte({ corteId }: { corteId: string }) {
  const [pending, start] = useTransition();
  function cerrar() {
    if (!confirm('¿Cerrar este corte? Después no se podrán agregar tallas.')) return;
    start(async () => {
      const r = await cerrarCorte(corteId);
      if (r.ok) toast.success('Corte cerrado');
      else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <Button onClick={cerrar} disabled={pending} variant="premium">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      Cerrar corte
    </Button>
  );
}

export function GenerarOSDesdeCorte({ corteId, otId, talleres }: { corteId: string; otId: string; talleres: { id: string; codigo: string; nombre: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    fd.append('corte_id', corteId);
    fd.append('ot_id', otId);
    start(async () => {
      const r = await crearOS(null, fd);
      if (r.ok && r.data) {
        toast.success('OS creada');
        router.push(`/servicios/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  if (!open) {
    return (
      <Button variant="premium" onClick={() => setOpen(true)}>
        <Wrench className="h-4 w-4" /> Generar Orden de Servicio
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md p-4">
      <form action={submit} className="space-y-3">
        <FormGrid cols={1}>
          <FormRow label="Taller" required>
            <select name="taller_id" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {talleres.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
            </select>
          </FormRow>
          <FormRow label="Proceso" required>
            <select name="proceso" required defaultValue="COSTURA" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option>COSTURA</option><option>BORDADO</option><option>ESTAMPADO</option>
              <option>SUBLIMADO</option><option>PLISADO</option><option>DECORADO</option>
              <option>ACABADO</option><option>PLANCHADO</option><option>OJAL_BOTON</option>
            </select>
          </FormRow>
          <FormGrid cols={2}>
            <FormRow label="Pago base (S/)">
              <Input name="monto_base" type="number" step="0.01" min={0} defaultValue={0} />
            </FormRow>
            <FormRow label="Movilidad (S/)">
              <Input name="adicional_movilidad" type="number" step="0.01" min={0} defaultValue={0} />
            </FormRow>
          </FormGrid>
        </FormGrid>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" variant="premium" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />} Crear OS
          </Button>
        </div>
      </form>
    </Card>
  );
}
