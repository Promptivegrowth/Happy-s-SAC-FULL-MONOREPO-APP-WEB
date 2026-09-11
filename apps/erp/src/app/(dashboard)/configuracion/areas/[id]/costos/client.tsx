'use client';

/**
 * Pantalla del CENTRO DE COSTOS de un área: alta de costos del mes, supuestos
 * de minutos y aplicación del valor minuto calculado.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Plus, Trash2, Loader2, Save, Users, Check } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN, formatNumber } from '@happy/lib';
import {
  guardarCostoArea,
  eliminarCostoArea,
  guardarParametrosCosteo,
  traerPlanillaDelArea,
  aplicarValorMinuto,
} from '@/server/actions/areas-costos';

const CATEGORIAS = [
  { valor: 'MANO_OBRA', label: 'Mano de obra (planilla del área)' },
  { valor: 'ALQUILER', label: 'Alquiler del local' },
  { valor: 'SERVICIOS', label: 'Servicios (luz, agua, internet)' },
  { valor: 'DEPRECIACION', label: 'Depreciación de máquinas' },
  { valor: 'MANTENIMIENTO', label: 'Mantenimiento y repuestos' },
  { valor: 'INSUMOS', label: 'Insumos indirectos (agujas, hilos de máquina…)' },
  { valor: 'OTROS', label: 'Otros' },
] as const;

const ETIQUETA: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.label]));

type CostoRow = {
  id: string;
  categoria: string;
  concepto: string;
  monto: number;
  observacion: string;
};

export function CostosEditor({
  areaId,
  periodo,
  costos,
}: {
  areaId: string;
  periodo: string;
  costos: CostoRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [categoria, setCategoria] = useState<string>('SERVICIOS');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [observacion, setObservacion] = useState('');

  function agregar() {
    const m = Number(monto.replace(',', '.'));
    if (!concepto.trim()) return toast.error('Escribe el concepto del costo');
    if (!Number.isFinite(m) || m < 0) return toast.error('Monto inválido');
    start(async () => {
      const r = await guardarCostoArea({ area_id: areaId, periodo, categoria: categoria as 'OTROS', concepto, monto: m, observacion });
      if (r.ok) {
        toast.success('Costo registrado');
        setConcepto(''); setMonto(''); setObservacion('');
        router.refresh();
      } else toast.error(r.error ?? 'No se pudo guardar');
    });
  }

  function borrar(id: string) {
    if (!confirm('¿Eliminar este costo del mes?')) return;
    start(async () => {
      const r = await eliminarCostoArea(id, areaId);
      if (r.ok) { toast.success('Costo eliminado'); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo eliminar');
    });
  }

  const total = costos.reduce((s, c) => s + c.monto, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 border-b border-dashed p-3">
        <div className="min-w-[220px] flex-1">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Tipo de costo</Label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={pending}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Concepto</Label>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} disabled={pending}
            placeholder="Ej. Recibo de luz de setiembre" className="h-9 text-sm" maxLength={120} />
        </div>
        <div className="w-32">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Monto S/</Label>
          <Input value={monto} onChange={(e) => setMonto(e.target.value)} disabled={pending}
            inputMode="decimal" placeholder="0.00" className="h-9 text-right text-sm" />
        </div>
        <div className="min-w-[160px] flex-1">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Observación</Label>
          <Input value={observacion} onChange={(e) => setObservacion(e.target.value)} disabled={pending}
            placeholder="Opcional" className="h-9 text-sm" maxLength={300} />
        </div>
        <Button variant="premium" size="sm" onClick={agregar} disabled={pending} className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Agregar
        </Button>
      </div>

      {costos.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          Todavía no hay costos cargados para este mes. Agrega la planilla, el alquiler y los servicios del área para que el
          valor minuto se calcule solo.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Observación</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costos.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Badge variant="secondary" className="text-[10px]">{ETIQUETA[c.categoria] ?? c.categoria}</Badge></TableCell>
                  <TableCell className="text-sm font-medium">{c.concepto}</TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-slate-500">{c.observacion || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPEN(c.monto)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => borrar(c.id)} disabled={pending} title="Eliminar costo">
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-slate-50 font-semibold">
                <TableCell colSpan={3}>Total del mes</TableCell>
                <TableCell className="text-right font-mono text-emerald-700">{formatPEN(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ParametrosEditor({
  areaId,
  periodo,
  ocupacionPct,
  minutosOverride,
  notas,
  minutosJornada,
  detalle,
}: {
  areaId: string;
  periodo: string;
  ocupacionPct: number;
  minutosOverride: number | null;
  notas: string;
  minutosJornada: number;
  detalle: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ocup, setOcup] = useState(String(ocupacionPct));
  const [override, setOverride] = useState(minutosOverride != null ? String(minutosOverride) : '');
  const [nota, setNota] = useState(notas);

  function guardar() {
    const o = Number(ocup.replace(',', '.'));
    if (!Number.isFinite(o) || o <= 0 || o > 100) return toast.error('La ocupación debe estar entre 1 y 100%');
    start(async () => {
      const r = await guardarParametrosCosteo({
        area_id: areaId, periodo, ocupacion_pct: o,
        minutos_override: override.trim() === '' ? '' : Number(override.replace(',', '.')),
        notas: nota,
      });
      if (r.ok) { toast.success('Supuestos guardados'); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo guardar');
    });
  }

  const calculado = Math.round((minutosJornada * (Number(ocup) || 0)) / 100);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-600">
        Minutos de jornada del mes: <strong>{formatNumber(minutosJornada, 0)}</strong> ({detalle}). De esos, la parte que
        realmente se produce es el <strong>% de ocupación</strong>: lo demás se va en cambios de modelo, limpieza y paradas.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">% de ocupación</Label>
          <Input value={ocup} onChange={(e) => setOcup(e.target.value)} disabled={pending} inputMode="decimal" className="h-9 text-right text-sm" />
        </div>
        <div className="w-48">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Minutos fijados a mano</Label>
          <Input value={override} onChange={(e) => setOverride(e.target.value)} disabled={pending}
            inputMode="decimal" placeholder="Opcional" className="h-9 text-right text-sm" />
        </div>
        <div className="min-w-[220px] flex-1">
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Nota del mes</Label>
          <Input value={nota} onChange={(e) => setNota(e.target.value)} disabled={pending}
            placeholder="Ej. dos semanas con una máquina parada" className="h-9 text-sm" maxLength={300} />
        </div>
        <Button variant="premium" size="sm" onClick={guardar} disabled={pending} className="gap-1">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        Con {ocup || 0}% de ocupación quedan <strong>{formatNumber(calculado, 0)}</strong> minutos productivos
        {override.trim() !== '' && ', pero manda el valor fijado a mano'}.
      </p>
    </div>
  );
}

export function TraerPlanillaButton({
  areaId,
  periodo,
  operarios,
  planilla,
}: {
  areaId: string;
  periodo: string;
  operarios: number;
  planilla: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function traer() {
    start(async () => {
      const r = await traerPlanillaDelArea(areaId, periodo);
      if (r.ok && r.data) {
        toast.success(`Planilla cargada: ${formatPEN(r.data.total)} de ${r.data.operarios} operario(s)`);
        router.refresh();
      } else toast.error(r.error ?? 'No se pudo traer la planilla');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-500">
        {operarios} operario(s) en el área{planilla > 0 ? ` · planilla ${formatPEN(planilla)}` : ' · sin sueldo base cargado'}
      </span>
      <Button variant="outline" size="sm" onClick={traer} disabled={pending || operarios === 0} className="gap-1">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Traer planilla
      </Button>
    </div>
  );
}

export function AplicarValorMinutoButton({
  areaId,
  periodo,
  valor,
  nota,
  deshabilitado,
}: {
  areaId: string;
  periodo: string;
  valor: number;
  nota: string;
  deshabilitado: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function aplicar() {
    if (!confirm(`¿Aplicar S/ ${valor.toFixed(3)} como valor minuto del área?\n\n${nota}`)) return;
    start(async () => {
      const r = await aplicarValorMinuto(areaId, periodo, valor, nota);
      if (r.ok) { toast.success('Valor minuto actualizado'); router.refresh(); }
      else toast.error(r.error ?? 'No se pudo aplicar');
    });
  }

  return (
    <Button variant="premium" size="sm" onClick={aplicar} disabled={pending || deshabilitado} className="w-full gap-1">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aplicar al área
    </Button>
  );
}
