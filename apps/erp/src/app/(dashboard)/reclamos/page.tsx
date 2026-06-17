import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { AlertTriangle, FileText, MessageSquareWarning } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarReclamos } from '@/server/actions/reclamos';
import {
  ESTADOS_RECLAMO,
  TIPOS_RECLAMO,
  tonoEstado,
  tonoTipo,
  PLAZO_ALERTA_DIAS,
  type EstadoReclamo,
  type TipoReclamo,
} from '@/server/actions/reclamos-helpers';

export const metadata = { title: 'Libro de Reclamaciones (INDECOPI)' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  tipo?: string;
  desde?: string;
  hasta?: string;
  q?: string;
  pagina?: string;
};

export default async function ReclamosPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const tableKey = `${sp.estado ?? ''}|${sp.tipo ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.q ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Libro de Reclamaciones (INDECOPI)"
      description="Reclamos y quejas recibidos desde la tienda web — Ley 29571 · Plazo legal de respuesta: 30 días calendario."
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Estado</span>
            <select
              name="estado"
              defaultValue={sp.estado ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {ESTADOS_RECLAMO.map((e) => (
                <option key={e} value={e}>
                  {e.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Tipo</span>
            <select
              name="tipo"
              defaultValue={sp.tipo ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {TIPOS_RECLAMO.map((t) => (
                <option key={t} value={t}>
                  {t}
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Buscar</span>
            <input
              type="text"
              name="q"
              defaultValue={sp.q ?? ''}
              placeholder="Nombre, DNI, N° reclamo"
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="premium" size="sm">
              Filtrar
            </Button>
            <Link href="/reclamos">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={12} cols={7} />}>
        <ReclamosTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function ReclamosTabla({ estado, tipo, desde, hasta, q, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const res = await listarReclamos({
    estado: (estado as EstadoReclamo | undefined) ?? '',
    tipo: (tipo as TipoReclamo | undefined) ?? '',
    desde: desde ?? '',
    hasta: hasta ?? '',
    q: q ?? '',
    pagina: p,
    por_pagina: 50,
  });

  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar reclamos: {res.error}</p>
      </Card>
    );
  }

  const { rows, total, por_pagina, stats } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  return (
    <div className="space-y-3">
      {/* Alerta de atención inmediata */}
      {(stats.nuevos > 0 || stats.vencidos > 0) && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Atención requerida</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {stats.nuevos > 0 && (
                  <li>
                    <strong>{stats.nuevos}</strong> reclamo(s) NUEVO(s) sin revisar
                  </li>
                )}
                {stats.vencidos > 0 && (
                  <li>
                    <strong>{stats.vencidos}</strong> reclamo(s) con más de {PLAZO_ALERTA_DIAS}{' '}
                    días sin responder (riesgo de incumplir el plazo legal de 30 días)
                  </li>
                )}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Nuevos</p>
          <p className="font-display text-2xl font-semibold text-amber-700">{stats.nuevos}</p>
          <p className="text-[10px] text-slate-500">atención inmediata</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">En revisión</p>
          <p className="font-display text-2xl font-semibold text-blue-700">{stats.en_revision}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Resueltos (mes)</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">
            {stats.resueltos_mes}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">
            Vencidos (&gt;{PLAZO_ALERTA_DIAS}d)
          </p>
          <p className="font-display text-2xl font-semibold text-rose-700">{stats.vencidos}</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquareWarning className="h-6 w-6" />}
          title="Sin reclamos"
          description="No hay reclamos que coincidan con los filtros."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Consumidor</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="max-w-[260px]">Descripción</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
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
                  const vencido =
                    (r.estado === 'NUEVO' || r.estado === 'EN_REVISION') &&
                    r.dias_transcurridos > PLAZO_ALERTA_DIAS;
                  return (
                    <TableRow key={r.id} className={vencido ? 'bg-rose-50/60' : undefined}>
                      <TableCell className="font-mono text-xs">
                        <Link
                          href={`/reclamos/${r.id}`}
                          className="hover:text-happy-600 hover:underline"
                        >
                          {r.numero}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-slate-600">
                        {fechaTxt}
                        {vencido && (
                          <div className="mt-0.5 text-[10px] font-semibold text-rose-700">
                            +{r.dias_transcurridos}d
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tonoTipo(r.tipo)} className="text-[10px]">
                          {r.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm" title={r.cliente_nombre}>
                        {r.cliente_nombre}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        <div>{r.cliente_documento_tipo}</div>
                        <div>{r.cliente_documento_numero}</div>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-slate-600" title={r.descripcion}>
                        {r.descripcion}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {r.monto_reclamado != null
                          ? `S/ ${r.monto_reclamado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={tonoEstado(r.estado)} className="text-[10px]">
                          {r.estado.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Paginador
          pagina={p}
          totalPaginas={totalPaginas}
          baseSp={{ estado, tipo, desde, hasta, q }}
        />
      )}

      <p className="flex items-center gap-2 text-[11px] text-slate-500">
        <FileText className="h-3 w-3" /> Mostrando {rows.length} de {total} reclamo(s) registrado(s).
      </p>
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
    if (baseSp.estado) sp2.set('estado', baseSp.estado);
    if (baseSp.tipo) sp2.set('tipo', baseSp.tipo);
    if (baseSp.desde) sp2.set('desde', baseSp.desde);
    if (baseSp.hasta) sp2.set('hasta', baseSp.hasta);
    if (baseSp.q) sp2.set('q', baseSp.q);
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
