import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { AlertTriangle, Package, Shirt, TrendingDown, Eye } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarStockBajo, type AlertaStock } from '@/server/actions/stock-bajo';
import { listarAlmacenes } from '@/server/actions/kardex';

export const metadata = { title: 'Alertas de stock bajo' };
export const dynamic = 'force-dynamic';

type SP = {
  almacen?: string;
  tipo?: string;
};

export default async function StockBajoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const resAlms = await listarAlmacenes();
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];

  const tableKey = `${sp.almacen ?? ''}|${sp.tipo ?? ''}`;

  return (
    <PageShell
      title="Alertas de stock bajo"
      description="Materiales y variantes con stock por debajo del mínimo."
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Almacén</span>
            <select
              name="almacen"
              defaultValue={sp.almacen ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos los almacenes</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Tipo de ítem</span>
            <select
              name="tipo"
              defaultValue={sp.tipo ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Materiales y variantes</option>
              <option value="MATERIAL">Solo materiales</option>
              <option value="VARIANTE">Solo variantes</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="premium" size="sm">Filtrar</Button>
            <Link href="/inventario/alertas">
              <Button type="button" variant="outline" size="sm">Limpiar</Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={7} />}>
        <AlertasTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function AlertasTabla({ almacen, tipo }: SP) {
  const res = await listarStockBajo({
    almacen_id: (almacen ?? '') as string,
    tipo: (tipo ?? '') as 'MATERIAL' | 'VARIANTE' | '',
  });
  if (!res.ok) {
    return <Card className="border-danger/40 p-4"><p className="text-sm text-danger">{res.error}</p></Card>;
  }
  const { alertas, total_materiales, total_variantes } = res.data!;

  if (alertas.length === 0) {
    return (
      <EmptyState
        icon={<TrendingDown className="h-6 w-6" />}
        title="Sin alertas"
        description="Ningún material o variante está bajo su stock mínimo con los filtros actuales."
      />
    );
  }

  const criticos = alertas.filter((a) => a.stock_actual === 0).length;
  const advertencia = alertas.length - criticos;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-rose-300 bg-rose-50/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-rose-700">Sin stock (0)</p>
          <p className="flex items-center gap-1 font-display text-2xl font-semibold text-rose-800">
            <AlertTriangle className="h-5 w-5" /> {criticos}
          </p>
        </Card>
        <Card className="border-amber-300 bg-amber-50/40 p-3">
          <p className="text-[10px] uppercase tracking-wide text-amber-700">Bajo mínimo</p>
          <p className="font-display text-2xl font-semibold text-amber-800">{advertencia}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Materiales en alerta</p>
          <p className="flex items-center gap-1 font-display text-2xl font-semibold text-corp-900">
            <Package className="h-5 w-5 text-slate-400" /> {total_materiales}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Variantes en alerta</p>
          <p className="flex items-center gap-1 font-display text-2xl font-semibold text-corp-900">
            <Shirt className="h-5 w-5 text-slate-400" /> {total_variantes}
          </p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Ítem</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Stock actual</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Faltante</TableHead>
                <TableHead className="w-[80px] text-right">Ver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertas.map((a) => (
                <AlertaRow key={`${a.tipo}-${a.id}`} a={a} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertaRow({ a }: { a: AlertaStock }) {
  const sinStock = a.stock_actual === 0;
  return (
    <TableRow className={sinStock ? 'bg-rose-50/40' : 'bg-amber-50/30'}>
      <TableCell>
        <Badge variant={a.tipo === 'MATERIAL' ? 'secondary' : 'default'} className="gap-1 text-[10px]">
          {a.tipo === 'MATERIAL' ? <Package className="h-3 w-3" /> : <Shirt className="h-3 w-3" />}
          {a.tipo}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm font-medium text-corp-900">
          {a.nombre}
          {a.detalle && <span className="ml-1 text-slate-500">· {a.detalle}</span>}
        </div>
        <div className="font-mono text-[10px] text-slate-400">{a.codigo}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px]">{a.categoria}</Badge>
      </TableCell>
      <TableCell className={`text-right font-mono text-sm font-semibold ${sinStock ? 'text-rose-800' : 'text-amber-800'}`}>
        {a.stock_actual.toLocaleString('es-PE', { maximumFractionDigits: 2 })} {a.unidad}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-slate-500">
        {a.stock_minimo.toLocaleString('es-PE', { maximumFractionDigits: 2 })} {a.unidad}
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
        {a.faltante.toLocaleString('es-PE', { maximumFractionDigits: 2 })} {a.unidad}
      </TableCell>
      <TableCell className="text-right">
        <Link href={a.href_kardex}>
          <Button variant="ghost" size="sm">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
