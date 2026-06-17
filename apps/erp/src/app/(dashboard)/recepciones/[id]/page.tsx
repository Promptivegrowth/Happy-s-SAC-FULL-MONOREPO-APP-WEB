import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowLeft, FileText, Warehouse, Package, Truck } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { obtenerRecepcion } from '@/server/actions/recepciones';
import { AnularRecepcionButton } from './anular-client';

export const metadata = { title: 'Detalle de recepción' };
export const dynamic = 'force-dynamic';

export default async function RecepcionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obtenerRecepcion(id);
  if (!res.ok || !res.data) {
    if (res.error?.toLowerCase().includes('no encontrada')) notFound();
    return (
      <PageShell title="Recepción" description="Error al cargar la recepción.">
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">{res.error ?? 'No se pudo cargar'}</p>
        </Card>
      </PageShell>
    );
  }

  const { recepcion, lineas } = res.data;
  const fechaTxt = new Date(recepcion.fecha).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <PageShell
      title={`Recepción ${recepcion.numero}`}
      description={
        <span className="flex items-center gap-2">
          <span>OC</span>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <FileText className="h-3 w-3" />
            {recepcion.oc_numero}
          </Badge>
          <span>· {recepcion.proveedor_razon_social}</span>
          {recepcion.anulada && (
            <Badge variant="destructive" className="text-[10px]">
              ANULADA
            </Badge>
          )}
        </span>
      }
      actions={
        <div className="flex gap-2">
          <Link href="/recepciones">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {!recepcion.anulada && <AnularRecepcionButton id={recepcion.id} numero={recepcion.numero} />}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Warehouse className="h-3 w-3" /> Almacén
          </p>
          <p className="font-display text-sm font-semibold text-corp-900">
            {recepcion.almacen_codigo}
          </p>
          <p className="text-[10px] text-slate-500">{recepcion.almacen_nombre}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Fecha</p>
          <p className="font-mono text-sm font-semibold text-corp-900">{fechaTxt}</p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Truck className="h-3 w-3" /> Guía / Factura
          </p>
          <p className="text-sm font-semibold text-corp-900">{recepcion.guia_proveedor ?? '—'}</p>
          <p className="text-[10px] text-slate-500">{recepcion.factura_proveedor ?? 'sin factura'}</p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Package className="h-3 w-3" /> Total
          </p>
          <p className="font-display text-2xl font-semibold text-emerald-700">
            S/{' '}
            {recepcion.total_general.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[10px] text-slate-500">{lineas.length} línea(s)</p>
        </Card>
      </div>

      {recepcion.observacion && (
        <Card className="bg-slate-50 p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Observación</p>
          <p className="text-sm text-slate-700">{recepcion.observacion}</p>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    Esta recepción no tiene líneas.
                  </TableCell>
                </TableRow>
              )}
              {lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="text-sm font-medium text-corp-900">{l.material_nombre}</div>
                    {l.material_codigo && (
                      <div className="font-mono text-[10px] text-slate-400">{l.material_codigo}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                    +{l.cantidad_recibida.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {l.numero_lote ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {l.fecha_vencimiento ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-slate-600">
                    {l.costo_unitario != null ? `S/ ${l.costo_unitario.toFixed(4)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                    S/{' '}
                    {l.subtotal.toLocaleString('es-PE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell
                    className="max-w-[200px] truncate text-xs text-slate-500"
                    title={l.observacion ?? ''}
                  >
                    {l.observacion ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {lineas.length > 0 && (
              <TableBody>
                <TableRow className="bg-slate-50">
                  <TableCell colSpan={5} className="text-right text-xs font-semibold uppercase text-slate-500">
                    Total general
                  </TableCell>
                  <TableCell className="text-right font-mono text-base font-semibold text-corp-900">
                    S/{' '}
                    {recepcion.total_general.toLocaleString('es-PE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            )}
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
