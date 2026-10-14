import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Sparkles } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN, formatTallaChip } from '@happy/lib';
import { reporteProductosTemporada, listarCategoriasLookup } from '@/server/actions/reportes';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Productos por temporada' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; categoria_id?: string; punto?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const categoria_id = sp.categoria_id || '';
  const punto = sp.punto || '';

  const [resultado, categorias] = await Promise.all([
    reporteProductosTemporada({ desde, hasta, categoria_id, punto }),
    listarCategoriasLookup(),
  ]);
  const { metricas, rows, puntos } = resultado;

  const catNombre = categorias.find((c) => c.id === categoria_id)?.nombre ?? 'Todas';
  // Por local y web (pedido de Javier, 14/10/2026): filtro, y con "Todos" una columna por local.
  const puntoNombre = punto ? (puntos.find((x) => x.key === punto)?.nombre ?? 'Local') : 'Todos los locales y web';
  const columnasPunto = !punto && puntos.length > 1 ? puntos : [];

  const exportPayload = {
    titulo: 'Productos por temporada',
    subtitulo: `Categoría: ${catNombre} · ${puntoNombre} · ${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros: [`Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`, `Categoría: ${catNombre}`, `Local: ${puntoNombre}`],
    cols: [
      { header: '#', key: 'ranking', formato: 'numero' as const, width: 6 },
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Producto', key: 'nombre', width: 32 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Unidades', key: 'unidades', formato: 'numero' as const, width: 12 },
      ...columnasPunto.map((x) => ({ header: `Und. ${x.nombre}`, key: `punto_${x.key}`, formato: 'numero' as const, width: 14 })),
      { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 14 },
      { header: '% del total', key: 'pct_del_total', formato: 'porcentaje' as const, width: 12 },
      { header: 'Tallas (unidades)', key: 'tallas_txt', width: 46 },
    ],
    rows: rows.map((r) => ({
      ...r,
      ...Object.fromEntries(columnasPunto.map((x) => [`punto_${x.key}`, r.por_punto[x.key] ?? 0])),
      tallas_txt: r.tallas.map((t) => `${formatTallaChip(t.talla)}: ${t.unidades}`).join(' · '),
    })) as unknown as Record<string, unknown>[],
    totales: {
      unidades: metricas.total_unidades,
      monto: metricas.total_ingresos,
      ...Object.fromEntries(columnasPunto.map((x) => [`punto_${x.key}`, rows.reduce((s, r) => s + (r.por_punto[x.key] ?? 0), 0)])),
    },
  };

  // Una fila por modelo y talla, para analizar en Excel.
  const exportTallas = {
    titulo: 'Productos por temporada · detalle por talla',
    subtitulo: exportPayload.subtitulo,
    filtros: exportPayload.filtros,
    cols: [
      { header: '#', key: 'ranking', formato: 'numero' as const, width: 6 },
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Producto', key: 'nombre', width: 34 },
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Talla', key: 'talla', width: 9 },
      { header: 'Unidades', key: 'unidades', formato: 'numero' as const, width: 11 },
      { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 14 },
    ],
    rows: rows.flatMap((r) => r.tallas.map((t) => ({
      ranking: r.ranking, codigo: r.codigo, nombre: r.nombre, categoria: r.categoria,
      talla: formatTallaChip(t.talla), unidades: t.unidades, monto: t.monto,
    }))) as unknown as Record<string, unknown>[],
    totales: { unidades: metricas.total_unidades, monto: metricas.total_ingresos },
  };

  return (
    <PageShell
      title="Productos más vendidos por temporada"
      description={`Categoría: ${catNombre} · ${puntoNombre}`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1"><span className="text-[11px] text-slate-500">Resumen</span><ExportButtons payload={exportPayload} /></div>
          <div className="flex items-center gap-1"><span className="text-[11px] text-slate-500">Por talla</span><ExportButtons payload={exportTallas} /></div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Unidades totales</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.total_unidades.toLocaleString('es-PE')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Ingresos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(metricas.total_ingresos)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Productos distintos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.productos_distintos}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Top 1 vs resto</p>
          <p className="mt-1 font-display text-2xl font-semibold text-happy-600">{metricas.top1_pct_vs_resto.toFixed(1)}%</p>
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
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Categoría</label>
          <select name="categoria_id" defaultValue={categoria_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Local</label>
          <select name="punto" defaultValue={punto} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos (locales y web)</option>
            {puntos.map((x) => <option key={x.key} value={x.key}>{x.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Aplicar</button>
        <Link href="/reportes/productos-temporada" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-6 w-6" />} title="Sin ventas en este rango" description="Prueba otra categoría, local o rango de fechas." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  {columnasPunto.map((x) => <TableHead key={x.key} className="text-right text-xs">{x.nombre.replace(/^Tienda\s+/i, '')}</TableHead>)}
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r) => (
                  <TableRow key={r.producto_id}>
                    <TableCell className="font-mono text-xs">{r.ranking}</TableCell>
                    <TableCell>
                      <div className="font-medium text-corp-900">{r.nombre}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.codigo}</div>
                      {/* Tallas y cantidades vendidas del modelo (pedido de Javier, 14/10/2026). */}
                      <details className="mt-1">
                        <summary className="cursor-pointer select-none text-[11px] font-medium text-happy-700 hover:underline">
                          Ver tallas ({r.tallas.length})
                        </summary>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {r.tallas.map((t) => (
                            <span key={t.talla} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]">
                              <b className="text-corp-900">{formatTallaChip(t.talla)}</b>
                              <span className="ml-1 font-mono text-slate-700">{t.unidades} und</span>
                              <span className="ml-1 text-slate-400">· {formatPEN(t.monto)}</span>
                            </span>
                          ))}
                        </div>
                      </details>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{r.categoria}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{r.unidades.toLocaleString('es-PE')}</TableCell>
                    {columnasPunto.map((x) => (
                      <TableCell key={x.key} className="text-right font-mono text-xs text-slate-600">{(r.por_punto[x.key] ?? 0) > 0 ? (r.por_punto[x.key] ?? 0).toLocaleString('es-PE') : '—'}</TableCell>
                    ))}
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPEN(r.monto)}</TableCell>
                    <TableCell className="text-right text-xs">{r.pct_del_total.toFixed(2)}%</TableCell>
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
