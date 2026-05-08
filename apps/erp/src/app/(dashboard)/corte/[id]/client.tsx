'use client';

import { useMemo, useState, useTransition } from 'react';
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

export function LineasCorteEditor({
  corteId,
  lineas,
  editable,
  planPorTalla,
  cortadoOtrosPorTalla,
}: {
  corteId: string;
  lineas: Linea[];
  editable: boolean;
  /** Cantidad planificada en la OT por talla (para este modelo). */
  planPorTalla: Record<string, number>;
  /** Cantidad ya cortada en otros cortes del mismo OT/modelo, para calcular saldo. */
  cortadoOtrosPorTalla: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [tallaSel, setTallaSel] = useState('');
  const [cantTeorica, setCantTeorica] = useState('');
  const [cantReal, setCantReal] = useState('');

  const tallasUsadas = useMemo(() => new Set(lineas.map((l) => l.talla)), [lineas]);
  // Tallas disponibles: las que están en el plan de la OT y no fueron usadas
  // todavía en este corte. Si la OT no tiene plan (caso raro), caemos a la
  // lista completa de tallas para no bloquear.
  const tallasDelPlan = Object.keys(planPorTalla);
  const disponibles = (tallasDelPlan.length > 0 ? tallasDelPlan : (TALLAS as readonly string[]))
    .filter((t) => !tallasUsadas.has(t));

  function saldoDe(t: string): number {
    const plan = planPorTalla[t] ?? 0;
    const otros = cortadoOtrosPorTalla[t] ?? 0;
    return Math.max(0, plan - otros);
  }

  function abrir() {
    const primeraTalla = disponibles[0] ?? '';
    setTallaSel(primeraTalla);
    setCantTeorica(primeraTalla ? String(saldoDe(primeraTalla)) : '');
    setCantReal('');
    setOpen(true);
  }

  function onTallaChange(t: string) {
    setTallaSel(t);
    setCantTeorica(String(saldoDe(t)));
  }

  function submit() {
    if (!tallaSel) return toast.error('Elegí una talla');
    if (!cantTeorica || Number(cantTeorica) <= 0) return toast.error('Ingresá la cantidad teórica');
    const fd = new FormData();
    fd.set('corte_id', corteId);
    fd.set('talla', tallaSel);
    fd.set('cantidad_teorica', cantTeorica);
    if (cantReal) fd.set('cantidad_real', cantReal);
    start(async () => {
      const r = await agregarLineaCorte(null, fd);
      if (r.ok) {
        toast.success('Línea agregada');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <div>
      {editable && open && (
        <Card className="m-4 border-happy-300 bg-happy-50/40 p-4">
          <FormGrid cols={3}>
            <FormRow
              label="Talla"
              required
              hint={planPorTalla[tallaSel] !== undefined
                ? `Plan: ${planPorTalla[tallaSel]} · Saldo: ${saldoDe(tallaSel)}`
                : undefined}
            >
              <select
                value={tallaSel}
                onChange={(e) => onTallaChange(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {disponibles.map((t) => (
                  <option key={t} value={t}>
                    {t.replace('T', '')}
                    {planPorTalla[t] !== undefined ? ` (saldo ${saldoDe(t)})` : ''}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Cant. teórica" required hint="Auto-completa con el saldo del plan">
              <Input
                type="number"
                min={1}
                value={cantTeorica}
                onChange={(e) => setCantTeorica(e.target.value)}
              />
            </FormRow>
            <FormRow label="Cant. real" hint="Cuánto efectivamente salió del corte (si ya lo sabés)">
              <Input
                type="number"
                min={0}
                value={cantReal}
                onChange={(e) => setCantReal(e.target.value)}
                placeholder="opcional"
              />
            </FormRow>
          </FormGrid>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button type="button" variant="premium" onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Agregar
            </Button>
          </div>
        </Card>
      )}
      {editable && !open && (
        <div className="px-4 pt-4">
          <Button variant="premium" size="sm" onClick={abrir} disabled={disponibles.length === 0}>
            <Plus className="h-4 w-4" />
            {disponibles.length === 0 ? 'Todas las tallas del plan ya cargadas' : 'Agregar talla'}
          </Button>
        </div>
      )}
      <Table>
        <TableHeader><TableRow>
          <TableHead>Talla</TableHead>
          <TableHead className="text-right">Teórica</TableHead>
          <TableHead className="text-right">Real</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {lineas.length === 0 ? (
            <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-slate-400">Sin líneas. Agrega tallas para empezar.</TableCell></TableRow>
          ) : lineas.map((l) => {
            const dif = (l.cantidad_real ?? l.cantidad_teorica) - l.cantidad_teorica;
            return (
              <TableRow key={l.id}>
                <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>
                <TableCell className="text-right font-mono">{l.cantidad_teorica}</TableCell>
                <TableCell className="text-right font-mono">{l.cantidad_real ?? '—'}</TableCell>
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
