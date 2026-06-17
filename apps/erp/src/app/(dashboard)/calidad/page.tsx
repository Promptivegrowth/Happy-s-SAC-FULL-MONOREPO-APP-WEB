import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Scale, Plus, FileText, AlertTriangle, Settings } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarControles, estadisticasCalidad } from '@/server/actions/calidad';

export const metadata = { title: 'Control de Calidad' };
export const dynamic = 'force-dynamic';

type SP = {
  ot?: string;
  os?: string;
  producto?: string;
  revisor?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

export default async function CalidadPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const tableKey = `${sp.ot ?? ''}|${sp.os ?? ''}|${sp.producto ?? ''}|${sp.revisor ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Control de Calidad"
      description="Inspección de producto terminado: defectos, acciones (reproceso/segunda/merma) y descuentos."
      actions={
        <div className="flex gap-2">
          <Link href="/calidad/defectos">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" /> Catálogo de defectos
            </Button>
          </Link>
          <Link href="/calidad/nuevo">
            <Button variant="premium" size="sm">
              <Plus className="h-4 w-4" /> Registrar control
            </Button>
          </Link>
        </div>
      }
    >
      <Suspense fallback={<StatsLoadingSkeleton />}>
        <CalidadStats desde={sp.desde} hasta={sp.hasta} producto_id={sp.producto} />
      </Suspense>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">OT (uuid)</span>
            <input
              type="text"
              name="ot"
              defaultValue={sp.ot ?? ''}
              placeholder="id de OT"
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">OS (uuid)</span>
            <input
              type="text"
              name="os"
              defaultValue={sp.os ?? ''}
              placeholder="id de OS"
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Producto (uuid)</span>
            <input
              type="text"
              name="producto"
              defaultValue={sp.producto ?? ''}
              placeholder="id de producto"
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
            <Link href="/calidad">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={12} cols={8} />}>
        <ControlesTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

function StatsLoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="p-3">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-7 w-24 animate-pulse rounded bg-slate-200" />
        </Card>
      ))}
    </div>
  );
}

async function CalidadStats({
  desde,
  hasta,
  producto_id,
}: {
  desde?: string;
  hasta?: string;
  producto_id?: string;
}) {
  const res = await estadisticasCalidad({
    desde: desde ?? '',
    hasta: hasta ?? '',
    producto_id: producto_id ?? '',
  });
  if (!res.ok || !res.data) return null;
  const stats = res.data;
  const topDef = stats.top_defectos[0];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Controles</p>
        <p className="font-display text-2xl font-semibold text-corp-900">{stats.total_controles}</p>
        <p className="text-[10px] text-slate-500">
          {stats.total_revisados.toLocaleString('es-PE')} unidades revisadas
        </p>
      </Card>
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Tasa de calidad</p>
        <p
          className={`font-display text-2xl font-semibold ${
            stats.tasa_calidad >= 95
              ? 'text-emerald-700'
              : stats.tasa_calidad >= 85
                ? 'text-amber-700'
                : 'text-rose-700'
          }`}
        >
          {stats.tasa_calidad.toFixed(1)}%
        </p>
        <p className="text-[10px] text-slate-500">
          {stats.total_ok.toLocaleString('es-PE')} OK / {stats.total_falla.toLocaleString('es-PE')} fallas
        </p>
      </Card>
      <Card className="p-3">
        <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
          <AlertTriangle className="h-3 w-3" /> Defecto más común
        </p>
        <p className="font-display text-sm font-semibold text-corp-900 truncate" title={topDef?.defecto_nombre}>
          {topDef?.defecto_nombre ?? '—'}
        </p>
        <p className="text-[10px] text-slate-500">
          {topDef ? `${topDef.total_cantidad} u. · ${topDef.controles_count} controles` : 'sin datos'}
        </p>
      </Card>
      <Card className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Total fallas</p>
        <p className="font-display text-2xl font-semibold text-rose-700">
          {stats.total_falla.toLocaleString('es-PE')}
        </p>
        <p className="text-[10px] text-slate-500">
          {stats.total_revisados > 0
            ? `${((stats.total_falla / stats.total_revisados) * 100).toFixed(1)}% de lo revisado`
            : ''}
        </p>
      </Card>
    </div>
  );
}

async function ControlesTabla({ ot, os, producto, revisor, desde, hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const res = await listarControles({
    ot_id: ot ?? '',
    os_id: os ?? '',
    producto_id: producto ?? '',
    revisor_id: revisor ?? '',
    desde: desde ?? '',
    hasta: hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });

  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar controles: {res.error}</p>
      </Card>
    );
  }

  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Scale className="h-6 w-6" />}
        title="Sin controles registrados"
        description="No hay controles de calidad con los filtros actuales."
        action={
          <Link href="/calidad/nuevo">
            <Button variant="premium" size="sm">
              <Plus className="h-4 w-4" /> Registrar primer control
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Revisor</TableHead>
                <TableHead className="text-right">Revisado</TableHead>
                <TableHead className="text-right">OK</TableHead>
                <TableHead className="text-right">Falla</TableHead>
                <TableHead className="text-right">% Calidad</TableHead>
                <TableHead>Responsable</TableHead>
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
                const tasaColor =
                  r.tasa_calidad >= 95
                    ? 'success'
                    : r.tasa_calidad >= 85
                      ? 'warning'
                      : 'destructive';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/calidad/${r.id}`} className="hover:text-happy-600 hover:underline">
                        {r.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">
                      {fechaTxt}
                    </TableCell>
                    <TableCell className="space-y-1">
                      {r.ot_numero && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <FileText className="h-3 w-3" /> OT {r.ot_numero}
                        </Badge>
                      )}
                      {r.os_numero && (
                        <Badge variant="secondary" className="ml-1 gap-1 text-[10px]">
                          OS {r.os_numero}
                        </Badge>
                      )}
                      {!r.ot_numero && !r.os_numero && <span className="text-xs text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm" title={r.producto_nombre ?? ''}>
                      {r.producto_nombre ?? '—'}
                      {r.producto_codigo && (
                        <div className="font-mono text-[10px] text-slate-400">{r.producto_codigo}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs" title={r.revisor_nombre ?? ''}>
                      {r.revisor_nombre ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.cantidad_revisada.toLocaleString('es-PE')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                      {r.cantidad_ok.toLocaleString('es-PE')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-rose-700">
                      {r.cantidad_falla.toLocaleString('es-PE')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={tasaColor} className="font-mono text-[10px]">
                        {r.tasa_calidad.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="max-w-[140px] truncate text-xs text-slate-600"
                      title={r.responsable_taller_nombre ?? r.responsable_operario_nombre ?? ''}
                    >
                      {r.responsable_taller_nombre ?? r.responsable_operario_nombre ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Paginador
        pagina={p}
        totalPaginas={totalPaginas}
        baseSp={{ ot, os, producto, revisor, desde, hasta }}
      />
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
    for (const [k, v] of Object.entries(baseSp)) {
      if (v) sp2.set(k, v);
    }
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
