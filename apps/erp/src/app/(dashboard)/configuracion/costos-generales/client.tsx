'use client';

/**
 * Costos de toda la empresa, y cómo se reparten entre las áreas.
 *
 * Dos bloques en una sola pantalla a propósito: el monto y el reparto son la
 * misma decisión. Ver "S/ 1 200 de luz" sin ver a quién se le carga no sirve
 * para nada, y al revés tampoco.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Plus, Trash2, Save, Loader2, Split, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  agregarCostoGeneral, eliminarCostoGeneral, guardarProrrateo,
  repartirEnPartesIguales, type CostoGeneral,
} from '@/server/actions/costos-generales';

type Area = { id: string; codigo: string; nombre: string; prorrateo_pct: number };

const CATEGORIAS = [
  { v: 'SERVICIOS', l: 'Servicios (luz, agua, internet)' },
  { v: 'ALQUILER', l: 'Alquiler del local' },
  { v: 'MANO_OBRA', l: 'Personal no asignado a un área' },
  { v: 'DEPRECIACION', l: 'Depreciación' },
  { v: 'MANTENIMIENTO', l: 'Mantenimiento' },
  { v: 'INSUMOS', l: 'Insumos generales' },
  { v: 'OTROS', l: 'Otros' },
] as const;

export function CostosGeneralesClient({
  periodo, periodos, costos, areas,
}: {
  periodo: string;
  periodos: string[];
  costos: CostoGeneral[];
  areas: Area[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  const [categoria, setCategoria] = useState<string>('SERVICIOS');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');

  const [reparto, setReparto] = useState<Record<string, string>>(
    () => Object.fromEntries(areas.map((a) => [a.id, String(a.prorrateo_pct ?? 0)])),
  );

  const total = costos.reduce((s, c) => s + Number(c.monto), 0);
  const suma = useMemo(
    () => Object.values(reparto).reduce((s, v) => s + (Number(v) || 0), 0),
    [reparto],
  );
  const sinRepartir = Math.max(0, 100 - suma);

  function agregar() {
    if (!concepto.trim()) return toast.error('Escribe a qué corresponde el costo');
    const n = Number(monto);
    if (!Number.isFinite(n) || n <= 0) return toast.error('Pon un monto mayor a cero');
    iniciar(async () => {
      const r = await agregarCostoGeneral({ periodo, categoria: categoria as 'SERVICIOS', concepto, monto: n });
      if (!r.ok) { toast.error(r.error); return; }
      setConcepto(''); setMonto('');
      toast.success('Costo agregado');
      router.refresh();
    });
  }

  function borrar(id: string, c: CostoGeneral) {
    iniciar(async () => {
      if (!confirm(`¿Borrar "${c.concepto}" por ${formatPEN(Number(c.monto))}?`)) return;
      const r = await eliminarCostoGeneral(id);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Costo eliminado');
      router.refresh();
    });
  }

  function guardarReparto() {
    iniciar(async () => {
      const r = await guardarProrrateo({
        reparto: areas.map((a) => ({ area_id: a.id, porcentaje: Number(reparto[a.id] ?? 0) })),
      });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Reparto guardado', {
        description: r.suma < 99.99
          ? `Ojo: los porcentajes suman ${r.suma.toFixed(2)}%. El resto no se le carga a ninguna área.`
          : 'Los costos generales ya se reparten con estos porcentajes.',
      });
      router.refresh();
    });
  }

  function partesIguales() {
    iniciar(async () => {
      const r = await repartirEnPartesIguales();
      if (!r.ok) { toast.error(r.error); return; }
      toast.success('Repartido en partes iguales — ajústalo a mano si hace falta');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="border-corp-200 bg-corp-50/50">
        <CardContent className="py-4 text-sm text-slate-700">
          <p className="mb-1 font-semibold text-corp-900">Qué va acá y qué no</p>
          <p className="text-xs">
            Acá van los costos que son de <b>toda la empresa</b> y llegan en un solo recibo: la luz,
            el agua, el internet, el alquiler del local. Se cargan una vez al mes y cada área toma
            la porción que le toca según el reparto de abajo.
          </p>
          <p className="mt-2 text-xs">
            Lo que es de <b>un área sola</b> —el alquiler de una bordadora, el mantenimiento de una
            máquina, la planilla de sus operarios— sigue yendo en la pantalla de costos de esa área.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mes</span>
        {periodos.map((p) => (
          <a key={p} href={`?periodo=${p}`}>
            <Badge variant={p === periodo ? 'default' : 'secondary'} className="cursor-pointer">{p}</Badge>
          </a>
        ))}
      </div>

      {/* ─────────── Los costos del mes ─────────── */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px]">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Tipo</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                disabled={pendiente}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                {CATEGORIAS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Concepto</label>
              <Input
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregar()}
                placeholder="Recibo de luz de setiembre"
                disabled={pendiente}
                className="h-9"
              />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-[10px] uppercase tracking-wide text-slate-500">Monto S/</label>
              <Input
                type="number" step="0.01" min="0" value={monto}
                onChange={(e) => setMonto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && agregar()}
                placeholder="0.00" disabled={pendiente} className="h-9"
              />
            </div>
            <Button variant="premium" onClick={agregar} disabled={pendiente}>
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </Button>
          </div>

          {costos.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Todavía no hay costos generales cargados para este mes.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {costos.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2">
                      <span className="text-[10px] uppercase tracking-wide text-slate-400">
                        {CATEGORIAS.find((x) => x.v === c.categoria)?.l ?? c.categoria}
                      </span>
                      <div className="text-corp-900">{c.concepto}</div>
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatPEN(Number(c.monto))}</td>
                    <td className="w-10 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => borrar(c.id, c)}
                        disabled={pendiente}
                        className="text-slate-400 hover:text-red-600"
                        title="Borrar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold text-corp-900">Total del mes</td>
                  <td className="py-2 text-right font-mono text-base font-bold tabular-nums text-corp-900">
                    {formatPEN(total)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* ─────────── El reparto ─────────── */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-corp-900">Cómo se reparte entre las áreas</p>
              <p className="text-xs text-slate-500">
                Qué porcentaje de esos {formatPEN(total)} carga cada área. Se guarda una vez y vale
                para todos los meses.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={partesIguales} disabled={pendiente}>
              <Split className="h-4 w-4" /> Partes iguales
            </Button>
          </div>

          <table className="w-full text-sm">
            <thead className="border-b text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 text-left">Área</th>
                <th className="py-2 text-right">% que carga</th>
                <th className="py-2 text-right">Le toca este mes</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const pct = Number(reparto[a.id] ?? 0) || 0;
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-1.5">
                      <span className="font-mono text-[11px] text-slate-500">{a.codigo}</span>{' '}
                      {a.nombre}
                    </td>
                    <td className="py-1.5 text-right">
                      <Input
                        type="number" step="0.01" min="0" max="100"
                        value={reparto[a.id] ?? '0'}
                        onChange={(e) => setReparto((m) => ({ ...m, [a.id]: e.target.value }))}
                        disabled={pendiente}
                        className="ml-auto h-8 w-24 text-right text-xs"
                      />
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">
                      {formatPEN((total * pct) / 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="text-xs">
              Suma:{' '}
              <b className={suma > 100.01 ? 'text-red-600' : suma < 99.99 ? 'text-amber-600' : 'text-emerald-700'}>
                {suma.toFixed(2)}%
              </b>
              {sinRepartir > 0.01 && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {formatPEN((total * sinRepartir) / 100)} no se le carga a ninguna área
                </span>
              )}
            </div>
            <Button variant="premium" onClick={guardarReparto} disabled={pendiente || suma > 100.01}>
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar reparto
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
