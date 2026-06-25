import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowLeft, Warehouse, ArrowRightLeft, Package } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { obtenerTraslado } from '@/server/actions/traslados';
import { cargarEmpresaPDF } from '@/server/empresa-pdf-helper';
import { EstadoBadge } from '../page';
import { AccionesTraslado } from './acciones-client';
import { DescargarGuiaButton } from './descargar-guia-button';

export const metadata = { title: 'Detalle de traslado' };
export const dynamic = 'force-dynamic';

export default async function TrasladoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obtenerTraslado(id);
  if (!res.ok || !res.data) {
    if (res.error?.toLowerCase().includes('no encontrado')) notFound();
    return (
      <PageShell title="Traslado" description="Error al cargar el traslado.">
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">{res.error ?? 'No se pudo cargar'}</p>
        </Card>
      </PageShell>
    );
  }

  const { traslado, lineas } = res.data;
  const empresa = await cargarEmpresaPDF();

  const fmtFecha = (f: string | null) =>
    f
      ? new Date(f).toLocaleString('es-PE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  const totalCantidad = lineas.reduce((s, l) => s + l.cantidad, 0);
  const totalRecibido = lineas.reduce((s, l) => s + (l.cantidad_recibida ?? 0), 0);
  const hayDiferencias =
    traslado.estado === 'RECIBIDO' &&
    lineas.some((l) => (l.diferencia ?? 0) !== 0);

  return (
    <PageShell
      title={`Traslado ${traslado.codigo}`}
      description={
        <span className="flex items-center gap-2">
          <EstadoBadge estado={traslado.estado} />
          <span className="text-slate-500">·</span>
          <span className="text-xs text-slate-600">
            {traslado.almacen_origen_codigo}
          </span>
          <ArrowRightLeft className="h-3 w-3 text-slate-400" />
          <span className="text-xs text-slate-600">
            {traslado.almacen_destino_codigo}
          </span>
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Link href="/traslados">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {/* Guía de remisión disponible una vez despachado o recibido */}
          {(traslado.estado === 'DESPACHADO' || traslado.estado === 'RECIBIDO') && lineas.length > 0 && (
            <DescargarGuiaButton traslado={traslado} lineas={lineas} empresa={empresa} />
          )}
          <AccionesTraslado
            id={traslado.id}
            codigo={traslado.codigo}
            estado={traslado.estado}
            lineas={lineas.map((l) => ({
              id: l.id,
              nombre: l.nombre,
              detalle: l.detalle,
              cantidad: l.cantidad,
            }))}
          />
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Warehouse className="h-3 w-3" /> Origen
          </p>
          <p className="font-display text-sm font-semibold text-corp-900">
            {traslado.almacen_origen_codigo}
          </p>
          <p className="text-[10px] text-slate-500">{traslado.almacen_origen_nombre}</p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Warehouse className="h-3 w-3" /> Destino
          </p>
          <p className="font-display text-sm font-semibold text-corp-900">
            {traslado.almacen_destino_codigo}
          </p>
          <p className="text-[10px] text-slate-500">{traslado.almacen_destino_nombre}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Fechas</p>
          <p className="font-mono text-[11px] text-slate-700">
            <span className="text-slate-500">Sol:</span> {fmtFecha(traslado.fecha_solicitud)}
          </p>
          <p className="font-mono text-[11px] text-slate-700">
            <span className="text-slate-500">Desp:</span> {fmtFecha(traslado.fecha_despacho)}
          </p>
          <p className="font-mono text-[11px] text-slate-700">
            <span className="text-slate-500">Rec:</span> {fmtFecha(traslado.fecha_recepcion)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Package className="h-3 w-3" /> Cantidades
          </p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {totalCantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
          </p>
          <p className="text-[10px] text-slate-500">
            {lineas.length} línea(s)
            {traslado.estado === 'RECIBIDO' &&
              ` · recibido ${totalRecibido.toLocaleString('es-PE', { maximumFractionDigits: 4 })}`}
          </p>
        </Card>
      </div>

      {(traslado.motivo || traslado.observacion) && (
        <Card className="bg-slate-50 p-3">
          {traslado.motivo && (
            <div className="mb-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Motivo</p>
              <p className="text-sm text-slate-700">{traslado.motivo}</p>
            </div>
          )}
          {traslado.observacion && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Observación</p>
              <p className="text-sm text-slate-700">{traslado.observacion}</p>
            </div>
          )}
        </Card>
      )}

      {hayDiferencias && (
        <Card className="border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            Hay líneas con diferencia entre lo despachado y lo recibido. Registra una merma manual
            si corresponde.
          </p>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Ítem</TableHead>
                <TableHead>Detalle</TableHead>
                <TableHead className="text-right">Cant. solicitada</TableHead>
                {traslado.estado !== 'BORRADOR' && traslado.estado !== 'ANULADO' && (
                  <TableHead className="text-right">Cant. recibida</TableHead>
                )}
                {traslado.estado === 'RECIBIDO' && (
                  <TableHead className="text-right">Diferencia</TableHead>
                )}
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Este traslado no tiene líneas.
                  </TableCell>
                </TableRow>
              )}
              {lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {l.tipo === 'VARIANTE' ? 'Producto' : 'Material'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-corp-900">{l.nombre}</div>
                    {l.codigo && (
                      <div className="font-mono text-[10px] text-slate-400">{l.codigo}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{l.detalle ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {l.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                  </TableCell>
                  {traslado.estado !== 'BORRADOR' && traslado.estado !== 'ANULADO' && (
                    <TableCell className="text-right font-mono text-sm">
                      {l.cantidad_recibida != null
                        ? l.cantidad_recibida.toLocaleString('es-PE', {
                            maximumFractionDigits: 4,
                          })
                        : '—'}
                    </TableCell>
                  )}
                  {traslado.estado === 'RECIBIDO' && (
                    <TableCell className="text-right font-mono text-sm">
                      {l.diferencia == null || l.diferencia === 0 ? (
                        <span className="text-slate-400">0</span>
                      ) : (
                        <span
                          className={
                            l.diferencia < 0 ? 'font-semibold text-rose-600' : 'text-emerald-700'
                          }
                        >
                          {l.diferencia > 0 ? '+' : ''}
                          {l.diferencia.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                        </span>
                      )}
                    </TableCell>
                  )}
                  <TableCell
                    className="max-w-[220px] truncate text-xs text-slate-500"
                    title={l.observacion ?? ''}
                  >
                    {l.observacion ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
