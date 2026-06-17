import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Users, ShoppingBag } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarPedidosB2B, listarClientesB2B } from '@/server/actions/b2b';
import { ESTADOS_B2B, type EstadoB2B } from '@/server/actions/b2b-helpers';

export const metadata = { title: 'Pedidos B2B (Mayoristas)' };
export const dynamic = 'force-dynamic';

type SP = {
  estado?: string;
  cliente?: string;
  vendedor?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

export default async function PedidosB2BPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const resClientes = await listarClientesB2B();
  const clientes = resClientes.ok ? (resClientes.data ?? []) : [];

  const tableKey = `${sp.estado ?? ''}|${sp.cliente ?? ''}|${sp.vendedor ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Pedidos B2B (Mayoristas)"
      description="Proformas, pedidos y despachos a clientes mayoristas. Flujo: Borrador → Proforma → Aprobado → Producción → Entregado."
      actions={
        <Link href="/b2b/nuevo">
          <Button variant="premium" size="sm">
            <Plus className="h-4 w-4" /> Nuevo pedido
          </Button>
        </Link>
      }
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
              {ESTADOS_B2B.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-xs font-medium text-slate-500">Cliente</span>
            <select
              name="cliente"
              defaultValue={sp.cliente ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razon_social}
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
            <Link href="/b2b">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={12} cols={7} />}>
        <PedidosTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function PedidosTabla({ estado, cliente, vendedor, desde, hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const estadoVal =
    estado && (ESTADOS_B2B as readonly string[]).includes(estado) ? (estado as EstadoB2B) : '';
  const res = await listarPedidosB2B({
    estado: estadoVal,
    cliente_id: cliente ?? '',
    vendedor_id: vendedor ?? '',
    desde: desde ?? '',
    hasta: hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });
  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar pedidos: {res.error}</p>
      </Card>
    );
  }
  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag className="h-6 w-6" />}
        title="Sin pedidos B2B"
        description="No hay pedidos que coincidan con los filtros."
        action={
          <Link href="/b2b/nuevo">
            <Button variant="premium" size="sm">
              <Plus className="h-4 w-4" /> Crear primer pedido
            </Button>
          </Link>
        }
      />
    );
  }

  const borradores = rows.filter((r) => r.estado === 'BORRADOR').length;
  const enProduccion = rows.filter(
    (r) => r.estado === 'APROBADO' || r.estado === 'EN_PRODUCCION' || r.estado === 'PARCIAL',
  ).length;
  const entregados = rows.filter((r) => r.estado === 'ENTREGADO').length;
  const totalMonto = rows
    .filter((r) => r.estado !== 'CANCELADO' && r.estado !== 'BORRADOR')
    .reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Borradores</p>
          <p className="font-display text-2xl font-semibold text-slate-600">{borradores}</p>
          <p className="text-[10px] text-slate-500">sin proformar</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">En producción</p>
          <p className="font-display text-2xl font-semibold text-amber-700">{enProduccion}</p>
          <p className="text-[10px] text-slate-500">aprobados / parciales</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Entregados</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">{entregados}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Total monto (no cancelados)</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            S/{' '}
            {totalMonto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Líneas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Entrega est.</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const fechaTxt = new Date(r.fecha).toLocaleDateString('es-PE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: '2-digit',
                });
                const entregaTxt = r.fecha_entrega_estimada
                  ? new Date(r.fecha_entrega_estimada).toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                    })
                  : '—';
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/b2b/${r.id}`} className="hover:text-happy-600 hover:underline">
                        {r.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
                    <TableCell className="max-w-[260px] truncate text-sm" title={r.cliente_razon_social}>
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3 w-3 text-slate-400" />
                        {r.cliente_razon_social}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.lineas_count}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      S/{' '}
                      {r.total.toLocaleString('es-PE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">{entregaTxt}</TableCell>
                    <TableCell>
                      <EstadoB2BBadge estado={r.estado} />
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
        baseSp={{ estado, cliente, vendedor, desde, hasta }}
      />
    </div>
  );
}

export function EstadoB2BBadge({ estado }: { estado: EstadoB2B }) {
  // Mapeo a las variantes disponibles en @happy/ui/badge con clases adicionales
  // para diferenciar BORRADOR/PROFORMA/APROBADO/EN_PRODUCCION/PARCIAL.
  if (estado === 'BORRADOR') {
    return (
      <Badge variant="secondary" className="text-[10px]">
        BORRADOR
      </Badge>
    );
  }
  if (estado === 'PROFORMA') {
    return (
      <Badge variant="outline" className="border-blue-300 bg-blue-50 text-[10px] text-blue-700">
        PROFORMA
      </Badge>
    );
  }
  if (estado === 'APROBADO') {
    return (
      <Badge
        variant="outline"
        className="border-indigo-300 bg-indigo-50 text-[10px] text-indigo-700"
      >
        APROBADO
      </Badge>
    );
  }
  if (estado === 'EN_PRODUCCION') {
    return (
      <Badge variant="warning" className="text-[10px]">
        EN PRODUCCIÓN
      </Badge>
    );
  }
  if (estado === 'PARCIAL') {
    return (
      <Badge
        variant="outline"
        className="border-orange-300 bg-orange-50 text-[10px] text-orange-700"
      >
        PARCIAL
      </Badge>
    );
  }
  if (estado === 'ENTREGADO') {
    return (
      <Badge variant="success" className="text-[10px]">
        ENTREGADO
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px]">
      CANCELADO
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
    if (baseSp.estado) sp2.set('estado', baseSp.estado);
    if (baseSp.cliente) sp2.set('cliente', baseSp.cliente);
    if (baseSp.vendedor) sp2.set('vendedor', baseSp.vendedor);
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
