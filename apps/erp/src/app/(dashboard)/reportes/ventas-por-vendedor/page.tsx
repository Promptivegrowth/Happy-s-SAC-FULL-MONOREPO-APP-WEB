import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Trophy, Users } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import {
  reporteVentasPorVendedor,
  listarAlmacenesLookup,
  type FiltrosVentasVendedor,
} from '@/server/actions/reportes';
import { CANALES_VENTA, hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Ventas por vendedor' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; canal?: string; almacen_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const canal = (sp.canal as FiltrosVentasVendedor['canal']) || '';
  const almacen_id = sp.almacen_id || '';

  const [resultado, almacenes] = await Promise.all([
    reporteVentasPorVendedor({ desde, hasta, canal, almacen_id }),
    listarAlmacenesLookup(),
  ]);

  const { metricas, rows } = resultado;
  const filtros: string[] = [
    `Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`,
    canal ? `Canal: ${canal}` : null,
    almacen_id ? `Almacén: ${almacenes.find((a) => a.id === almacen_id)?.nombre ?? almacen_id}` : null,
  ].filter(Boolean) as string[];

  const exportPayload = {
    titulo: 'Ventas por Vendedor',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Ranking', key: 'ranking', width: 10 },
      { header: 'Vendedor', key: 'vendedor_nombre', width: 28 },
      { header: 'Cantidad ventas', key: 'cantidad_ventas', width: 14 },
      { header: 'Total vendido', key: 'total_vendido', formato: 'moneda' as const, width: 16 },
      { header: 'Ticket promedio', key: 'ticket_promedio', formato: 'moneda' as const, width: 16 },
      { header: '% del total', key: 'pct_formatted', width: 12 },
    ],
    rows: rows.map((r, i) => ({
      ...r,
      ranking: i + 1,
      pct_formatted: r.pct_del_total.toFixed(1) + '%',
    })),
    totales: { total_vendido: metricas.total_general },
  };

  return (
    <PageShell
      title="Ventas por vendedor"
      description={`Del ${formatDate(desde)} al ${formatDate(hasta)} · Útil para cálculo de comisiones`}
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total vendido</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(metricas.total_general)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Vendedores activos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">
            <Users className="mr-1 inline h-5 w-5" />
            {metricas.cantidad_vendedores}
          </p>
        </Card>
        <Card className="p-4 border-amber-200 bg-amber-50/30">
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <Trophy className="h-3.5 w-3.5" /> Top vendedor
          </p>
          <p className="mt-1 font-display text-base font-semibold text-corp-900 truncate">
            {metricas.top_vendedor_nombre ?? '—'}
          </p>
          <p className="text-xs font-medium text-amber-700">{formatPEN(metricas.top_vendedor_monto)}</p>
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
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">
          Aplicar
        </button>
        <Link href="/reportes/ventas-por-vendedor" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">
          Limpiar
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Sin ventas con vendedor asignado"
          description="Las ventas POS recientes ya guardan el vendedor. Para ventas antiguas que no lo tienen, no aparecen en este reporte."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Total vendido</TableHead>
                  <TableHead className="text-right">Ticket promedio</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.vendedor_id}>
                    <TableCell>
                      {i === 0 ? (
                        <Badge className="bg-amber-100 text-amber-800 gap-1"><Trophy className="h-3 w-3" />1°</Badge>
                      ) : (
                        <span className="text-slate-500">{i + 1}°</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{r.vendedor_nombre}</TableCell>
                    <TableCell className="text-right">{r.cantidad_ventas}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPEN(r.total_vendido)}</TableCell>
                    <TableCell className="text-right text-slate-600">{formatPEN(r.ticket_promedio)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full bg-happy-500"
                            style={{ width: `${Math.min(100, r.pct_del_total)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-slate-700">{r.pct_del_total.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
