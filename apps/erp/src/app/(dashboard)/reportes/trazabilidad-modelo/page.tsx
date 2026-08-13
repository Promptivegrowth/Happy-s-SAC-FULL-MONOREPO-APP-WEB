import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Route, Factory, ShoppingCart, Warehouse } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatTallaChip } from '@happy/lib';
import { reporteTrazabilidadProduccionVenta } from '@/server/actions/reportes-produccion2';

export const metadata = { title: 'Trazabilidad producción → venta' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { metricas, rows } = await reporteTrazabilidadProduccionVenta({});

  const exportPayload = {
    titulo: 'Trazabilidad producción → venta',
    subtitulo: 'Por modelo y talla',
    filtros: [],
    cols: [
      { header: 'Modelo', key: 'producto_nombre', width: 30 },
      { header: 'Talla', key: 'talla', width: 8 },
      { header: 'SKU', key: 'sku', width: 12 },
      { header: 'Producido', key: 'producido', formato: 'numero' as const, width: 12 },
      { header: 'Vendido', key: 'vendido', formato: 'numero' as const, width: 12 },
      { header: 'Devuelto', key: 'devuelto', formato: 'numero' as const, width: 12 },
      { header: 'En stock', key: 'stock', formato: 'numero' as const, width: 12 },
    ],
    rows: rows.map((r) => ({ ...r, talla: formatTallaChip(r.talla) })),
    totales: { producido: metricas.producido, vendido: metricas.vendido, stock: metricas.stock },
  };

  return (
    <PageShell
      title="Trazabilidad producción → venta"
      description="Cuánto se produjo, se vendió y queda en stock, por modelo y talla. Sigue el flujo desde la producción hasta la venta."
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Variantes</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><Route className="h-5 w-5 text-slate-400" />{metricas.variantes}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Producido</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-emerald-700"><Factory className="h-5 w-5 text-emerald-500" />{metricas.producido.toLocaleString('es-PE')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Vendido</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><ShoppingCart className="h-5 w-5 text-slate-400" />{metricas.vendido.toLocaleString('es-PE')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">En stock</p>
          <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-corp-900"><Warehouse className="h-5 w-5 text-slate-400" />{metricas.stock.toLocaleString('es-PE')}</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Route className="h-6 w-6" />} title="Sin datos" description="Aún no hay producción registrada (cierres de OT que generen PT)." />
      ) : (
        <Card>
          <div className="border-b bg-slate-50 p-3"><h3 className="text-sm font-semibold text-corp-900">Detalle por modelo y talla</h3></div>
          <div className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Producido</TableHead>
                  <TableHead className="text-right">Vendido</TableHead>
                  <TableHead className="text-right">Devuelto</TableHead>
                  <TableHead className="text-right">En stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 500).map((r) => (
                  <TableRow key={r.variante_id}>
                    <TableCell className="text-sm font-medium">{r.producto_nombre}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{formatTallaChip(r.talla)}</Badge></TableCell>
                    <TableCell className="font-mono text-[10px] text-slate-500">{r.sku}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-700">{r.producido.toLocaleString('es-PE')}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.vendido.toLocaleString('es-PE')}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-amber-600">{r.devuelto > 0 ? r.devuelto.toLocaleString('es-PE') : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{r.stock.toLocaleString('es-PE')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 500 && <p className="border-t bg-slate-50 p-2 text-center text-[10px] text-slate-500">Mostrando 500 de {rows.length} — export completo en Excel/PDF.</p>}
          </div>
        </Card>
      )}
    </PageShell>
  );
}
