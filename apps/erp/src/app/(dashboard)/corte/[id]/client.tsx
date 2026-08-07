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
import { agregarLineaCorte, cerrarCorte, crearOS, guardarTiemposCorte } from '@/server/actions/corte';
import { formatTallaChip } from '@happy/lib';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD', 'TU'] as const;

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
  usuarioEsGerente = false,
}: {
  corteId: string;
  lineas: Linea[];
  editable: boolean;
  /** Cantidad planificada en la OT por talla (para este modelo). */
  planPorTalla: Record<string, number>;
  /** Cantidad ya cortada en otros cortes del mismo OT/modelo, para calcular saldo. */
  cortadoOtrosPorTalla: Record<string, number>;
  /** Solo gerencia autoriza una cantidad real distinta a la teórica del plan. */
  usuarioEsGerente?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [tallaSel, setTallaSel] = useState('');
  const [cantTeorica, setCantTeorica] = useState('');
  const [cantReal, setCantReal] = useState('');
  const [motivo, setMotivo] = useState('');

  // ¿La real difiere de la teórica? → requiere gerencia + motivo.
  const realNum = cantReal.trim() === '' ? null : Number(cantReal);
  const teoNum = Number(cantTeorica) || 0;
  const difiereReal = realNum != null && realNum !== teoNum;
  const requiereAutorizacion = difiereReal && !usuarioEsGerente;

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
    if (!tallaSel) return toast.error('Elija una talla');
    if (!cantTeorica || Number(cantTeorica) <= 0) return toast.error('Ingrese la cantidad teórica');
    if (requiereAutorizacion) {
      return toast.error(`La cantidad real (${realNum}) difiere de la teórica (${teoNum}). Requiere autorización de gerencia.`);
    }
    if (difiereReal && !motivo.trim()) {
      return toast.error('Indique el motivo de la diferencia entre la real y la teórica.');
    }
    const fd = new FormData();
    fd.set('corte_id', corteId);
    fd.set('talla', tallaSel);
    fd.set('cantidad_teorica', cantTeorica);
    if (cantReal) fd.set('cantidad_real', cantReal);
    if (motivo.trim()) fd.set('motivo', motivo.trim());
    start(async () => {
      const r = await agregarLineaCorte(null, fd);
      if (r.ok) {
        toast.success(difiereReal ? 'Línea agregada — autorización registrada' : 'Línea agregada');
        setOpen(false);
        setMotivo('');
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
                    {formatTallaChip(t)}
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
            <FormRow label="Cant. real" hint="Cuánto efectivamente salió del corte (si ya lo sabe)">
              <Input
                type="number"
                min={0}
                value={cantReal}
                onChange={(e) => setCantReal(e.target.value)}
                placeholder="opcional"
                className={difiereReal ? 'border-amber-400 bg-amber-50' : ''}
              />
            </FormRow>
          </FormGrid>

          {difiereReal && (
            requiereAutorizacion ? (
              <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <strong>Requiere autorización de gerencia:</strong> la cantidad real ({realNum}) difiere de la teórica del plan ({teoNum}).
                Solicite a gerencia que registre esta liquidación.
              </div>
            ) : (
              <div className="mt-3">
                <FormRow label={`Motivo de la diferencia (teórica ${teoNum} → real ${realNum})`} required>
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ej: falla de tela, se cortó de más para cubrir merma…"
                    maxLength={200}
                  />
                </FormRow>
              </div>
            )
          )}

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
                <TableCell><Badge variant="outline">{formatTallaChip(l.talla)}</Badge></TableCell>
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

/**
 * Liquidación de corte por TELA (pedido del cliente 21-22/07/2026): para cada
 * tela de la receta se declara capas, metros, merma, responsable y los tiempos
 * de tendido/corte/habilitado (min + fecha). Los totales se suman a la cabecera.
 */
type TelaTiempo = {
  material_id: string;
  tela_nombre: string;
  codigo: string;
  tiempo_tendido_min: number;
  tiempo_corte_min: number;
  tiempo_habilitado_min: number;
  fecha_tendido: string;
  fecha_corte: string;
  fecha_habilitado: string;
  capas_tendidas: number;
  largo_pano: number;
  merma_metros: number;
  responsable_operario_id: string;
};
// Los valores numéricos se guardan como STRING mientras se edita para permitir
// escribir "0", "0.5", borrar, etc. sin que el valor se reinicie.
type TelaRow = {
  material_id: string;
  tela_nombre: string;
  codigo: string;
  tendido: string;
  corte: string;
  habilitado: string;
  fecha_tendido: string;
  fecha_corte: string;
  fecha_habilitado: string;
  capas: string;
  largo: string;
  merma: string;
  responsable: string;
};
const numOrCero = (s: string): number => {
  const n = Number((s ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
export function TiemposCorteEditor({
  corteId,
  telas,
  editable,
  operarios = [],
}: {
  corteId: string;
  telas: TelaTiempo[];
  editable: boolean;
  operarios?: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<TelaRow[]>(
    telas.map((t) => ({
      material_id: t.material_id,
      tela_nombre: t.tela_nombre,
      codigo: t.codigo,
      tendido: t.tiempo_tendido_min ? String(t.tiempo_tendido_min) : '',
      corte: t.tiempo_corte_min ? String(t.tiempo_corte_min) : '',
      habilitado: t.tiempo_habilitado_min ? String(t.tiempo_habilitado_min) : '',
      fecha_tendido: t.fecha_tendido ?? '',
      fecha_corte: t.fecha_corte ?? '',
      fecha_habilitado: t.fecha_habilitado ?? '',
      capas: t.capas_tendidas ? String(t.capas_tendidas) : '',
      largo: t.largo_pano ? String(t.largo_pano) : '',
      merma: t.merma_metros ? String(t.merma_metros) : '',
      responsable: t.responsable_operario_id ?? '',
    })),
  );

  function setNum(i: number, campo: 'tendido' | 'corte' | 'habilitado' | 'capas' | 'largo' | 'merma', v: string) {
    if (v !== '' && !/^\d*[.,]?\d*$/.test(v)) return; // solo números
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: v } : r)));
  }
  function setCampo(i: number, campo: 'fecha_tendido' | 'fecha_corte' | 'fecha_habilitado' | 'responsable', v: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: v } : r)));
  }

  function guardar() {
    start(async () => {
      const r = await guardarTiemposCorte(
        corteId,
        rows.map((t) => ({
          material_id: t.material_id,
          tela_nombre: t.tela_nombre,
          tiempo_tendido_min: numOrCero(t.tendido),
          tiempo_corte_min: numOrCero(t.corte),
          tiempo_habilitado_min: numOrCero(t.habilitado),
          fecha_tendido: t.fecha_tendido,
          fecha_corte: t.fecha_corte,
          fecha_habilitado: t.fecha_habilitado,
          capas_tendidas: Math.round(numOrCero(t.capas)),
          largo_pano: numOrCero(t.largo),
          merma_metros: numOrCero(t.merma),
          responsable_operario_id: t.responsable,
        })),
      );
      if (r.ok) { toast.success('Liquidación guardada'); router.refresh(); }
      else toast.error(r.error ?? 'Error');
    });
  }

  if (telas.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">
        La receta del modelo no tiene telas cargadas — no hay liquidación que registrar.
      </div>
    );
  }

  const totalTiempo = (t: TelaRow) => numOrCero(t.tendido) + numOrCero(t.corte) + numOrCero(t.habilitado);
  // Consumo real = capas × largo de paño + merma (pedido del cliente 22/07/2026).
  const consumoReal = (t: TelaRow) => numOrCero(t.capas) * numOrCero(t.largo) + numOrCero(t.merma);
  const OPERS = [
    { key: 'tendido' as const, fecha: 'fecha_tendido' as const, label: 'Tendido' },
    { key: 'corte' as const, fecha: 'fecha_corte' as const, label: 'Corte' },
    { key: 'habilitado' as const, fecha: 'fecha_habilitado' as const, label: 'Habilitado' },
  ];

  return (
    <div className="space-y-3 p-4">
      <p className="text-xs text-slate-500">
        Declare por cada <strong>tela</strong> de la receta: capas, metros, merma, responsable y los tiempos (con fecha) de tendido, corte y habilitado.
      </p>
      {rows.map((t, i) => (
        <div key={t.material_id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-corp-900">{t.tela_nombre}</span>
            <span className="font-mono text-[10px] text-slate-400">{t.codigo}</span>
            <span className="ml-auto font-mono text-[11px] text-slate-500">Tiempo total: {totalTiempo(t).toFixed(2)} min</span>
          </div>

          {/* Liquidación de tela */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Capas tendidas
              <Input type="text" inputMode="numeric" value={t.capas} onChange={(e) => setNum(i, 'capas', e.target.value)}
                disabled={!editable || pending} placeholder="0" className="mt-1 h-8 text-sm" />
            </label>
            <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Largo de paño (m)
              <Input type="text" inputMode="decimal" value={t.largo} onChange={(e) => setNum(i, 'largo', e.target.value)}
                disabled={!editable || pending} placeholder="0.00" className="mt-1 h-8 text-sm" />
            </label>
            <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Merma (m)
              <Input type="text" inputMode="decimal" value={t.merma} onChange={(e) => setNum(i, 'merma', e.target.value)}
                disabled={!editable || pending} placeholder="0.00" className="mt-1 h-8 text-sm" />
            </label>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Consumo real (m)
              <div
                className="mt-1 flex h-8 items-center rounded-md border border-emerald-200 bg-emerald-50/60 px-2 font-mono text-sm font-semibold text-emerald-700"
                title="Capas × largo de paño + merma"
              >
                {consumoReal(t).toFixed(2)}
              </div>
            </div>
            <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Responsable
              <select value={t.responsable} onChange={(e) => setCampo(i, 'responsable', e.target.value)}
                disabled={!editable || pending}
                className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">— Sin asignar —</option>
                {operarios.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </label>
          </div>

          {/* Tiempos por operación */}
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {OPERS.map(({ key, fecha, label }) => (
              <div key={key} className="rounded-md border border-slate-100 bg-slate-50/60 p-2">
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <div className="flex items-center gap-1">
                  <Input type="text" inputMode="decimal" value={t[key]} onChange={(e) => setNum(i, key, e.target.value)}
                    disabled={!editable || pending} placeholder="0 min" className="h-8 flex-1 text-sm" />
                  <Input type="date" value={t[fecha]} onChange={(e) => setCampo(i, fecha, e.target.value)}
                    disabled={!editable || pending} className="h-8 w-32 text-[11px]" title={`Fecha de ${label.toLowerCase()}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {editable && (
        <div className="flex justify-end">
          <Button variant="premium" size="sm" onClick={guardar} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Guardar liquidación
          </Button>
        </div>
      )}
    </div>
  );
}

export function AccionCerrarCorte({ corteId, tieneTiempos = true }: { corteId: string; tieneTiempos?: boolean }) {
  const [pending, start] = useTransition();
  function cerrar() {
    if (!tieneTiempos) {
      toast.error('Antes de cerrar, registre los tiempos por tela (tendido, corte, habilitado) en la liquidación. Después de cerrar no se podrán modificar.');
      return;
    }
    if (!confirm('¿Cerrar este corte? Después no se podrán modificar los tiempos ni agregar tallas.')) return;
    start(async () => {
      const r = await cerrarCorte(corteId);
      if (r.ok) toast.success('Corte cerrado');
      else toast.error(r.error ?? 'Error');
    });
  }
  return (
    <Button onClick={cerrar} disabled={pending || !tieneTiempos} variant="premium" title={!tieneTiempos ? 'Registre los tiempos de corte antes de cerrar' : undefined}>
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
