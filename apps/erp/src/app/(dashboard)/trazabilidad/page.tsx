import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { History, Package, ScanLine, Factory } from 'lucide-react';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { SearchAutocomplete } from '@/components/search-autocomplete';
import { TableSkeleton } from '@/components/skeletons';
import { listarEventosTraza, trazaStats, type EventoTrazaListado } from '@/server/actions/trazabilidad';

export const metadata = { title: 'Trazabilidad' };
export const dynamic = 'force-dynamic';

type SP = {
  tipo?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  pagina?: string;
};

const TIPOS_EVENTO = ['PRODUCCION', 'TRASLADO', 'VENTA', 'DEVOLUCION', 'MERMA'] as const;

export default async function TrazabilidadPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  // Index para autocomplete: lotes recientes + variantes recientes + OTs recientes
  const [lotesData, varsData, otsData, statsRes] = await Promise.all([
    sb.from('lotes_pt')
      .select('id, codigo, cantidad_actual, variante:variante_id(sku, producto:producto_id(nombre))')
      .order('created_at', { ascending: false })
      .limit(100),
    sb.from('productos_variantes')
      .select('id, sku, talla, producto:producto_id(nombre)')
      .eq('activo', true)
      .order('updated_at', { ascending: false })
      .limit(150),
    sb.from('ot')
      .select('id, numero, estado')
      .order('created_at', { ascending: false })
      .limit(80),
    trazaStats(),
  ]);

  type LoteItem = { id: string; codigo: string; cantidad_actual: number; variante: { sku: string; producto: { nombre: string } | null } | null };
  type VarItem = { id: string; sku: string; talla: string; producto: { nombre: string } | null };
  type OtItem = { id: string; numero: string; estado: string };

  const indexItems = [
    ...((lotesData.data ?? []) as unknown as LoteItem[]).map((l) => ({
      id: `lote-${l.id}`,
      label: l.codigo,
      sublabel: `Lote · ${l.variante?.producto?.nombre ?? ''} · stock ${l.cantidad_actual}`,
      href: `/trazabilidad/lote/${encodeURIComponent(l.codigo)}`,
      searchKey: `${l.codigo} ${l.variante?.sku ?? ''}`,
    })),
    ...((varsData.data ?? []) as unknown as VarItem[]).map((v) => ({
      id: `var-${v.id}`,
      label: v.sku,
      sublabel: `SKU · ${v.producto?.nombre ?? ''} · talla ${v.talla.replace('T', '')}`,
      href: `/trazabilidad/variante/${v.id}`,
      searchKey: `${v.sku} ${v.producto?.nombre ?? ''}`,
    })),
    ...((otsData.data ?? []) as unknown as OtItem[]).map((o) => ({
      id: `ot-${o.id}`,
      label: o.numero,
      sublabel: `OT · ${o.estado.replace(/_/g, ' ')}`,
      href: `/trazabilidad/ot/${o.id}`,
      searchKey: o.numero,
    })),
  ];

  const stats = statsRes.ok ? statsRes.data! : { lotes_activos: 0, eventos_hoy: 0, eventos_semana: 0 };
  const tableKey = `${sp.tipo ?? ''}|${sp.fecha_desde ?? ''}|${sp.fecha_hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Trazabilidad"
      description="De fábrica a venta — buscá un lote, SKU o número de OT para ver su historia completa."
    >
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">
          <ScanLine className="mr-1 inline h-3.5 w-3.5" />
          Pegá un código de lote, SKU o número de OT
        </p>
        <SearchAutocomplete
          items={indexItems}
          placeholder="LT-20260101-…  ·  PV482  ·  OT-000234"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Lotes activos</p>
          <p className="flex items-baseline gap-2 font-display text-2xl font-semibold text-corp-900">
            <Package className="h-5 w-5 text-happy-600" /> {stats.lotes_activos}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Eventos hoy</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{stats.eventos_hoy}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Eventos últimos 7 días</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{stats.eventos_semana}</p>
        </Card>
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Tipo</span>
            <select
              name="tipo"
              defaultValue={sp.tipo ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {TIPOS_EVENTO.map((t) => (
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
              name="fecha_desde"
              defaultValue={sp.fecha_desde ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Hasta</span>
            <input
              type="date"
              name="fecha_hasta"
              defaultValue={sp.fecha_hasta ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" variant="premium" size="sm">
              Filtrar
            </Button>
            <Link href="/trazabilidad">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={7} />}>
        <EventosTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function EventosTabla({ tipo, fecha_desde, fecha_hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const res = await listarEventosTraza({
    tipo: tipo ?? '',
    fecha_desde: fecha_desde ?? '',
    fecha_hasta: fecha_hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });
  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar eventos: {res.error}</p>
      </Card>
    );
  }
  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" />}
        title="Sin eventos de trazabilidad"
        description="Cuando se generen lotes, traslados o ventas, los eventos aparecerán acá."
      />
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>SKU / Producto</TableHead>
              <TableHead>Almacenes</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead>OT / Cliente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <EventoRow key={r.id} r={r} />
            ))}
          </TableBody>
        </Table>
      </Card>

      <Paginador pagina={p} totalPaginas={totalPaginas} baseSp={{ tipo, fecha_desde, fecha_hasta }} />
    </div>
  );
}

function EventoRow({ r }: { r: EventoTrazaListado }) {
  const fechaTxt = new Date(r.fecha).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const cli = r.cliente?.razon_social ?? r.cliente?.nombres ?? null;

  return (
    <TableRow>
      <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
      <TableCell>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <Factory className="h-3 w-3" /> {r.tipo}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-[11px]">
        {r.lote ? (
          <Link
            href={`/trazabilidad/lote/${encodeURIComponent(r.lote.codigo)}`}
            className="text-happy-700 hover:underline"
          >
            {r.lote.codigo}
          </Link>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {r.variante ? (
          <Link href={`/trazabilidad/variante/${r.variante.id}`} className="hover:text-happy-600 hover:underline">
            <div className="truncate font-medium">{r.variante.producto_nombre}</div>
            <div className="font-mono text-[10px] text-slate-400">{r.variante.sku}</div>
          </Link>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-slate-600">
        {r.almacen_origen?.codigo ?? '—'}
        {r.almacen_destino && ` → ${r.almacen_destino.codigo}`}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {r.cantidad ?? '—'}
      </TableCell>
      <TableCell className="text-xs">
        {r.ot && (
          <Link href={`/trazabilidad/ot/${r.ot.id}`} className="text-happy-700 hover:underline">
            {r.ot.numero}
          </Link>
        )}
        {cli && <div className="text-[11px] text-slate-500">{cli}</div>}
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
    if (baseSp.tipo) sp2.set('tipo', baseSp.tipo);
    if (baseSp.fecha_desde) sp2.set('fecha_desde', baseSp.fecha_desde);
    if (baseSp.fecha_hasta) sp2.set('fecha_hasta', baseSp.fecha_hasta);
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
