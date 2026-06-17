import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PiggyBank } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import { reporteRentabilidad, listarCategoriasLookup } from '@/server/actions/reportes';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Rentabilidad por modelo' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; categoria_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const categoria_id = sp.categoria_id || '';

  const [resultado, categorias] = await Promise.all([
    reporteRentabilidad({ desde, hasta, categoria_id }),
    listarCategoriasLookup(),
  ]);
  const { metricas, rows } = resultado;
  const catNombre = categorias.find((c) => c.id === categoria_id)?.nombre ?? 'Todas';

  const exportPayload = {
    titulo: 'Rentabilidad por modelo',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)} · Categoría: ${catNombre}`,
    filtros: [`Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`, `Categoría: ${catNombre}`],
    cols: [
      { header: 'Código', key: 'codigo', width: 14 },
      { header: 'Producto', key: 'nombre', width: 30 },
      { header: 'Categoría', key: 'categoria', width: 16 },
      { header: 'Uds.', key: 'unidades', formato: 'numero' as const, width: 8 },
      { header: 'Precio prom.', key: 'precio_promedio', formato: 'moneda' as const, width: 14 },
      { header: 'Costo mat.', key: 'costo_materiales', formato: 'moneda' as const, width: 14 },
      { header: 'Costo MO', key: 'costo_mano_obra', formato: 'moneda' as const, width: 14 },
      { header: 'Margen $', key: 'margen_unitario', formato: 'moneda' as const, width: 14 },
      { header: 'Margen %', key: 'margen_pct', formato: 'porcentaje' as const, width: 12 },
      { header: 'Ingreso', key: 'ingreso', formato: 'moneda' as const, width: 14 },
      { header: 'Costo total', key: 'costo_total', formato: 'moneda' as const, width: 14 },
    ],
    rows: rows as unknown as Record<string, unknown>[],
    totales: {
      ingreso: metricas.ingreso_total,
      costo_total: metricas.costo_total,
      margen_unitario: metricas.margen_total,
    },
  };

  const topRentables = [...rows].sort((a, b) => b.margen_pct - a.margen_pct).slice(0, 3);
  const peorRentables = [...rows].filter((r) => r.margen_pct < 30).slice(0, 3);

  return (
    <PageShell
      title="Rentabilidad por modelo"
      description="Precio promedio − (materiales + MO) por producto vendido"
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Ingresos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(metricas.ingreso_total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Costo total</p>
          <p className="mt-1 font-display text-2xl font-semibold text-red-600">{formatPEN(metricas.costo_total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Margen total</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(metricas.margen_total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Margen promedio</p>
          <p className="mt-1 font-display text-2xl font-semibold text-happy-600">{metricas.margen_promedio_pct.toFixed(1)}%</p>
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
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Aplicar</button>
        <Link href="/reportes/rentabilidad" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      {topRentables.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-2 font-display text-sm font-semibold text-emerald-700">Top más rentables</h3>
              <ul className="space-y-1 text-sm">
                {topRentables.map((r) => (
                  <li key={r.producto_id} className="flex justify-between gap-2">
                    <span className="truncate text-corp-900">{r.codigo} · {r.nombre}</span>
                    <span className="font-semibold text-emerald-700">{r.margen_pct.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {peorRentables.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h3 className="mb-2 font-display text-sm font-semibold text-red-700">Menos rentables (margen &lt; 30%)</h3>
                <ul className="space-y-1 text-sm">
                  {peorRentables.map((r) => (
                    <li key={r.producto_id} className="flex justify-between gap-2">
                      <span className="truncate text-corp-900">{r.codigo} · {r.nombre}</span>
                      <span className="font-semibold text-red-700">{r.margen_pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<PiggyBank className="h-6 w-6" />} title="Sin datos" description="No hay ventas con costos calculables en el rango." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Uds.</TableHead>
                  <TableHead className="text-right">Precio prom.</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Margen $</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r) => (
                  <TableRow key={r.producto_id}>
                    <TableCell>
                      <div className="font-medium text-corp-900">{r.nombre}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.codigo} · {r.categoria}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.unidades}</TableCell>
                    <TableCell className="text-right text-xs">{formatPEN(r.precio_promedio)}</TableCell>
                    <TableCell className="text-right text-xs text-slate-600">{formatPEN(r.costo_materiales + r.costo_mano_obra)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatPEN(r.margen_unitario)}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.margen_pct >= 40 ? 'text-emerald-700' : r.margen_pct >= 20 ? 'text-amber-700' : 'text-red-700'}`}>
                      {r.margen_pct.toFixed(1)}%
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
