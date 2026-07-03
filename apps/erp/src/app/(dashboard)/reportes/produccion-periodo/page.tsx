import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Button } from '@happy/ui/button';
import { Factory, Package, Clock, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import { reporteProduccionPeriodo } from '@/server/actions/reportes-produccion';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Producción por período' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();

  const resultado = await reporteProduccionPeriodo({ desde, hasta });
  const { metricas, por_mes, por_ot } = resultado;

  const exportPayload = {
    titulo: 'Producción por período',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros: [`Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`],
    cols: [
      { header: 'OT N°', key: 'ot_numero', width: 14 },
      { header: 'Producto', key: 'producto_nombre', width: 26 },
      { header: 'Apertura', key: 'fecha_apertura', formato: 'fecha' as const, width: 12 },
      { header: 'Cierre', key: 'fecha_cierre', formato: 'fecha' as const, width: 12 },
      { header: 'Planif.', key: 'unidades_planificadas', formato: 'numero' as const, width: 10 },
      { header: 'Terminadas', key: 'unidades_terminadas', formato: 'numero' as const, width: 11 },
      { header: 'Falladas', key: 'unidades_falladas', formato: 'numero' as const, width: 10 },
      { header: 'Costo mat.', key: 'costo_materiales', formato: 'moneda' as const, width: 14 },
      { header: 'Costo serv.', key: 'costo_servicios', formato: 'moneda' as const, width: 14 },
      { header: 'Costo total', key: 'costo_total', formato: 'moneda' as const, width: 14 },
      { header: 'Costo unit.', key: 'costo_unitario', formato: 'moneda' as const, width: 14 },
      { header: 'Tiempo (min)', key: 'tiempo_min_total', formato: 'numero' as const, width: 12 },
    ],
    rows: por_ot,
    totales: { costo_total: metricas.costo_total },
  };

  return (
    <PageShell
      title="Producción por período"
      description={`Del ${formatDate(desde)} al ${formatDate(hasta)} · ${metricas.cantidad_ots} OTs cerradas`}
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
        <Link href="/reportes/produccion-periodo" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500"># OTs cerradas</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900">
            <Factory className="h-5 w-5 text-slate-400" />
            {metricas.cantidad_ots}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Unidades terminadas</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-emerald-700">
            <Package className="h-5 w-5 text-emerald-500" />
            {metricas.unidades_terminadas.toLocaleString('es-PE')}
          </p>
          {metricas.unidades_falladas > 0 && (
            <p className="mt-0.5 text-[10px] text-amber-700">
              <AlertTriangle className="mr-0.5 inline h-3 w-3" />
              {metricas.unidades_falladas} falladas ({metricas.tasa_fallas_pct.toFixed(1)}%)
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Costo total real</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(metricas.costo_total)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">materiales + servicios</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Tiempo total invertido</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900">
            <Clock className="h-5 w-5 text-slate-400" />
            {metricas.tiempo_horas_total.toFixed(1)} h
          </p>
        </Card>
      </div>

      {/* Agrupado por mes */}
      {por_mes.length > 0 && (
        <Card>
          <div className="border-b bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-corp-900">Resumen mensual</h3>
            <p className="text-xs text-slate-500">Un mes por fila — usá para cierre de período</p>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right"># OTs</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Falladas</TableHead>
                  <TableHead className="text-right">Materiales</TableHead>
                  <TableHead className="text-right">Servicios</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_mes.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell className="font-medium">{m.mes_label}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{m.cantidad_ots}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{m.unidades_terminadas.toLocaleString('es-PE')}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-700">{m.unidades_falladas || '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-600">{formatPEN(m.costo_materiales)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-600">{formatPEN(m.costo_servicios)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">{formatPEN(m.costo_total)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">{(m.tiempo_min_total / 60).toFixed(1)}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detalle por OT */}
      {por_ot.length === 0 ? (
        <EmptyState icon={<Factory className="h-6 w-6" />} title="Sin OTs cerradas en el rango" description="Ampliá fechas o esperá al cierre de OTs activas." />
      ) : (
        <Card>
          <div className="border-b bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-corp-900">Detalle por OT ({por_ot.length})</h3>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OT</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cierre</TableHead>
                  <TableHead className="text-right">Planif.</TableHead>
                  <TableHead className="text-right">Term.</TableHead>
                  <TableHead className="text-right">Fallas</TableHead>
                  <TableHead className="text-right">Materiales</TableHead>
                  <TableHead className="text-right">Servicios</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">C. unit.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_ot.slice(0, 200).map((r) => (
                  <TableRow key={r.ot_id}>
                    <TableCell className="font-mono text-xs">{r.ot_numero}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm" title={r.producto_nombre}>{r.producto_nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{formatDate(r.fecha_cierre)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.unidades_planificadas}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">{r.unidades_terminadas}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.unidades_falladas > 0 ? <Badge variant="warning" className="text-[10px]">{r.unidades_falladas}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatPEN(r.costo_materiales)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatPEN(r.costo_servicios)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatPEN(r.costo_total)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">{formatPEN(r.costo_unitario)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {por_ot.length > 200 && (
              <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                Mostrando 200 de {por_ot.length} — el export incluye todas.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
