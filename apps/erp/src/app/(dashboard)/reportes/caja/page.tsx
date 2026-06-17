import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Banknote, TrendingUp, TrendingDown } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import { reporteCaja, listarAlmacenesLookup } from '@/server/actions/reportes';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Flujo de caja' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; almacen_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const almacen_id = sp.almacen_id || '';

  const [resultado, almacenes] = await Promise.all([
    reporteCaja({ desde, hasta, almacen_id }),
    listarAlmacenesLookup(),
  ]);
  const { metricas, por_dia, rows } = resultado;

  const filtros: string[] = [
    `Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`,
    almacen_id ? `Almacén: ${almacenes.find((a) => a.id === almacen_id)?.nombre ?? almacen_id}` : 'Almacén: Todos',
  ];

  const exportDia = {
    titulo: 'Flujo de caja por día',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Fecha', key: 'fecha', formato: 'fecha' as const, width: 12 },
      { header: 'Ingresos', key: 'ingresos', formato: 'moneda' as const, width: 14 },
      { header: 'Egresos', key: 'egresos', formato: 'moneda' as const, width: 14 },
      { header: 'Saldo', key: 'saldo', formato: 'moneda' as const, width: 14 },
    ],
    rows: por_dia as unknown as Record<string, unknown>[],
    totales: { ingresos: metricas.ingresos_total, egresos: metricas.egresos_total, saldo: metricas.saldo },
  };

  const exportDetalle = {
    titulo: 'Flujo de caja - detalle',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Fecha', key: 'fecha', formato: 'fecha' as const, width: 12 },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Origen', key: 'origen', width: 18 },
      { header: 'Referencia', key: 'referencia', width: 28 },
      { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 14 },
    ],
    rows: rows as unknown as Record<string, unknown>[],
  };

  // Mini "gráfico" de barras con divs (sin recharts para no client-side)
  const maxDia = Math.max(1, ...por_dia.map((d) => Math.max(d.ingresos, d.egresos)));

  return (
    <PageShell
      title="Flujo de caja"
      description={`Ingresos vs egresos · ${formatDate(desde)} al ${formatDate(hasta)}`}
      actions={<ExportButtons payload={exportDia} />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="inline-flex items-center gap-1 text-xs text-slate-500"><TrendingUp className="h-3 w-3 text-emerald-600" /> Ingresos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(metricas.ingresos_total)}</p>
        </Card>
        <Card className="p-4">
          <p className="inline-flex items-center gap-1 text-xs text-slate-500"><TrendingDown className="h-3 w-3 text-red-600" /> Egresos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-red-600">{formatPEN(metricas.egresos_total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Saldo</p>
          <p className={`mt-1 font-display text-2xl font-semibold ${metricas.saldo >= 0 ? 'text-corp-900' : 'text-red-600'}`}>
            {formatPEN(metricas.saldo)}
          </p>
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
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Almacén</label>
          <select name="almacen_id" defaultValue={almacen_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Aplicar</button>
        <Link href="/reportes/caja" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      {Object.keys(metricas.por_canal).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-corp-900">Ingresos por canal</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metricas.por_canal).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <Badge key={k} variant="secondary" className="text-xs">{k}: <b className="ml-1 text-emerald-700">{formatPEN(v)}</b></Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {por_dia.length === 0 ? (
        <EmptyState icon={<Banknote className="h-6 w-6" />} title="Sin movimientos" description="No hay ingresos ni egresos en el período." />
      ) : (
        <>
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 font-display text-sm font-semibold text-corp-900">Movimientos por día</h3>
              <div className="space-y-1">
                {por_dia.map((d) => (
                  <div key={d.fecha} className="flex items-center gap-3 text-xs">
                    <span className="w-24 font-mono text-slate-500">{formatDate(d.fecha)}</span>
                    <div className="flex flex-1 items-center gap-1">
                      <div className="h-3 rounded-sm bg-emerald-500" style={{ width: `${(d.ingresos / maxDia) * 50}%` }} title={`Ingresos: ${formatPEN(d.ingresos)}`} />
                      <div className="h-3 rounded-sm bg-red-400" style={{ width: `${(d.egresos / maxDia) * 50}%` }} title={`Egresos: ${formatPEN(d.egresos)}`} />
                    </div>
                    <span className={`w-28 text-right font-semibold ${d.saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatPEN(d.saldo)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-corp-900">Detalle de movimientos</h3>
                <ExportButtons payload={exportDetalle} />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{formatDate(r.fecha)}</TableCell>
                      <TableCell>
                        <Badge variant={r.tipo === 'INGRESO' ? 'success' : 'destructive'} className="text-[10px]">{r.tipo}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.origen}</TableCell>
                      <TableCell className="text-xs">{r.referencia}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {formatPEN(r.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 200 && (
                <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                  Mostrando 200 de {rows.length} — el export incluye todas.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}
