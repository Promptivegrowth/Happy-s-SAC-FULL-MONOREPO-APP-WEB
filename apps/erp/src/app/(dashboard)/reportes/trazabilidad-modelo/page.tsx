import Link from 'next/link';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Route, Factory, ShoppingCart, Warehouse, Search, ChevronRight } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatTallaChip } from '@happy/lib';
import { reporteTrazabilidadProduccionVenta, type ReporteTrazabilidadResult } from '@/server/actions/reportes-produccion2';

export const metadata = { title: 'Trazabilidad de productos' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; desde?: string; hasta?: string; almacen?: string };

const dma = (iso: string) => iso.split('-').reverse().join('/');
const n = (x: number) => x.toLocaleString('es-PE', { maximumFractionDigits: 2 });

/**
 * Trazabilidad de producto terminado (pedido de Javier, 13/10/2026): por
 * modelo y talla, lo producido, trasladado, vendido y devuelto en el período,
 * y el stock de hoy en cada almacén. Cada fila abre el detalle con las ventas
 * (vendedor, comprobante, pago, cliente) y todos los movimientos.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filtros = { q: sp.q?.trim() || undefined, desde: sp.desde || undefined, hasta: sp.hasta || undefined, almacenId: sp.almacen || undefined };

  // Si la consulta falla se dice, en vez de mostrar "Sin datos" como si no hubiera producción.
  let errorCarga: string | null = null;
  let rep: ReporteTrazabilidadResult = { almacenes: [], metricas: { modelos: 0, variantes: 0, producido: 0, vendido: 0, stock: 0 }, rows: [], recortado: false };
  try {
    rep = await reporteTrazabilidadProduccionVenta(filtros);
  } catch (e) {
    errorCarga = (e as Error).message;
  }
  const { almacenes, metricas, rows } = rep;
  const almElegido = almacenes.find((a) => a.id === filtros.almacenId);
  const corto = (nombre: string) => nombre.replace(/^Almacén /, '').replace(/^Tienda /, '');
  const qs = new URLSearchParams(Object.entries({ desde: sp.desde, hasta: sp.hasta, almacen: sp.almacen }).filter(([, v]) => v) as [string, string][]).toString();

  const textoFiltros = [
    filtros.q ? `Búsqueda: "${filtros.q}"` : 'Lo producido (cierres de OT)',
    filtros.desde || filtros.hasta ? `Del ${filtros.desde ? dma(filtros.desde) : 'inicio'} al ${filtros.hasta ? dma(filtros.hasta) : 'hoy'}` : 'Todas las fechas',
    almElegido ? almElegido.nombre : 'Todos los almacenes',
  ];

  const exportPayload = {
    titulo: 'Trazabilidad de productos',
    subtitulo: 'Por modelo y talla: movimientos del período y stock de hoy por almacén',
    filtros: textoFiltros,
    cols: [
      { header: 'Modelo', key: 'producto_nombre', width: 30 },
      { header: 'Talla', key: 'talla', width: 8 },
      { header: 'SKU', key: 'sku', width: 11 },
      { header: 'OT', key: 'ots', width: 14 },
      { header: 'Producido', key: 'producido', formato: 'numero' as const, width: 11 },
      { header: 'Traslados recibidos', key: 'traslado_entra', formato: 'numero' as const, width: 12 },
      { header: 'Traslados enviados', key: 'traslado_sale', formato: 'numero' as const, width: 12 },
      { header: 'Vendido', key: 'vendido', formato: 'numero' as const, width: 10 },
      { header: 'Devuelto', key: 'devuelto', formato: 'numero' as const, width: 10 },
      { header: 'Ajustes', key: 'ajustes', formato: 'numero' as const, width: 10 },
      ...(almElegido ? [] : almacenes.map((a) => ({ header: `Stock ${corto(a.nombre)}`, key: `st_${a.id}`, formato: 'numero' as const, width: 12 }))),
      { header: almElegido ? `Stock ${corto(almElegido.nombre)}` : 'Stock total', key: 'stock_total', formato: 'numero' as const, width: 12 },
    ],
    rows: rows.map((r) => ({
      ...r, talla: formatTallaChip(r.talla),
      ...Object.fromEntries(almacenes.map((a) => [`st_${a.id}`, r.stock[a.id] ?? 0])),
    })),
    totales: { producido: metricas.producido, vendido: metricas.vendido, stock_total: metricas.stock },
  };

  return (
    <PageShell
      title="Trazabilidad de productos"
      description="Lo producido, trasladado y vendido por modelo y talla, y dónde está hoy cada prenda. Toca el número de vendidos para ver cada venta (quién vendió, comprobante, monto y cliente), o «Detalle» para ver también los movimientos."
      actions={<ExportButtons payload={exportPayload} />}
    >
      {/* Buscador y filtros */}
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border bg-white p-3">
        <label className="flex min-w-[220px] flex-1 flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Producto
          <div className="relative mt-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input name="q" defaultValue={sp.q ?? ''} placeholder="Nombre del modelo, código, SKU o código de barras"
              className="h-9 w-full rounded-md border pl-8 pr-2 text-sm normal-case tracking-normal" />
          </div>
        </label>
        <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Desde
          <input type="date" name="desde" defaultValue={sp.desde ?? ''} className="mt-1 h-9 rounded-md border px-2 text-sm" />
        </label>
        <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Hasta
          <input type="date" name="hasta" defaultValue={sp.hasta ?? ''} className="mt-1 h-9 rounded-md border px-2 text-sm" />
        </label>
        <label className="flex flex-col text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Almacén
          <select name="almacen" defaultValue={sp.almacen ?? ''} className="mt-1 h-9 rounded-md border bg-white px-2 text-sm normal-case">
            <option value="">Todos</option>
            {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Buscar</button>
        <Link href="/reportes/trazabilidad-modelo" className="flex h-9 items-center rounded-md border px-3 text-sm text-slate-600 hover:bg-slate-50">Limpiar</Link>
      </form>
      <p className="-mt-2 text-xs text-slate-500">
        {filtros.q
          ? 'Muestra los modelos que coinciden con la búsqueda, se hayan producido en el sistema o no.'
          : 'Sin búsqueda se muestra lo que entró por cierre de OT. Escribe un producto para seguir cualquier otro.'}
        {' '}Movimientos: {textoFiltros.slice(1).join(' · ').toLowerCase()}. El stock es el de hoy.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Modelos · tallas</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><Route className="h-5 w-5 text-slate-400" />{metricas.modelos} · {metricas.variantes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Producido en el período</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-emerald-700"><Factory className="h-5 w-5 text-emerald-500" />{n(metricas.producido)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Vendido en el período</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><ShoppingCart className="h-5 w-5 text-slate-400" />{n(metricas.vendido)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Stock hoy{almElegido ? ` · ${corto(almElegido.nombre)}` : ''}</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><Warehouse className="h-5 w-5 text-slate-400" />{n(metricas.stock)}</p>
        </Card>
      </div>

      {errorCarga ? (
        <EmptyState icon={<Route className="h-6 w-6" />} title="No se pudo cargar el reporte" description={`${errorCarga}. Recarga la página; si sigue, avisa a soporte.`} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Route className="h-6 w-6" />}
          title={filtros.q ? 'No se encontró ese producto' : 'Sin producción en el período'}
          description={filtros.q ? 'Prueba con otra parte del nombre, el código o el SKU.' : 'No hay ingresos por cierre de OT con estos filtros. Busca un producto para seguir cualquier otro.'} />
      ) : (
        <Card>
          <div className="border-b bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-corp-900">Detalle por modelo y talla</h3>
            {rep.recortado && <p className="text-[11px] text-amber-700">La búsqueda encontró demasiados productos: se muestran los primeros 400. Escribe un nombre más específico.</p>}
          </div>
          <div className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead className="text-right">Producido</TableHead>
                  <TableHead className="text-right" title="Recibido / enviado por traslados">Traslados</TableHead>
                  <TableHead className="text-right" title="Vendido menos lo que volvió por ventas anuladas">Vendido</TableHead>
                  <TableHead className="text-right">Devuelto</TableHead>
                  <TableHead className="text-right" title="Ajustes de conteo (entradas menos salidas)">Ajustes</TableHead>
                  {!almElegido && almacenes.map((a) => <TableHead key={a.id} className="text-right">Stock {corto(a.nombre)}</TableHead>)}
                  <TableHead className="text-right">{almElegido ? `Stock ${corto(almElegido.nombre)}` : 'Stock total'}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const href = `/reportes/trazabilidad-modelo/${r.variante_id}${qs ? `?${qs}` : ''}`;
                  return (
                    <TableRow key={r.variante_id} className="cursor-pointer hover:bg-happy-50/40">
                      <TableCell className="text-sm font-medium">
                        <Link href={href} className="hover:underline">{r.producto_nombre}</Link>
                        <div className="font-mono text-[10px] text-slate-400">{r.sku}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{formatTallaChip(r.talla)}</Badge></TableCell>
                      <TableCell className="font-mono text-[11px]">{r.ots || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-700">{r.producido ? n(r.producido) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{r.traslado_entra || r.traslado_sale ? `+${n(r.traslado_entra)} / −${n(r.traslado_sale)}` : '—'}</TableCell>
                      {/* El número de vendidos abre directo las ventas de esa talla (pedido de Javier, 14/10/2026). */}
                      <TableCell className="text-right font-mono text-sm">
                        {r.vendido ? (
                          <Link href={`${href}#ventas`} title="Ver quién vendió, comprobante, monto y cliente" className="font-semibold text-happy-700 underline decoration-dotted underline-offset-2 hover:text-happy-900">
                            {n(r.vendido)}
                          </Link>
                        ) : n(r.vendido)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-amber-600">{r.devuelto ? n(r.devuelto) : '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-600">{r.ajustes ? `${r.ajustes > 0 ? '+' : ''}${n(r.ajustes)}` : '—'}</TableCell>
                      {!almElegido && almacenes.map((a) => <TableCell key={a.id} className="text-right font-mono text-sm">{n(r.stock[a.id] ?? 0)}</TableCell>)}
                      <TableCell className="text-right font-mono text-sm font-semibold">{n(r.stock_total)}</TableCell>
                      <TableCell><Link href={href} title="Ver ventas y movimientos" className="flex items-center gap-0.5 whitespace-nowrap text-[11px] text-slate-500 hover:text-happy-700">Detalle <ChevronRight className="h-4 w-4" /></Link></TableCell>
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
