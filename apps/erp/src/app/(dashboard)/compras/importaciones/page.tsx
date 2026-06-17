import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Ship, FileText } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import {
  listarImportaciones,
  listarProveedoresParaImportacion,
  ESTADOS_IMPORTACION,
  type ImportacionRow,
} from '@/server/actions/importaciones';
import { EstadoBadge } from './estado-badge';

export const metadata = { title: 'Importaciones' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  proveedor?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

export default async function ImportacionesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const resProvs = await listarProveedoresParaImportacion();
  const proveedores = resProvs.ok ? (resProvs.data ?? []) : [];

  const tableKey = `${sp.estado ?? ''}|${sp.proveedor ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Importaciones Internacionales"
      description="Embarques del exterior con flete, seguro, aduanas y agrupación de OCs."
      actions={
        <Link href="/compras/importaciones/nueva">
          <Button variant="premium" size="sm">
            <Plus className="h-4 w-4" /> Nueva importación
          </Button>
        </Link>
      }
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Estado</span>
            <select
              name="estado"
              defaultValue={sp.estado ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {ESTADOS_IMPORTACION.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Proveedor</span>
            <select
              name="proveedor"
              defaultValue={sp.proveedor ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Embarque desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={sp.desde ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Embarque hasta</span>
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
            <Link href="/compras/importaciones">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={12} cols={8} />}>
        <ImportacionesTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function ImportacionesTabla({ estado, proveedor, desde, hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const res = await listarImportaciones({
    estado: estado ?? '',
    proveedor: proveedor ?? '',
    desde: desde ?? '',
    hasta: hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });
  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar importaciones: {res.error}</p>
      </Card>
    );
  }
  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Ship className="h-6 w-6" />}
        title="Sin importaciones"
        description="No hay importaciones que coincidan con los filtros."
        action={
          <Link href="/compras/importaciones/nueva">
            <Button variant="premium" size="sm">
              <Plus className="h-4 w-4" /> Crear primera importación
            </Button>
          </Link>
        }
      />
    );
  }

  const enTransito = rows.filter((r) => r.estado === 'EN_TRANSITO').length;
  const enAduanas = rows.filter((r) => r.estado === 'EN_ADUANAS').length;
  const recibidas = rows.filter((r) => r.estado === 'RECIBIDA').length;
  const costoTotal = rows.reduce((s, r) => s + r.costo_total_adicional, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">En página</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{rows.length}</p>
          <p className="text-[10px] text-slate-500">de {total} totales</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">En tránsito</p>
          <p className="font-display text-2xl font-semibold text-blue-700">{enTransito}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">En aduanas</p>
          <p className="font-display text-2xl font-semibold text-amber-700">{enAduanas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Recibidas</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">{recibidas}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Costos extra (página)</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {costoTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-500">flete + seguro + aduanas + otros</p>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Embarque</TableHead>
                <TableHead>Arribo</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">OCs</TableHead>
                <TableHead className="text-right">Costos extra</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <ImportacionRowView key={r.id} r={r} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Paginador
        pagina={p}
        totalPaginas={totalPaginas}
        baseSp={{ estado, proveedor, desde, hasta }}
      />
    </div>
  );
}

function ImportacionRowView({ r }: { r: ImportacionRow }) {
  const fmtDate = (d: string | null) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">
        <Link
          href={`/compras/importaciones/${r.id}`}
          className="hover:text-happy-600 hover:underline"
        >
          {r.numero}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-[11px] text-slate-600">{fmtDate(r.fecha_embarque)}</TableCell>
      <TableCell className="font-mono text-[11px] text-slate-600">
        {r.fecha_arribo_real ? (
          <span className="text-emerald-700">{fmtDate(r.fecha_arribo_real)}</span>
        ) : (
          <span className="text-slate-400">esp: {fmtDate(r.fecha_arribo_esperada)}</span>
        )}
      </TableCell>
      <TableCell className="max-w-[220px] truncate text-sm" title={r.proveedor_razon_social}>
        {r.proveedor_razon_social}
      </TableCell>
      <TableCell className="text-xs text-slate-600">{r.pais_origen ?? '—'}</TableCell>
      <TableCell className="text-right">
        <Badge variant="outline" className="gap-1 text-[10px]">
          <FileText className="h-3 w-3" />
          {r.oc_count}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono text-xs">
        <span className="font-semibold text-corp-900">
          {r.costo_total_adicional.toLocaleString('es-PE', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>{' '}
        <span className="text-[10px] text-slate-400">{r.moneda}</span>
      </TableCell>
      <TableCell>
        <EstadoBadge estado={r.estado} />
      </TableCell>
    </TableRow>
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
    if (baseSp.estado) sp2.set('estado', baseSp.estado);
    if (baseSp.proveedor) sp2.set('proveedor', baseSp.proveedor);
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
