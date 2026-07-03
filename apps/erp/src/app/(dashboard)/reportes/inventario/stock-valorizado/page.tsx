import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Package, Shirt, Boxes, TrendingUp } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { reporteStockValorizado, listarAlmacenesLookup } from '@/server/actions/reportes';

export const metadata = { title: 'Stock valorizado' };
export const dynamic = 'force-dynamic';

type SP = { almacen?: string; tipo?: string };

const PEN = (n: number) =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const almacen_id = sp.almacen ?? '';
  const tipo = (sp.tipo as 'VARIANTE' | 'MATERIAL' | undefined) ?? '';

  const [resultado, almacenes] = await Promise.all([
    reporteStockValorizado({ almacen_id, tipo }),
    listarAlmacenesLookup(),
  ]);
  const { metricas, rows } = resultado;

  // Desglose por almacén cuando estamos viendo "Todos" — el gerente ve el
  // global arriba y abajo cuánto vale cada almacén individualmente. Cliente
  // pidió explícitamente ver "el total de los 3 almacenes" a la vez.
  const porAlmacen = new Map<string, number>();
  if (!almacen_id) {
    for (const r of rows) {
      porAlmacen.set(r.almacen, (porAlmacen.get(r.almacen) ?? 0) + r.valor_total);
    }
  }
  const desgloseAlmacenes = Array.from(porAlmacen.entries())
    .sort((a, b) => b[1] - a[1]);

  const exportPayload = {
    titulo: 'Stock valorizado',
    subtitulo: `Snapshot al ${new Date().toLocaleString('es-PE')}`,
    filtros: [
      almacen_id
        ? `Almacén: ${almacenes.find((a) => a.id === almacen_id)?.codigo ?? almacen_id}`
        : 'Almacén: Todos',
      `Tipo: ${tipo || 'Variantes + Materiales'}`,
    ],
    cols: [
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Almacén', key: 'almacen', width: 24 },
      { header: 'Código', key: 'codigo', width: 16 },
      { header: 'Nombre', key: 'nombre', width: 36 },
      { header: 'Detalle', key: 'detalle', width: 16 },
      { header: 'Categoría', key: 'categoria', width: 16 },
      { header: 'Cantidad', key: 'cantidad', formato: 'numero' as const, width: 12 },
      { header: 'Costo unit.', key: 'costo_unitario', formato: 'moneda' as const, width: 14 },
      { header: 'Valor total', key: 'valor_total', formato: 'moneda' as const, width: 14 },
    ],
    rows,
    totales: { valor_total: metricas.valor_total },
  };

  return (
    <PageShell
      title="Stock valorizado"
      description="Snapshot del stock actual con valuación monetaria"
      actions={<ExportButtons payload={exportPayload} />}
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Almacén</span>
            <select
              name="almacen"
              defaultValue={almacen_id}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Tipo</span>
            <select
              name="tipo"
              defaultValue={tipo}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Variantes y materiales</option>
              <option value="VARIANTE">Solo variantes</option>
              <option value="MATERIAL">Solo materiales</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="premium" size="sm">
              Filtrar
            </Button>
            <Link href="/reportes/inventario/stock-valorizado">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Valor total</p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-semibold text-corp-900">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            {PEN(metricas.valor_total)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Variantes (PT)</p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-semibold text-corp-900">
            <Shirt className="h-5 w-5 text-slate-400" />
            {PEN(metricas.valor_variantes)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Materiales</p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-semibold text-corp-900">
            <Package className="h-5 w-5 text-slate-400" />
            {PEN(metricas.valor_materiales)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Items con stock</p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-semibold text-corp-900">
            <Boxes className="h-5 w-5 text-slate-400" />
            {metricas.items_con_stock}
          </p>
          {metricas.items_sin_costo > 0 && (
            <p className="text-[10px] text-amber-700">⚠ {metricas.items_sin_costo} sin costo cargado</p>
          )}
        </Card>
      </div>

      {!almacen_id && desgloseAlmacenes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Desglose por almacén ({desgloseAlmacenes.length})
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {desgloseAlmacenes.map(([nombre, valor]) => {
              const pct = metricas.valor_total > 0 ? (valor / metricas.valor_total) * 100 : 0;
              return (
                <Card key={nombre} className="p-3">
                  <p className="text-xs font-medium text-slate-600 truncate" title={nombre}>{nombre}</p>
                  <p className="mt-1 font-display text-lg font-semibold text-corp-900">{PEN(valor)}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-happy-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">{pct.toFixed(1)}% del total</p>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={<Package className="h-6 w-6" />} title="Sin stock" description="No hay items con stock en los filtros." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Ítem</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={r.tipo === 'VARIANTE' ? 'default' : 'secondary'} className="text-[10px]">
                        {r.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.almacen}</TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-corp-900">
                        {r.nombre}
                        {r.detalle && <span className="ml-1 text-slate-500">· {r.detalle}</span>}
                      </div>
                      <div className="font-mono text-[10px] text-slate-400">{r.codigo}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{r.categoria}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">
                      {r.costo_unitario === 0 ? <span className="text-amber-600">—</span> : PEN(r.costo_unitario)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      {PEN(r.valor_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 200 && (
              <div className="border-t bg-slate-50/50 p-3 text-center text-xs text-slate-500">
                Mostrando 200 de {rows.length} items. Exportá a Excel para verlos todos.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
