import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Factory, Warehouse, ArrowLeft, Package } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { historicoOT } from '@/server/actions/trazabilidad';
import { TrazabilidadTimeline } from '../../timeline';

export const dynamic = 'force-dynamic';

export default async function OtTrazaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await historicoOT(id);
  if (!res.ok) {
    if (res.error?.includes('no encontrada')) notFound();
    return (
      <PageShell title="Error" description="">
        <Card className="border-danger/40 p-4 text-sm text-danger">{res.error}</Card>
      </PageShell>
    );
  }
  const { ot, eventos } = res.data!;

  const totalPlan = ot.lineas.reduce((s, l) => s + l.cantidad_planificada, 0);
  const totalTerm = ot.lineas.reduce((s, l) => s + l.cantidad_terminada, 0);
  const pct = totalPlan > 0 ? Math.round((totalTerm / totalPlan) * 100) : 0;

  return (
    <PageShell
      title={`OT ${ot.numero}`}
      description={
        <span className="inline-flex items-center gap-2 text-sm">
          <Factory className="h-3.5 w-3.5" />
          {ot.producto?.nombre ?? 'Sin producto'} ·{' '}
          <Badge variant="outline" className="text-[10px]">
            {ot.estado.replace(/_/g, ' ')}
          </Badge>
        </span>
      }
      actions={
        <div className="flex items-center gap-3">
          <Link href={`/ot/${ot.id}`}>
            <span className="text-xs text-slate-500 hover:text-happy-600">Ir a OT operativa →</span>
          </Link>
          <Link href="/trazabilidad">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-happy-600">
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </span>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Avance</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{pct}%</p>
          <p className="text-[10px] text-slate-500">{totalTerm} / {totalPlan} u.</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Apertura</p>
          <p className="font-mono text-sm text-corp-900">{ot.fecha_apertura ?? '—'}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Entrega objetivo</p>
          <p className="font-mono text-sm text-corp-900">{ot.fecha_entrega_objetivo ?? '—'}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Almacén producción</p>
          <p className="flex items-center gap-1 font-mono text-sm text-corp-900">
            <Warehouse className="h-3.5 w-3.5 text-slate-400" />
            {ot.almacen_produccion?.codigo ?? '—'}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            <Factory className="h-4 w-4" /> Líneas planificadas
          </h3>
          {ot.lineas.length === 0 ? (
            <p className="text-xs text-slate-500">Sin líneas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Talla</TableHead>
                  <TableHead className="text-right">Planificado</TableHead>
                  <TableHead className="text-right">Terminado</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ot.lineas.map((l) => {
                  const lpct =
                    l.cantidad_planificada > 0
                      ? Math.round((l.cantidad_terminada / l.cantidad_planificada) * 100)
                      : 0;
                  return (
                    <TableRow key={`${l.producto_id}-${l.talla}`}>
                      <TableCell className="font-mono text-xs">{l.talla.replace('T', '')}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{l.cantidad_planificada}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-700">
                        {l.cantidad_terminada}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{lpct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            <Package className="h-4 w-4" /> Lotes generados ({ot.lotes_generados.length})
          </h3>
          {ot.lotes_generados.length === 0 ? (
            <p className="text-xs text-slate-500">Sin lotes producidos todavía.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ot.lotes_generados.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-[11px]">
                      <Link
                        href={`/trazabilidad/lote/${encodeURIComponent(l.codigo)}`}
                        className="text-happy-700 hover:underline"
                      >
                        {l.codigo}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-500">{l.variante_sku}</TableCell>
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
          Timeline completo ({eventos.length})
        </h2>
        <TrazabilidadTimeline eventos={eventos} />
      </div>
    </PageShell>
  );
}
