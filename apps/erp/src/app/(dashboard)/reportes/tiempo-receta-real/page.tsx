import Link from 'next/link';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Button } from '@happy/ui/button';
import { Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate } from '@happy/lib';
import { reporteTiempoRecetaVsReal } from '@/server/actions/reportes-produccion2';
import { hoy, inicioDeMes, inicioDeSemana } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Tiempo Receta vs Real' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();

  const HOY = hoy();
  const presets = [
    { label: 'Hoy', desde: HOY, hasta: HOY },
    { label: 'Esta semana', desde: inicioDeSemana(), hasta: HOY },
    { label: 'Este mes', desde: inicioDeMes(), hasta: HOY },
  ];
  const activo = (p: { desde: string; hasta: string }) => p.desde === desde && p.hasta === hasta;

  const { metricas, rows } = await reporteTiempoRecetaVsReal({ desde, hasta });
  const up = metricas.diferencia_min >= 0;

  const exportPayload = {
    titulo: 'Tiempo Receta vs Real',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros: [`Período: ${formatDate(desde)} - ${formatDate(hasta)}`],
    cols: [
      { header: 'OT', key: 'ot_numero', width: 14 },
      { header: 'Producto', key: 'producto_nombre', width: 28 },
      { header: 'Cierre', key: 'fecha_cierre', formato: 'fecha' as const, width: 12 },
      { header: 'Unidades', key: 'unidades', formato: 'numero' as const, width: 10 },
      { header: 'Estándar (min)', key: 'estandar_min', formato: 'numero' as const, width: 14 },
      { header: 'Real (min)', key: 'real_min', formato: 'numero' as const, width: 12 },
      { header: 'Est. min/u', key: 'estandar_min_u', formato: 'numero' as const, width: 12 },
      { header: 'Real min/u', key: 'real_min_u', formato: 'numero' as const, width: 12 },
      { header: 'Diferencia (min)', key: 'diferencia_min', formato: 'numero' as const, width: 14 },
      { header: '% Desv.', key: 'desviacion_pct', formato: 'numero' as const, width: 10 },
    ],
    rows,
    totales: { estandar_min: metricas.estandar_min, real_min: metricas.real_min, diferencia_min: metricas.diferencia_min },
  };

  return (
    <PageShell
      title="Tiempo Receta vs Real"
      description={`Tiempo estándar de la receta vs tiempo real declarado en producción (incluye corte), por OT · ${formatDate(desde)} al ${formatDate(hasta)}`}
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Período:</span>
        {presets.map((p) => (
          <Link key={p.label} href={`/reportes/tiempo-receta-real?desde=${p.desde}&hasta=${p.hasta}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${activo(p) ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'}`}>
            {p.label}
          </Link>
        ))}
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
        <Button type="submit" size="sm" variant="premium">Aplicar</Button>
        <Link href="/reportes/tiempo-receta-real" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500"># OTs cerradas</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><Clock className="h-5 w-5 text-slate-400" />{metricas.cantidad_ots}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Tiempo estándar (h)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{(metricas.estandar_min / 60).toFixed(1)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">según receta</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Tiempo real (h)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{(metricas.real_min / 60).toFixed(1)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">declarado en producción</p>
        </Card>
        <Card className={`p-4 ${up ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
          <p className={`text-xs ${up ? 'text-red-700' : 'text-emerald-700'}`}>Diferencia</p>
          <p className={`mt-1 flex items-center gap-2 font-display text-2xl font-semibold ${up ? 'text-red-800' : 'text-emerald-800'}`}>
            {up ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {(Math.abs(metricas.diferencia_min) / 60).toFixed(1)} h
          </p>
          <p className={`mt-0.5 text-[10px] ${up ? 'text-red-700' : 'text-emerald-700'}`}>{up ? 'Más lento que la receta' : 'Más rápido que la receta'} · {metricas.desviacion_pct.toFixed(1)}%</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Clock className="h-6 w-6" />} title="Sin datos" description="No hay OTs cerradas con tiempos en el rango. Ampliá fechas." />
      ) : (
        <Card>
          <div className="border-b bg-slate-50 p-3"><h3 className="text-sm font-semibold text-corp-900">Detalle por OT (ordenado por mayor desviación)</h3></div>
          <div className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OT</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Unid.</TableHead>
                  <TableHead className="text-right">Est. min/u</TableHead>
                  <TableHead className="text-right">Real min/u</TableHead>
                  <TableHead className="text-right">Estándar (min)</TableHead>
                  <TableHead className="text-right">Real (min)</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">% Desv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r) => {
                  const rUp = r.diferencia_min >= 0;
                  return (
                    <TableRow key={r.ot_id}>
                      <TableCell className="font-mono text-xs">{r.ot_numero}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{r.producto_nombre}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.unidades}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{r.estandar_min_u.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-900">{r.real_min > 0 ? r.real_min_u.toFixed(2) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.estandar_min.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.real_min > 0 ? r.real_min.toFixed(2) : '—'}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${r.real_min === 0 ? 'text-slate-300' : rUp ? 'text-red-700' : 'text-emerald-700'}`}>
                        {r.real_min === 0 ? '—' : `${rUp ? '+' : ''}${r.diferencia_min.toFixed(0)}`}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.real_min === 0 ? <span className="text-[10px] text-slate-400">sin tiempos</span> : (
                          <Badge variant={Math.abs(r.desviacion_pct) < 10 ? 'success' : Math.abs(r.desviacion_pct) < 30 ? 'warning' : 'destructive'} className="text-[10px]">
                            {r.desviacion_pct >= 0 ? '+' : ''}{r.desviacion_pct.toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
