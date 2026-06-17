import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PackageOpen, Plus, Warehouse, FileText } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarRecepciones } from '@/server/actions/recepciones';
import { listarAlmacenes } from '@/server/actions/kardex';

export const metadata = { title: 'Recepciones de Mercadería' };
export const dynamic = 'force-dynamic';

type SP = {
  almacen?: string;
  oc?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

export default async function RecepcionesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const resAlms = await listarAlmacenes();
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];

  const tableKey = `${sp.almacen ?? ''}|${sp.oc ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Recepciones de Mercadería"
      description="Ingreso físico de compras contra órdenes de compra (OC). Genera entradas en kardex."
      actions={
        <Link href="/recepciones/nueva">
          <Button variant="premium" size="sm">
            <Plus className="h-4 w-4" /> Nueva recepción
          </Button>
        </Link>
      }
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Almacén</span>
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
            <span className="text-xs font-medium text-slate-500">OC (uuid)</span>
            <input
              type="text"
              name="oc"
              defaultValue={sp.oc ?? ''}
              placeholder="filtrar por id de OC"
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
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
            <Link href="/recepciones">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={12} cols={7} />}>
        <RecepcionesTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function RecepcionesTabla({ almacen, oc, desde, hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const res = await listarRecepciones({
    almacen_id: almacen ?? '',
    oc_id: oc ?? '',
    desde: desde ?? '',
    hasta: hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });
  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar recepciones: {res.error}</p>
      </Card>
    );
  }
  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="h-6 w-6" />}
        title="Sin recepciones"
        description="No hay recepciones que coincidan con los filtros."
        action={
          <Link href="/recepciones/nueva">
            <Button variant="premium" size="sm">
              <Plus className="h-4 w-4" /> Registrar primera recepción
            </Button>
          </Link>
        }
      />
    );
  }

  const totalCantidad = rows.reduce((s, r) => s + r.total_cantidad, 0);
  const anuladas = rows.filter((r) => r.anulada).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Recepciones en página</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{rows.length}</p>
          <p className="text-[10px] text-slate-500">de {total} totales</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Unidades recibidas</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">
            {totalCantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Anuladas (página)</p>
          <p className="font-display text-2xl font-semibold text-rose-700">{anuladas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Página</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {p} / {totalPaginas}
          </p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>OC</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const fechaTxt = new Date(r.fecha).toLocaleString('es-PE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/recepciones/${r.id}`} className="hover:text-happy-600 hover:underline">
                        {r.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <FileText className="h-3 w-3" />
                        {r.oc_numero}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-sm" title={r.proveedor}>
                      {r.proveedor}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-slate-600">
                        <Warehouse className="h-3 w-3 text-slate-400" />
                        {r.almacen}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.total_lineas}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                      {r.total_cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell>
                      {r.anulada ? (
                        <Badge variant="destructive" className="text-[10px]">
                          ANULADA
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">
                          ACTIVA
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Paginador pagina={p} totalPaginas={totalPaginas} baseSp={{ almacen, oc, desde, hasta }} />
    </div>
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
    if (baseSp.oc) sp2.set('oc', baseSp.oc);
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
