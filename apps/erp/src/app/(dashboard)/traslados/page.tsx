import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowRightLeft, Plus, Warehouse, FileText } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarTraslados, type EstadoTraslado } from '@/server/actions/traslados';
import { listarAlmacenes } from '@/server/actions/kardex';

export const metadata = { title: 'Traslados entre Almacenes' };
export const dynamic = 'force-dynamic';

type SP = {
  almacen?: string;
  estado?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

const ESTADOS_FILTRO: EstadoTraslado[] = ['BORRADOR', 'DESPACHADO', 'RECIBIDO', 'ANULADO'];

export default async function TrasladosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const resAlms = await listarAlmacenes();
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];

  const tableKey = `${sp.almacen ?? ''}|${sp.estado ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Traslados entre Almacenes"
      description="Movimientos multi-almacén con flujo BORRADOR → DESPACHADO → RECIBIDO. Trazables 100%."
      actions={
        <Link href="/traslados/nuevo">
          <Button variant="premium" size="sm">
            <Plus className="h-4 w-4" /> Nuevo traslado
          </Button>
        </Link>
      }
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Almacén (origen o destino)</span>
            <select
              name="almacen"
              defaultValue={sp.almacen ?? ''}
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
            <span className="text-xs font-medium text-slate-500">Estado</span>
            <select
              name="estado"
              defaultValue={sp.estado ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {ESTADOS_FILTRO.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={sp.desde ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={sp.hasta ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="premium" size="sm">
              Filtrar
            </Button>
            <Link href="/traslados">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={12} cols={7} />}>
        <TrasladosTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function TrasladosTabla({ almacen, estado, desde, hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const filtroEstado =
    estado && (ESTADOS_FILTRO as string[]).includes(estado) ? (estado as EstadoTraslado) : '';
  const res = await listarTraslados({
    almacen: almacen ?? '',
    estado: filtroEstado,
    desde: desde ?? '',
    hasta: hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });
  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar traslados: {res.error}</p>
      </Card>
    );
  }
  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ArrowRightLeft className="h-6 w-6" />}
        title="Sin traslados"
        description="No hay traslados que coincidan con los filtros."
        action={
          <Link href="/traslados/nuevo">
            <Button variant="premium" size="sm">
              <Plus className="h-4 w-4" /> Crear primer traslado
            </Button>
          </Link>
        }
      />
    );
  }

  const enTransito = rows.filter((r) => r.estado === 'DESPACHADO').length;
  const recibidos = rows.filter((r) => r.estado === 'RECIBIDO').length;
  const borradores = rows.filter((r) => r.estado === 'BORRADOR').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Traslados en página</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{rows.length}</p>
          <p className="text-[10px] text-slate-500">de {total} totales</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">En tránsito</p>
          <p className="font-display text-2xl font-semibold text-amber-700">{enTransito}</p>
          <p className="text-[10px] text-slate-500">despachados sin recibir</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Recibidos</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">{recibidos}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Borradores</p>
          <p className="font-display text-2xl font-semibold text-slate-600">{borradores}</p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const fechaTxt = r.fecha_solicitud
                  ? new Date(r.fecha_solicitud).toLocaleString('es-PE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/traslados/${r.id}`}
                        className="hover:text-happy-600 hover:underline"
                      >
                        {r.codigo}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <Warehouse className="h-3 w-3 text-slate-400" />
                        <span className="font-mono">{r.almacen_origen.codigo}</span>
                        <span className="truncate">{r.almacen_origen.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                        <span className="font-mono">{r.almacen_destino.codigo}</span>
                        <span className="truncate">{r.almacen_destino.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.total_lineas}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      {r.total_cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={r.estado} />
                    </TableCell>
                    <TableCell>
                      {(r.estado === 'DESPACHADO' || r.estado === 'RECIBIDO') && (
                        <Link
                          href={`/traslados/${r.id}?guia=1`}
                          title="Descargar guía de remisión"
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700 hover:bg-amber-100"
                        >
                          <FileText className="h-3 w-3" /> Guía
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Paginador pagina={p} totalPaginas={totalPaginas} baseSp={{ almacen, estado, desde, hasta }} />
    </div>
  );
}

export function EstadoBadge({ estado }: { estado: EstadoTraslado }) {
  if (estado === 'BORRADOR') {
    return (
      <Badge variant="secondary" className="text-[10px]">
        BORRADOR
      </Badge>
    );
  }
  if (estado === 'DESPACHADO') {
    return (
      <Badge variant="warning" className="text-[10px]">
        DESPACHADO
      </Badge>
    );
  }
  if (estado === 'RECIBIDO') {
    return (
      <Badge variant="success" className="text-[10px]">
        RECIBIDO
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      ANULADO
    </Badge>
  );
}

function Paginador({
  pagina,
  totalPaginas,
  baseSp,
}: {
  pagina: number;
  totalPaginas: number;
  baseSp: Omit<SP, 'pagina'>;
}) {
  function url(p: number) {
    const sp2 = new URLSearchParams();
    if (baseSp.almacen) sp2.set('almacen', baseSp.almacen);
    if (baseSp.estado) sp2.set('estado', baseSp.estado);
    if (baseSp.desde) sp2.set('desde', baseSp.desde);
    if (baseSp.hasta) sp2.set('hasta', baseSp.hasta);
    sp2.set('pagina', String(p));
    return `?${sp2.toString()}`;
  }
  if (totalPaginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-500">
        Página {pagina} de {totalPaginas}
      </span>
      <div className="flex gap-2">
        <Link href={url(Math.max(1, pagina - 1))} aria-disabled={pagina <= 1}>
          <Button variant="outline" size="sm" disabled={pagina <= 1}>
            ← Anterior
          </Button>
        </Link>
        <Link href={url(Math.min(totalPaginas, pagina + 1))} aria-disabled={pagina >= totalPaginas}>
          <Button variant="outline" size="sm" disabled={pagina >= totalPaginas}>
            Siguiente →
          </Button>
        </Link>
      </div>
    </div>
  );
}
