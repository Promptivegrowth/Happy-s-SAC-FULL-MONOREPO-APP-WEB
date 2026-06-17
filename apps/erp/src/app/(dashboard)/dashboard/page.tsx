import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@happy/ui/card';
import { Skeleton } from '@happy/ui/skeleton';
import { formatPEN, formatNumber } from '@happy/lib';
import {
  TrendingUp, TrendingDown, Minus, Package, AlertTriangle, Factory, Receipt, Globe,
  Layers, ClipboardCheck, ShoppingBag, ShieldAlert,
} from 'lucide-react';
import {
  CurvaS, VentasComparativasChart, VentasPorCanalChart, TopProductosChart, OtsPorEstadoChart,
} from './charts';
import { PeriodoSelector } from './periodo-selector';
import { resolvePeriodo, type PeriodoKey } from '@/server/actions/dashboard-helpers';
import { loadDashboard, type DashboardData, type KpiComparativo } from '@/server/actions/dashboard';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

type SP = { [k: string]: string | string[] | undefined };

export default async function DashboardPage(props: { searchParams: Promise<SP> }) {
  const searchParams = await props.searchParams;
  const periodo = resolvePeriodo(searchParams);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-corp-900">Dashboard</h1>
          <p className="text-sm text-slate-500">
            Resumen operativo · {periodo.dias} {periodo.dias === 1 ? 'día' : 'días'}
          </p>
        </div>
        <PeriodoSelector current={periodo.key as PeriodoKey} />
      </div>

      <Suspense key={`${periodo.desdeIso}-${periodo.hastaIso}`} fallback={<DashboardSkeleton />}>
        <DashboardContent desde={periodo.desdeIso} hasta={periodo.hastaIso} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({ desde, hasta }: { desde: string; hasta: string }) {
  const d = await loadDashboard({ desde, hasta });
  return (
    <>
      <KpiGrid data={d} />
      <ChartGrid data={d} />
    </>
  );
}

// ---------- KPIs ----------

function KpiGrid({ data }: { data: DashboardData }) {
  const k = data.kpis;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        icon={<Receipt className="h-4 w-4" />}
        label="Ventas totales"
        valor={formatPEN(k.ventas.actual)}
        comp={k.ventas}
        color="from-happy-500 to-happy-600"
        formatter={formatPEN}
      />
      <KpiCard
        icon={<ShoppingBag className="h-4 w-4" />}
        label="Ticket promedio"
        valor={formatPEN(k.ticket_promedio.actual)}
        comp={k.ticket_promedio}
        color="from-happy-600 to-rose-500"
        formatter={formatPEN}
      />
      <KpiCard
        icon={<ClipboardCheck className="h-4 w-4" />}
        label="Comprobantes"
        valor={formatNumber(k.comprobantes.actual)}
        comp={k.comprobantes}
        color="from-corp-500 to-corp-700"
        formatter={(v) => `${formatNumber(v)}`}
      />
      <KpiCard
        icon={<Factory className="h-4 w-4" />}
        label="OTs en producción"
        valor={formatNumber(k.ots_activas.actual)}
        comp={null}
        sub="No completadas ni canceladas"
        color="from-corp-700 to-corp-900"
        formatter={formatNumber}
      />
      <KpiCard
        icon={<ClipboardCheck className="h-4 w-4" />}
        label="OTs completadas"
        valor={formatNumber(k.ots_completadas.actual)}
        comp={k.ots_completadas}
        color="from-emerald-500 to-emerald-600"
        formatter={formatNumber}
      />
      <KpiCard
        icon={<Package className="h-4 w-4" />}
        label="Unidades producidas"
        valor={formatNumber(k.unidades_producidas.actual)}
        comp={k.unidades_producidas}
        color="from-amber-500 to-orange-500"
        formatter={(v) => `${formatNumber(v)} und`}
      />
      <KpiCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Stock crítico"
        valor={formatNumber(k.stock_critico.count)}
        comp={null}
        sub={k.stock_critico.count > 0 ? 'Items bajo mínimo' : 'Sin alertas'}
        color="from-rose-500 to-rose-600"
        tone={k.stock_critico.count > 0 ? 'danger' : 'neutral'}
        formatter={formatNumber}
      />
      <KpiCard
        icon={<ShieldAlert className="h-4 w-4" />}
        label="Reclamos pendientes"
        valor={formatNumber(k.reclamos_pendientes.count)}
        comp={null}
        sub={
          k.reclamos_pendientes.vencidos > 0
            ? `${k.reclamos_pendientes.vencidos} > 15 días`
            : 'Sin vencidos'
        }
        color="from-rose-600 to-rose-700"
        tone={k.reclamos_pendientes.vencidos > 0 ? 'danger' : 'neutral'}
        formatter={formatNumber}
      />
    </div>
  );
}

function KpiCard({
  icon, label, valor, comp, sub, color, tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  comp: KpiComparativo | null;
  sub?: string;
  color: string;
  tone?: 'neutral' | 'danger';
  formatter: (v: number) => string;
}) {
  return (
    <Card className="group relative overflow-hidden transition hover:shadow-md">
      <div className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${color} opacity-10 transition group-hover:opacity-20`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</CardDescription>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${color} text-white shadow-sm`}>
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="font-display text-2xl font-semibold leading-tight tracking-tight text-corp-900">{valor}</p>
        {comp ? (
          <DeltaBadge delta={comp.delta_pct} anterior={comp.anterior} />
        ) : sub ? (
          <p className={`text-xs ${tone === 'danger' ? 'text-rose-600' : 'text-slate-500'}`}>{sub}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ delta, anterior }: { delta: number; anterior: number }) {
  const sinAnt = anterior === 0;
  const rounded = Math.abs(delta) < 0.1 ? 0 : delta;
  const isPos = rounded > 0;
  const isNeg = rounded < 0;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  const color = isPos ? 'text-emerald-600 bg-emerald-50' : isNeg ? 'text-rose-600 bg-rose-50' : 'text-slate-500 bg-slate-100';
  const label = sinAnt ? 'sin datos previos' : 'vs período anterior';
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>
        <Icon className="h-3 w-3" />
        {rounded === 0 ? '0%' : `${Math.abs(rounded).toFixed(1)}%`}
      </span>
      <span className="text-[11px] text-slate-400">{label}</span>
    </div>
  );
}

// ---------- Gráficos ----------

function ChartGrid({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-4">
      {/* Curva S - full width */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Factory className="h-4 w-4 text-happy-600" />
            Curva S de producción
          </CardTitle>
          <CardDescription>Unidades acumuladas: producción real vs plan</CardDescription>
        </CardHeader>
        <CardContent>
          {data.curva_s.dias.length === 0 ? (
            <EmptyChart h={320} msg="Sin datos en el período" />
          ) : (
            <CurvaS datos={data.curva_s.dias} />
          )}
        </CardContent>
      </Card>

      {/* Ventas comparativas + Por canal */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-happy-600" />
              Ventas por día
            </CardTitle>
            <CardDescription>Período actual vs período anterior</CardDescription>
          </CardHeader>
          <CardContent>
            {data.ventas_por_dia.actual.length === 0 ? (
              <EmptyChart h={280} msg="Sin ventas en el período" />
            ) : (
              <VentasComparativasChart actual={data.ventas_por_dia.actual} anterior={data.ventas_por_dia.anterior} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-corp-700" />
              Ventas por canal
            </CardTitle>
            <CardDescription>Distribución de montos</CardDescription>
          </CardHeader>
          <CardContent>
            {data.por_canal.length === 0 ? (
              <EmptyChart h={260} msg="Sin ventas en el período" />
            ) : (
              <VentasPorCanalChart data={data.por_canal} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top productos + OTs estado */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4 text-corp-700" />
              Top 10 productos
            </CardTitle>
            <CardDescription>Por unidades vendidas (ventana 90 días)</CardDescription>
          </CardHeader>
          <CardContent>
            {data.top_productos.length === 0 ? (
              <EmptyChart h={300} msg="Sin datos" />
            ) : (
              <TopProductosChart data={data.top_productos} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Factory className="h-4 w-4 text-corp-900" />
              OTs por estado
            </CardTitle>
            <CardDescription>Distribución actual del pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            {data.ots_por_estado.length === 0 ? (
              <EmptyChart h={280} msg="Sin OTs registradas" />
            ) : (
              <OtsPorEstadoChart data={data.ots_por_estado} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart({ h, msg }: { h: number; msg: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: h }}>
      {msg}
    </div>
  );
}

// ---------- Skeleton (Suspense fallback) ----------

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-72 w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-4 h-60 w-full" />
        </div>
      </div>
    </div>
  );
}
