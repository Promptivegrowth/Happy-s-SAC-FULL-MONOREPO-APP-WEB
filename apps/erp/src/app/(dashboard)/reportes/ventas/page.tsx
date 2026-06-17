import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import {
  reporteVentas,
  listarAlmacenesLookup,
  type FiltrosVentas,
} from '@/server/actions/reportes';
import { CANALES_VENTA, hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Reporte de ventas' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; canal?: string; almacen_id?: string; vendedor_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const canal = (sp.canal as FiltrosVentas['canal']) || '';
  const almacen_id = sp.almacen_id || '';
  const vendedor_id = sp.vendedor_id || '';

  const [resultado, almacenes] = await Promise.all([
    reporteVentas({ desde, hasta, canal, almacen_id, vendedor_id }),
    listarAlmacenesLookup(),
  ]);

  const { metricas, rows } = resultado;
  const filtros: string[] = [
    `Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`,
    canal ? `Canal: ${canal}` : null,
    almacen_id ? `Almacén: ${almacenes.find((a) => a.id === almacen_id)?.nombre ?? almacen_id}` : null,
  ].filter(Boolean) as string[];

  const exportPayload = {
    titulo: 'Reporte de Ventas',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Fecha', key: 'fecha', formato: 'fecha' as const, width: 14 },
      { header: 'Comprobante', key: 'numero', width: 16 },
      { header: 'Canal', key: 'canal', width: 10 },
      { header: 'Almacén', key: 'almacen', width: 24 },
      { header: 'Vendedor', key: 'vendedor', width: 18 },
      { header: 'Cliente', key: 'cliente', width: 32 },
      { header: 'Total', key: 'total', formato: 'moneda' as const, width: 14 },
    ],
    rows: rows.map((r) => ({ ...r, fecha: r.fecha.slice(0, 10) })),
    totales: { total: metricas.total_ventas },
  };

  const trendUp = metricas.pct_vs_anterior >= 0;

  return (
    <PageShell
      title="Reporte de ventas"
      description={`Del ${formatDate(desde)} al ${formatDate(hasta)}`}
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total ventas</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(metricas.total_ventas)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500"># Comprobantes</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.cantidad_comprobantes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Ticket promedio</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(metricas.ticket_promedio)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">vs período anterior</p>
          <p className={`mt-1 inline-flex items-center gap-1 font-display text-2xl font-semibold ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
            {trendUp ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {metricas.pct_vs_anterior.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400">{formatPEN(metricas.total_anterior)} anterior</p>
        </Card>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3" method="get">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Desde</label>
          <input type="date" name="desde" defaultValue={desde} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Canal</label>
          <select name="canal" defaultValue={canal} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {CANALES_VENTA.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Almacén</label>
          <select name="almacen_id" defaultValue={almacen_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Vendedor (UUID)</label>
          <input type="text" name="vendedor_id" defaultValue={vendedor_id} placeholder="opcional" className="h-9 w-44 rounded-md border px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">
          Aplicar
        </button>
        <Link href="/reportes/ventas" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">
          Limpiar
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<TrendingUp className="h-6 w-6" />} title="Sin ventas en este rango" description="Ampliá fechas o quitá filtros." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{formatDate(r.fecha)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{r.canal}</Badge></TableCell>
                    <TableCell className="text-xs">{r.almacen}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{r.cliente}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPEN(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 200 && (
              <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                Mostrando 200 de {rows.length} filas — el export incluye todas.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
