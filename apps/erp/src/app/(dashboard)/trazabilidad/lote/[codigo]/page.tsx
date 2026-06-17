import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Package, Factory, Warehouse, ArrowLeft, User } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { historicoLote, type TrazaEvento } from '@/server/actions/trazabilidad';
import { TrazabilidadTimeline } from '../../timeline';

export const dynamic = 'force-dynamic';

export default async function LoteTrazaPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const decoded = decodeURIComponent(codigo);
  const res = await historicoLote(decoded);
  if (!res.ok) {
    if (res.error?.includes('no encontrado')) notFound();
    return (
      <PageShell title="Error" description="">
        <Card className="border-danger/40 p-4 text-sm text-danger">{res.error}</Card>
      </PageShell>
    );
  }
  const { lote, eventos } = res.data!;

  // Upstream: primer evento de producción + datos OT/operario/taller
  const eventoOrigen = eventos.find(
    (e) => e.subtipo?.includes('PRODUCCION') || e.fuente === 'CORTE',
  );
  // Downstream: ventas, traslados, devoluciones después de la producción
  const eventosDownstream = eventos.filter(
    (e) =>
      e.subtipo?.includes('VENTA') ||
      e.subtipo === 'TRASLADO' ||
      e.subtipo?.includes('TRASLADO') ||
      e.subtipo?.includes('DEVOLUCION') ||
      e.subtipo?.includes('MERMA'),
  );

  return (
    <PageShell
      title={`Lote ${lote.codigo}`}
      description={
        <span className="inline-flex items-center gap-2 text-sm">
          <Package className="h-3.5 w-3.5" />
          {lote.variante.producto.nombre} · talla {lote.variante.talla.replace('T', '')} · SKU{' '}
          <Link href={`/trazabilidad/variante/${lote.variante.id}`} className="font-mono text-happy-700 hover:underline">
            {lote.variante.sku}
          </Link>
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Cantidad actual</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{lote.cantidad_actual}</p>
          <p className="text-[10px] text-slate-500">de {lote.cantidad_inicial} iniciales</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Estado</p>
          <Badge
            variant={
              lote.estado === 'DISPONIBLE'
                ? 'success'
                : lote.estado === 'VENDIDO' || lote.estado === 'MERMA'
                  ? 'destructive'
                  : 'secondary'
            }
            className="mt-1"
          >
            {lote.estado}
          </Badge>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Almacén actual</p>
          <p className="flex items-center gap-1 font-display text-sm font-semibold text-corp-900">
            <Warehouse className="h-4 w-4 text-slate-400" />
            {lote.almacen_actual?.codigo ?? '—'}
          </p>
          <p className="text-[10px] text-slate-500">{lote.almacen_actual?.nombre ?? ''}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Costo unitario</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {lote.costo_unitario != null ? `S/ ${lote.costo_unitario.toFixed(4)}` : '—'}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            <Factory className="h-4 w-4" /> Origen
          </h3>
          <dl className="space-y-2 text-xs">
            <DataRow
              label="OT"
              value={
                lote.ot ? (
                  <Link href={`/trazabilidad/ot/${lote.ot.id}`} className="text-happy-700 hover:underline">
                    {lote.ot.numero}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <DataRow label="Estado OT" value={lote.ot?.estado.replace(/_/g, ' ') ?? '—'} />
            <DataRow label="Producción" value={lote.fecha_produccion ?? '—'} />
            <DataRow label="Ingreso PT" value={lote.fecha_ingreso ?? '—'} />
            {eventoOrigen?.operario && (
              <DataRow
                label="Operario"
                value={
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {eventoOrigen.operario.nombres}
                    {eventoOrigen.operario.apellido_paterno
                      ? ` ${eventoOrigen.operario.apellido_paterno}`
                      : ''}
                  </span>
                }
              />
            )}
            {eventoOrigen?.taller && <DataRow label="Taller" value={eventoOrigen.taller.nombre} />}
            {lote.observacion && <DataRow label="Obs." value={lote.observacion} />}
          </dl>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
            <Package className="h-4 w-4" /> Trazabilidad hacia adelante ({eventosDownstream.length})
          </h3>
          {eventosDownstream.length === 0 ? (
            <p className="text-xs text-slate-500">Este lote todavía no ha tenido movimientos posteriores.</p>
          ) : (
            <ResumenDownstream eventos={eventosDownstream} />
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

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-right text-xs text-corp-900">{value}</dd>
    </div>
  );
}

function ResumenDownstream({ eventos }: { eventos: TrazaEvento[] }) {
  const counts = eventos.reduce<Record<string, { c: number; cant: number }>>((acc, e) => {
    const k = e.subtipo ?? 'OTRO';
    if (!acc[k]) acc[k] = { c: 0, cant: 0 };
    acc[k].c += 1;
    acc[k].cant += e.cantidad ?? 0;
    return acc;
  }, {});
  return (
    <ul className="space-y-1.5 text-xs">
      {Object.entries(counts).map(([k, v]) => (
        <li key={k} className="flex items-baseline justify-between gap-2">
          <span className="text-slate-700">{k.replace(/_/g, ' ')}</span>
          <span className="font-mono text-slate-500">
            {v.c} evento{v.c === 1 ? '' : 's'} · {v.cant} u.
          </span>
        </li>
      ))}
    </ul>
  );
}
