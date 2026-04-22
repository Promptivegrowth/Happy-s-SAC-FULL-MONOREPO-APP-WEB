import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { formatPEN, formatNumber } from '@happy/lib';
import { createClient } from '@happy/db/server';
import { TrendingUp, Package, AlertTriangle, Factory, Receipt, Globe } from 'lucide-react';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

async function loadKpis() {
  const sb = await createClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [
    { count: productosCount },
    { count: ventasHoy, data: _vh },
    { data: ventasHoyRows },
    { count: otPendientes },
    { count: pedidosWebPendientes },
    { count: reclamosNuevos },
  ] = await Promise.all([
    sb.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
    sb.from('ventas').select('id', { count: 'exact', head: true }).gte('fecha', today.toISOString()).eq('estado', 'COMPLETADA'),
    sb.from('ventas').select('total').gte('fecha', today.toISOString()).eq('estado', 'COMPLETADA'),
    sb.from('ot').select('id', { count: 'exact', head: true }).not('estado', 'in', '("COMPLETADA","CANCELADA")'),
    sb.from('pedidos_web').select('id', { count: 'exact', head: true }).eq('estado', 'PENDIENTE_PAGO'),
    sb.from('reclamos').select('id', { count: 'exact', head: true }).eq('estado', 'NUEVO'),
  ]);
  const montoHoy = (ventasHoyRows ?? []).reduce((a, v) => a + Number(v.total ?? 0), 0);
  return { productosCount, ventasHoy, montoHoy, otPendientes, pedidosWebPendientes, reclamosNuevos };
}

export default async function DashboardPage() {
  const k = await loadKpis();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-500">Resumen operativo en tiempo real</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Receipt className="h-5 w-5" />} label="Ventas hoy" value={formatPEN(k.montoHoy ?? 0)} sub={`${k.ventasHoy ?? 0} transacciones`} color="from-happy-500 to-carnival-pink" />
        <Kpi icon={<Factory className="h-5 w-5" />} label="OTs en curso" value={formatNumber(k.otPendientes ?? 0)} sub="Producción activa" color="from-carnival-purple to-carnival-sky" />
        <Kpi icon={<Package className="h-5 w-5" />} label="Productos activos" value={formatNumber(k.productosCount ?? 0)} sub="Catálogo maestro" color="from-carnival-teal to-carnival-sky" />
        <Kpi icon={<Globe className="h-5 w-5" />} label="Pedidos web pendientes" value={formatNumber(k.pedidosWebPendientes ?? 0)} sub="Esperan verificación" color="from-amber-500 to-red-500" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ventas últimos 30 días</CardTitle>
            <CardDescription>Gráfico por canal (POS / Web / B2B)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-60 items-center justify-center rounded-lg border border-dashed bg-slate-50 text-sm text-slate-400">
              <TrendingUp className="mr-2 h-4 w-4" />
              Se renderiza con Recharts — conectar a <code className="mx-1 rounded bg-slate-200 px-1">v_kpi_ventas_dia</code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas</CardTitle>
            <CardDescription>Pendientes que requieren acción</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Reclamos nuevos INDECOPI" value={formatNumber(k.reclamosNuevos ?? 0)} tone={k.reclamosNuevos ? 'warning' : 'default'} />
            <Row label="Pedidos web esperan pago" value={formatNumber(k.pedidosWebPendientes ?? 0)} tone={k.pedidosWebPendientes ? 'warning' : 'default'} />
            <Row label="OTs en producción" value={formatNumber(k.otPendientes ?? 0)} tone="default" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${color} opacity-15`} />
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${color} text-white shadow-sm`}>
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: 'default' | 'warning' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <Badge variant={tone === 'warning' ? 'warning' : 'secondary'}>{value}</Badge>
    </div>
  );
}
