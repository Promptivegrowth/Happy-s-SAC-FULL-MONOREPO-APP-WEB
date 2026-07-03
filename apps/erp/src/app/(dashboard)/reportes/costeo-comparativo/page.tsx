import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Button } from '@happy/ui/button';
import { Scale, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import { reporteCosteoComparativo } from '@/server/actions/reportes-produccion';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Cotización vs Costo Real' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();

  const resultado = await reporteCosteoComparativo({ desde, hasta });
  const { metricas, rows } = resultado;

  const exportPayload = {
    titulo: 'Costeo comparativo — Cotizado vs Real',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros: [`Período: ${formatDate(desde)} - ${formatDate(hasta)}`],
    cols: [
      { header: 'OT', key: 'ot_numero', width: 14 },
      { header: 'Producto', key: 'producto_nombre', width: 28 },
      { header: 'Cierre', key: 'fecha_cierre', formato: 'fecha' as const, width: 12 },
      { header: 'Unidades', key: 'unidades_terminadas', formato: 'numero' as const, width: 10 },
      { header: 'Cot. mat.', key: 'cotizado_materiales', formato: 'moneda' as const, width: 14 },
      { header: 'Cot. serv.', key: 'cotizado_servicios', formato: 'moneda' as const, width: 14 },
      { header: 'Cot. total', key: 'cotizado_total', formato: 'moneda' as const, width: 14 },
      { header: 'Cot. unit.', key: 'cotizado_unitario', formato: 'moneda' as const, width: 14 },
      { header: 'Real mat.', key: 'real_materiales', formato: 'moneda' as const, width: 14 },
      { header: 'Real serv.', key: 'real_servicios', formato: 'moneda' as const, width: 14 },
      { header: 'Real total', key: 'real_total', formato: 'moneda' as const, width: 14 },
      { header: 'Real unit.', key: 'real_unitario', formato: 'moneda' as const, width: 14 },
      { header: 'Diferencia', key: 'diferencia', formato: 'moneda' as const, width: 14 },
      { header: '% Desv.', key: 'desviacion_pct', formato: 'numero' as const, width: 10 },
    ],
    rows,
    totales: { cotizado_total: metricas.cotizado_total, real_total: metricas.real_total, diferencia: metricas.diferencia_total },
  };

  const desviacionUp = metricas.diferencia_total >= 0;

  return (
    <PageShell
      title="Cotización vs Costo Real"
      description={`Comparativo por OT · ${formatDate(desde)} al ${formatDate(hasta)}`}
      actions={<ExportButtons payload={exportPayload} />}
    >
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
        <Link href="/reportes/costeo-comparativo" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500"># OTs analizadas</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900">
            <Scale className="h-5 w-5 text-slate-400" />
            {metricas.cantidad_ots}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total cotizado (teórico)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(metricas.cotizado_total)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">receta + tarifas</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total real</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(metricas.real_total)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">kardex + OS talleres</p>
        </Card>
        <Card className={`p-4 ${desviacionUp ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
          <p className={`text-xs ${desviacionUp ? 'text-red-700' : 'text-emerald-700'}`}>Diferencia</p>
          <p className={`mt-1 flex items-center gap-2 font-display text-2xl font-semibold ${desviacionUp ? 'text-red-800' : 'text-emerald-800'}`}>
            {desviacionUp ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            {formatPEN(Math.abs(metricas.diferencia_total))}
          </p>
          <p className={`mt-0.5 text-[10px] ${desviacionUp ? 'text-red-700' : 'text-emerald-700'}`}>
            {desviacionUp ? 'Sobre presupuesto' : 'Ahorro vs presupuesto'} · promedio {metricas.desviacion_promedio_pct.toFixed(1)}%
          </p>
        </Card>
      </div>

      {metricas.ots_sobre_presupuesto > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-3">
          <div className="flex gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-semibold">{metricas.ots_sobre_presupuesto} OTs</span> se pasaron del presupuesto teórico
              {metricas.ots_bajo_presupuesto > 0 && (
                <> · <span className="font-semibold">{metricas.ots_bajo_presupuesto}</span> quedaron debajo</>
              )}
              . Revisá las de mayor desviación abajo.
            </div>
          </div>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<Scale className="h-6 w-6" />} title="Sin datos" description="No hay OTs cerradas en el rango. Ampliá fechas." />
      ) : (
        <Card>
          <div className="border-b bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-corp-900">Detalle por OT (ordenado por mayor desviación)</h3>
          </div>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OT</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Unid.</TableHead>
                  <TableHead className="text-right">Cot. unit.</TableHead>
                  <TableHead className="text-right">Real unit.</TableHead>
                  <TableHead className="text-right">Cot. total</TableHead>
                  <TableHead className="text-right">Real total</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">% Desv.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r) => {
                  const up = r.diferencia >= 0;
                  return (
                    <TableRow key={`${r.ot_id}::${r.producto_id}`}>
                      <TableCell className="font-mono text-xs">{r.ot_numero}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{r.producto_nombre}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{r.unidades_terminadas}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{formatPEN(r.cotizado_unitario)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-900">{formatPEN(r.real_unitario)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPEN(r.cotizado_total)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPEN(r.real_total)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-semibold ${up ? 'text-red-700' : 'text-emerald-700'}`}>
                        {up ? '+' : ''}{formatPEN(r.diferencia)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={Math.abs(r.desviacion_pct) < 5 ? 'success' : Math.abs(r.desviacion_pct) < 15 ? 'warning' : 'destructive'}
                          className="text-[10px]"
                        >
                          {r.desviacion_pct >= 0 ? '+' : ''}{r.desviacion_pct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {rows.length > 200 && (
              <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                Mostrando 200 de {rows.length} — export completo en Excel/PDF.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
