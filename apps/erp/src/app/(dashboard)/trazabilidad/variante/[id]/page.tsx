import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Package, Warehouse, ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { historicoVariante } from '@/server/actions/trazabilidad';
import { TrazabilidadTimeline } from '../../timeline';

export const dynamic = 'force-dynamic';

export default async function VarianteTrazaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const res = await historicoVariante(id, {
    desde: sp.desde ?? '',
    hasta: sp.hasta ?? '',
    limite: 200,
  });
  if (!res.ok) {
    if (res.error?.includes('no encontrada')) notFound();
    return (
      <PageShell title="Error" description="">
        <Card className="border-danger/40 p-4 text-sm text-danger">{res.error}</Card>
      </PageShell>
    );
  }
  const { variante, eventos } = res.data!;
  const stockTotal = variante.stock_por_almacen.reduce((s, r) => s + r.cantidad, 0);

  return (
    <PageShell
      title={`${variante.producto.nombre} · talla ${variante.talla.replace('T', '')}`}
      description={
        <span className="inline-flex items-center gap-2 text-sm">
          <Package className="h-3.5 w-3.5" />
          SKU <span className="font-mono text-happy-700">{variante.sku}</span>
          {variante.color && <> · color {variante.color}</>}
          <span className="text-slate-400">·</span>
          Código producto <span className="font-mono">{variante.producto.codigo}</span>
        </span>
      }
      actions={
        <Link href="/trazabilidad">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-happy-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </span>
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Stock total</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{stockTotal}</p>
          <p className="text-[10px] text-slate-500">en {variante.stock_por_almacen.length} almacén/es</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Lotes activos</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{variante.lotes_activos.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Eventos en timeline</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{eventos.length}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            <Warehouse className="h-4 w-4" /> Stock por almacén
          </h3>
          {variante.stock_por_almacen.length === 0 ? (
            <p className="text-xs text-slate-500">Sin stock registrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variante.stock_por_almacen.map((s) => (
                  <TableRow key={s.almacen_id}>
                    <TableCell className="text-xs">
                      <span className="font-mono">{s.codigo}</span>
                      <span className="text-slate-500"> · {s.nombre}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{s.cantidad}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            <Package className="h-4 w-4" /> Lotes asociados
          </h3>
          {variante.lotes_activos.length === 0 ? (
            <p className="text-xs text-slate-500">Sin lotes registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variante.lotes_activos.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-[11px]">
                      <Link
                        href={`/trazabilidad/lote/${encodeURIComponent(l.codigo)}`}
                        className="text-happy-700 hover:underline"
                      >
                        {l.codigo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          l.estado === 'DISPONIBLE'
                            ? 'success'
                            : l.estado === 'VENDIDO' || l.estado === 'MERMA'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {l.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{l.almacen_codigo ?? '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {l.cantidad_actual} / {l.cantidad_inicial}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-lg font-semibold text-corp-900">
          Timeline de movimientos ({eventos.length})
        </h2>
        <TrazabilidadTimeline eventos={eventos} />
      </div>
    </PageShell>
  );
}
