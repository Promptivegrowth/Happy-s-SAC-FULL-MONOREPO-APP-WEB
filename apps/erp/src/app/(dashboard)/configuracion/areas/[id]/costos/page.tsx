import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Calculator, Info } from 'lucide-react';
import { formatPEN, formatNumber, formatDate } from '@happy/lib';
import { getJornadaEstandar, minutosEfectivos, formatoHoras, resumenJornada } from '../../../../operarios/_jornada';
import { CostosEditor, ParametrosEditor, AplicarValorMinutoButton, TraerPlanillaButton } from './client';

export const metadata = { title: 'Centro de costos del área' };
export const dynamic = 'force-dynamic';

type Costo = {
  id: string;
  categoria: string;
  concepto: string;
  monto: number;
  observacion: string | null;
  periodo: string;
};

const ETIQUETA_CATEGORIA: Record<string, string> = {
  MANO_OBRA: 'Mano de obra',
  ALQUILER: 'Alquiler',
  SERVICIOS: 'Servicios (luz, agua, internet)',
  DEPRECIACION: 'Depreciación de máquinas',
  MANTENIMIENTO: 'Mantenimiento',
  INSUMOS: 'Insumos indirectos',
  OTROS: 'Otros',
};

/** Días del mes que caen en un día laborable de la jornada estándar. */
const DIA_SEMANA = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "setiembre de 2026". Tolera períodos vacíos: el histórico viejo los tiene en null. */
function nombreMes(periodo: string | null | undefined): string {
  if (!periodo) return 'Sin período';
  const [a, m] = periodo.split('-').map(Number);
  if (!a || !m) return periodo;
  return new Date(a, m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const periodo = /^\d{4}-\d{2}$/.test(sp.periodo ?? '') ? sp.periodo! : periodoActual();

  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  const { data: area } = await sbAny
    .from('areas_produccion')
    .select('id, codigo, nombre, valor_minuto, activa')
    .eq('id', id)
    .maybeSingle();
  if (!area) notFound();

  const [{ data: costosRaw }, { data: paramRaw }, { data: opsRaw }, { data: histRaw }] = await Promise.all([
    sbAny.from('areas_costos_mensuales')
      .select('id, categoria, concepto, monto, observacion, periodo')
      .eq('area_id', id).eq('periodo', periodo)
      .order('categoria').order('created_at'),
    sbAny.from('areas_costos_parametros')
      .select('ocupacion_pct, minutos_override, notas')
      .eq('area_id', id).eq('periodo', periodo).maybeSingle(),
    sbAny.from('operarios')
      .select('id, nombres, apellido_paterno, sueldo_base')
      .eq('area_id', id).eq('activo', true),
    sbAny.from('areas_valor_minuto_historial')
      .select('periodo, valor_minuto, notas, created_at')
      .eq('area_id', id).order('created_at', { ascending: false }).limit(6),
  ]);

  const costos = (costosRaw ?? []) as Costo[];
  const operarios = (opsRaw ?? []) as { id: string; nombres: string; apellido_paterno: string | null; sueldo_base: number | string | null }[];
  const parametros = (paramRaw ?? null) as { ocupacion_pct: number | string; minutos_override: number | string | null; notas: string | null } | null;
  const historial = (histRaw ?? []) as { periodo: string | null; valor_minuto: number | string; notas: string | null; created_at: string }[];

  const ocupacionPct = Number(parametros?.ocupacion_pct ?? 85);
  const minutosOverride = parametros?.minutos_override != null ? Number(parametros.minutos_override) : null;

  // ---- Minutos disponibles del mes según la jornada estándar ----------------
  const jornada = await getJornadaEstandar();
  const [anio, mes] = periodo.split('-').map(Number);
  const diasDelMes = new Date(anio!, mes!, 0).getDate();
  let minutosPorOperario = 0;
  let diasHabiles = 0;
  for (let d = 1; d <= diasDelMes; d++) {
    const clave = DIA_SEMANA[new Date(anio!, mes! - 1, d).getDay()]!;
    const horario = jornada.dias.includes(clave) ? jornada.horarios[clave] : undefined;
    if (!horario) continue;
    diasHabiles++;
    minutosPorOperario += minutosEfectivos(horario);
  }

  const minutosJornada = minutosPorOperario * operarios.length;
  const minutosProductivos = minutosOverride ?? Math.round((minutosJornada * ocupacionPct) / 100);

  const totalCostos = costos.reduce((s, c) => s + Number(c.monto), 0);
  const porCategoria = new Map<string, number>();
  for (const c of costos) porCategoria.set(c.categoria, (porCategoria.get(c.categoria) ?? 0) + Number(c.monto));

  const valorCalculado = minutosProductivos > 0 ? totalCostos / minutosProductivos : 0;
  const valorActual = Number(area.valor_minuto ?? 0);
  const diferencia = valorActual > 0 ? ((valorCalculado - valorActual) / valorActual) * 100 : 0;

  const notaCalculo =
    `${nombreMes(periodo)}: ${formatPEN(totalCostos)} de costos ÷ ${formatNumber(minutosProductivos, 0)} min productivos ` +
    `(${operarios.length} operario(s), ${diasHabiles} días, ${ocupacionPct}% de ocupación)`;

  const periodos: string[] = [];
  {
    const d = new Date();
    for (let i = 0; i < 6; i++) {
      periodos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() - 1);
    }
  }

  return (
    <PageShell
      title={`Centro de costos · ${area.nombre}`}
      description={`Registra acá los costos y pagos del área para que el valor minuto se calcule solo · ${nombreMes(periodo)}`}
      actions={
        <Link href="/configuracion/areas">
          <Button variant="outline" className="gap-1"><ArrowLeft className="h-4 w-4" /> Volver a Áreas</Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Mes:</span>
        {periodos.map((p) => (
          <Link
            key={p}
            href={`/configuracion/areas/${id}/costos?periodo=${p}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${p === periodo ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'}`}
          >
            {nombreMes(p)}
          </Link>
        ))}
      </div>

      <Card className="border-sky-200 bg-sky-50/60 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-700" />
          <div className="space-y-1 text-[12px] leading-relaxed text-sky-900">
            <p className="font-semibold">Dónde se registra cada cosa</p>
            <p>
              <strong>Acá</strong> van los costos y pagos del mes que pertenecen a esta área: planilla, alquiler del local,
              luz y agua, depreciación de las máquinas, mantenimiento e insumos indirectos. Es el centro de costo del área.
            </p>
            <p>
              <strong>La planilla</strong> puedes traerla con un botón: suma el sueldo base de los operarios activos
              asignados a esta área (se cargan en <Link href="/operarios" className="font-semibold underline">Operarios</Link>).
            </p>
            <p>
              <strong>Los pagos a talleres externos NO van acá</strong>: esos son servicio tercerizado y se registran en
              Talleres → Pagos; el valor minuto es el costo de la hora propia de la planta.
            </p>
            <p>
              <strong>El cálculo:</strong> valor minuto = costos del mes ÷ minutos productivos del mes. Los minutos salen de
              la jornada estándar ({resumenJornada(jornada)}) × operarios del área × % de ocupación. Al aplicarlo, el valor
              queda en el área y en su histórico.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Costos del mes</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(totalCostos)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">{costos.length} concepto(s) registrado(s)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Minutos productivos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatNumber(minutosProductivos, 0)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {operarios.length} operario(s) · {diasHabiles} días · {formatoHoras(minutosPorOperario)} por operario
            {minutosOverride != null ? ' · fijado a mano' : ` · ${ocupacionPct}% ocupación`}
          </p>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-xs text-emerald-700">Valor minuto calculado</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-emerald-800">
            <Calculator className="h-5 w-5" />
            S/ {valorCalculado.toFixed(3)}
          </p>
          <p className="mt-0.5 text-[10px] text-emerald-700">con los costos y minutos de este mes</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Valor minuto vigente</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">S/ {valorActual.toFixed(3)}</p>
          {valorActual > 0 && valorCalculado > 0 && (
            <p className={`mt-0.5 text-[10px] ${Math.abs(diferencia) < 5 ? 'text-slate-500' : diferencia > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              el calculado es {diferencia >= 0 ? '+' : ''}{diferencia.toFixed(1)}% respecto del vigente
            </p>
          )}
          <div className="mt-2">
            <AplicarValorMinutoButton
              areaId={id}
              periodo={periodo}
              valor={Number(valorCalculado.toFixed(3))}
              nota={notaCalculo}
              deshabilitado={!(valorCalculado > 0)}
            />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-corp-900">Costos y pagos del área · {nombreMes(periodo)}</h3>
          <TraerPlanillaButton
            areaId={id}
            periodo={periodo}
            operarios={operarios.length}
            planilla={operarios.reduce((s, o) => s + Number(o.sueldo_base ?? 0), 0)}
          />
        </div>
        <div className="p-0">
          <CostosEditor
            areaId={id}
            periodo={periodo}
            costos={costos.map((c) => ({
              id: c.id,
              categoria: c.categoria,
              concepto: c.concepto,
              monto: Number(c.monto),
              observacion: c.observacion ?? '',
            }))}
          />
        </div>
        {costos.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t bg-slate-50 p-3">
            {[...porCategoria.entries()].map(([cat, monto]) => (
              <Badge key={cat} variant="secondary" className="text-[10px]">
                {ETIQUETA_CATEGORIA[cat] ?? cat}: {formatPEN(monto)}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-corp-900">Minutos del mes</h3>
        </div>
        <div className="p-4">
          <ParametrosEditor
            areaId={id}
            periodo={periodo}
            ocupacionPct={ocupacionPct}
            minutosOverride={minutosOverride}
            notas={parametros?.notas ?? ''}
            minutosJornada={minutosJornada}
            detalle={`${operarios.length} operario(s) × ${diasHabiles} días × ${formatoHoras(Math.round(minutosPorOperario / Math.max(1, diasHabiles)))} efectivos por día`}
          />
        </div>
      </Card>

      {historial.length > 0 && (
        <Card>
          <div className="border-b bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-corp-900">Histórico del valor minuto</h3>
          </div>
          <div className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Valor minuto</TableHead>
                  <TableHead>Cómo se calculó</TableHead>
                  <TableHead>Registrado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((h, i) => (
                  <TableRow key={`${h.periodo ?? 'sin'}-${i}`}>
                    <TableCell className="text-sm capitalize">{nombreMes(h.periodo)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                      S/ {Number(h.valor_minuto).toFixed(3)}
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-slate-600">{h.notas ?? '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(h.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
