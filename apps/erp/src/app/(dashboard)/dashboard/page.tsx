import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { formatPEN, formatNumber } from '@happy/lib';
import { createClient } from '@happy/db/server';
import { TrendingUp, Package, AlertTriangle, Factory, Receipt, Globe, Users, Layers } from 'lucide-react';
import { VentasUltimos30Chart, TopProductosChart, VentasPorCanalChart, OtsPorEstadoChart } from './charts';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

async function loadData() {
  const sb = await createClient();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const hace30 = new Date(); hace30.setDate(hace30.getDate() - 30);

  const [
    productosCount,
    ventasHoyData,
    ventasUlt30,
    otPendientesCount,
    pedidosWebPendientesCount,
    reclamosNuevosCount,
    clientesCount,
    stockBajoCount,
    topProductos,
    otsPorEstado,
  ] = await Promise.all([
    sb.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
    sb.from('ventas').select('total').gte('fecha', today.toISOString()).eq('estado', 'COMPLETADA'),
    sb.from('ventas').select('fecha, total, canal').gte('fecha', hace30.toISOString()).eq('estado', 'COMPLETADA').limit(5000),
    sb.from('ot').select('id', { count: 'exact', head: true }).not('estado', 'in', '("COMPLETADA","CANCELADA")'),
    sb.from('pedidos_web').select('id', { count: 'exact', head: true }).eq('estado', 'PENDIENTE_PAGO'),
    sb.from('reclamos').select('id', { count: 'exact', head: true }).eq('estado', 'NUEVO'),
    sb.from('clientes').select('id', { count: 'exact', head: true }).eq('activo', true),
    sb.from('v_stock_alertas').select('almacen_id', { count: 'exact', head: true }),
    sb.from('v_top_productos').select('producto, unidades_vendidas, monto_total').limit(8),
    sb.from('ot').select('estado'),
  ]);

  const montoHoy = (ventasHoyData.data ?? []).reduce((a, v) => a + Number(v.total ?? 0), 0);

  const porDia = new Map<string, { total: number; ventas: number }>();
  const porCanal = new Map<string, number>();
  for (const v of (ventasUlt30.data ?? [])) {
    const dia = String(v.fecha).slice(5, 10);
    const cur = porDia.get(dia) ?? { total: 0, ventas: 0 };
    cur.total += Number(v.total ?? 0);
    cur.ventas += 1;
    porDia.set(dia, cur);
    porCanal.set(v.canal as string, (porCanal.get(v.canal as string) ?? 0) + Number(v.total ?? 0));
  }
  const ventasDias = Array.from(porDia.entries()).map(([dia, v]) => ({ dia, ...v })).sort((a, b) => a.dia.localeCompare(b.dia));
  const ventasCanal = Array.from(porCanal.entries()).map(([canal, monto]) => ({ canal, monto }));

  const top = (topProductos.data ?? []).map((t) => ({
    producto: (t.producto as string) ?? '',
    unidades: Number(t.unidades_vendidas ?? 0),
    monto: Number(t.monto_total ?? 0),
  }));

  const otsAgg = new Map<string, number>();
  for (const o of (otsPorEstado.data ?? [])) {
    otsAgg.set(o.estado as string, (otsAgg.get(o.estado as string) ?? 0) + 1);
  }
  const otsByEstado = Array.from(otsAgg.entries()).map(([estado, total]) => ({ estado, total }));

  return {
    productosCount: productosCount.count ?? 0,
    ventasHoy: (ventasHoyData.data ?? []).length,
    montoHoy,
    otPendientes: otPendientesCount.count ?? 0,
    pedidosWebPendientes: pedidosWebPendientesCount.count ?? 0,
    reclamosNuevos: reclamosNuevosCount.count ?? 0,
    clientesCount: clientesCount.count ?? 0,
    stockBajo: stockBajoCount.count ?? 0,
    ventasDias, ventasCanal, top, otsByEstado,
  };
}

export default async function DashboardPage() {
  const k = await loadData();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold text-corp-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Resumen operativo en tiempo real</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Receipt className="h-5 w-5" />} label="Ventas hoy" value={formatPEN(k.montoHoy)} sub={`${k.ventasHoy} transacciones`} color="from-happy-500 to-happy-600" />
        <Kpi icon={<Factory className="h-5 w-5" />} label="OTs en curso" value={formatNumber(k.otPendientes)} sub="Producción activa" color="from-corp-700 to-corp-900" />
        <Kpi icon={<Package className="h-5 w-5" />} label="Productos activos" value={formatNumber(k.productosCount)} sub="Catálogo maestro" color="from-corp-500 to-corp-700" />
        <Kpi icon={<Globe className="h-5 w-5" />} label="Pedidos web pendientes" value={formatNumber(k.pedidosWebPendientes)} sub="Esperan verificación" color="from-happy-600 to-danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-happy-600" /> Ventas últimos 30 días</CardTitle>
            <CardDescription>Monto total por día</CardDescription>
          </CardHeader>
          <CardContent>
            {k.ventasDias.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-sm text-slate-400">Sin ventas en los últimos 30 días</div>
            ) : <VentasUltimos30Chart data={k.ventasDias} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas</CardTitle>
            <CardDescription>Pendientes que requieren acción</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Reclamos nuevos INDECOPI" value={formatNumber(k.reclamosNuevos)} tone={k.reclamosNuevos ? 'warning' : 'default'} />
            <Row label="Pedidos web esperan pago" value={formatNumber(k.pedidosWebPendientes)} tone={k.pedidosWebPendientes ? 'warning' : 'default'} />
            <Row label="Stock bajo (alertas)" value={formatNumber(k.stockBajo)} tone={k.stockBajo ? 'warning' : 'default'} />
            <Row label="OTs en producción" value={formatNumber(k.otPendientes)} tone="default" />
            <hr />
            <Row label="Total clientes activos" value={formatNumber(k.clientesCount)} tone="default" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-corp-700" /> Top productos (90 días)</CardTitle>
            <CardDescription>Por unidades vendidas</CardDescription>
          </CardHeader>
          <CardContent>
            {k.top.length === 0 ? (
              <div className="flex h-60 items-center justify-center text-sm text-slate-400">Sin datos</div>
            ) : <TopProductosChart data={k.top} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-happy-600" /> Ventas por canal (30d)</CardTitle>
            <CardDescription>POS · Web · B2B</CardDescription>
          </CardHeader>
          <CardContent>
            {k.ventasCanal.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-slate-400">Sin datos</div>
            ) : <VentasPorCanalChart data={k.ventasCanal} />}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Factory className="h-4 w-4 text-corp-900" /> OTs por estado</CardTitle>
        </CardHeader>
        <CardContent>
          {k.otsByEstado.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-sm text-slate-400">Sin OTs registradas</div>
          ) : <OtsPorEstadoChart data={k.otsByEstado} />}
        </CardContent>
      </Card>
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
        <p className="font-display text-3xl font-semibold tracking-tight text-corp-900">{value}</p>
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
