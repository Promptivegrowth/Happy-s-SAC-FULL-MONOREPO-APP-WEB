import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Trophy, Users } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatDateTime, formatPEN } from '@happy/lib';
import {
  reporteVentasPorVendedor,
  listarAlmacenesLookup,
  type FiltrosVentasVendedor,
} from '@/server/actions/reportes';
import { ventasPorVendedorDetalle, listarVendedoresLookup } from '@/server/actions/ventas-vendedor-detalle';
import { CANALES_VENTA, hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Ventas por vendedor' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; canal?: string; almacen_id?: string; vendedor_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const canal = (sp.canal as FiltrosVentasVendedor['canal']) || '';
  const almacen_id = sp.almacen_id || '';
  const vendedor_id = sp.vendedor_id || '';

  const [resultado, almacenes, detalle, vendedores] = await Promise.all([
    reporteVentasPorVendedor({ desde, hasta, canal, almacen_id }),
    listarAlmacenesLookup(),
    ventasPorVendedorDetalle({ desde, hasta, canal, almacen_id, vendedor_id }),
    listarVendedoresLookup(),
  ]);

  const { metricas, rows } = resultado;
  const filtros: string[] = [
    `Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`,
    canal ? `Canal: ${canal}` : null,
    almacen_id ? `Almacén: ${almacenes.find((a) => a.id === almacen_id)?.nombre ?? almacen_id}` : null,
    vendedor_id ? `Vendedor: ${vendedores.find((v) => v.id === vendedor_id)?.nombre ?? vendedor_id}` : null,
  ].filter(Boolean) as string[];

  /*
   * Dos cortes más del mismo período, cada uno con su descarga.
   *
   * El ranking contesta la comisión; el corte por día muestra la curva y delata
   * el día flojo; el detalle es el que hace falta cuando alguien discute un
   * número y hay que ir venta por venta.
   */
  const exportPorDia = {
    titulo: 'Ventas por vendedor y día',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Fecha', key: 'fecha', formato: 'fecha' as const, width: 14 },
      { header: 'Vendedor', key: 'vendedor_nombre', width: 28 },
      { header: 'Ventas', key: 'cantidad_ventas', formato: 'numero' as const, width: 10 },
      { header: 'Total vendido', key: 'total_vendido', formato: 'moneda' as const, width: 16 },
      { header: 'Ticket promedio', key: 'ticket_promedio', formato: 'moneda' as const, width: 16 },
    ],
    rows: detalle.por_dia as unknown as Record<string, unknown>[],
    totales: { total_vendido: detalle.total_general },
  };

  const exportDetalle = {
    titulo: 'Detalle de ventas por vendedor',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Fecha', key: 'fecha', formato: 'fecha' as const, width: 18 },
      { header: 'Comprobante', key: 'documento', width: 18 },
      { header: 'Tipo', key: 'tipo_documento', width: 14 },
      { header: 'N° interno', key: 'numero', width: 14 },
      { header: 'Canal', key: 'canal', width: 12 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Vendedor', key: 'vendedor_nombre', width: 26 },
      { header: 'Medios de pago', key: 'pagos', width: 44 },
      { header: 'Total', key: 'total', formato: 'moneda' as const, width: 14 },
    ],
    rows: detalle.detalle as unknown as Record<string, unknown>[],
    totales: { total: detalle.total_general },
  };

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
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Vendedor</label>
          <select name="vendedor_id" defaultValue={vendedor_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
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

      {/* ─────────── Día por día ─────────── */}
      {detalle.por_dia.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-corp-900">Día por día</h3>
              <ExportButtons payload={exportPorDia} />
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Cuánto vendió cada vendedor en cada fecha. Es el corte que hace falta cuando alguien
              discute su comisión, o para ver en qué días rinde cada uno.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Total vendido</TableHead>
                  <TableHead className="text-right">Ticket promedio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalle.por_dia.slice(0, 200).map((d, i) => (
                  <TableRow key={`${d.fecha}-${d.vendedor_id}-${i}`}>
                    <TableCell className="font-mono text-xs">{formatDate(d.fecha)}</TableCell>
                    <TableCell className="text-sm">{d.vendedor_nombre}</TableCell>
                    <TableCell className="text-right text-sm">{d.cantidad_ventas}</TableCell>
                    <TableCell className="text-right text-sm font-semibold text-emerald-700">{formatPEN(d.total_vendido)}</TableCell>
                    <TableCell className="text-right text-sm text-slate-600">{formatPEN(d.ticket_promedio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {detalle.por_dia.length > 200 && (
              <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                Mostrando 200 de {detalle.por_dia.length} — la descarga incluye todas.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────── Venta por venta ─────────── */}
      {detalle.detalle.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-corp-900">
                Detalle de ventas ({detalle.cantidad_ventas})
              </h3>
              <ExportButtons payload={exportDetalle} />
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Cada venta con su comprobante, su cliente y cómo se pagó. Es lo que permite auditar
              un número sin salir del sistema.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Medios de pago</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalle.detalle.slice(0, 200).map((v) => (
                  <TableRow key={v.venta_id}>
                    <TableCell className="text-xs">{formatDateTime(v.fecha)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="font-semibold text-corp-900">{v.documento}</div>
                      <div className="text-[10px] font-normal text-slate-400">{v.numero}</div>
                    </TableCell>
                    <TableCell className="text-xs">{v.cliente}</TableCell>
                    <TableCell className="text-xs">{v.vendedor_nombre}</TableCell>
                    <TableCell className="text-xs text-slate-600">{v.pagos}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatPEN(v.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {detalle.detalle.length > 200 && (
              <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">
                Mostrando 200 de {detalle.detalle.length} — la descarga incluye todas.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
