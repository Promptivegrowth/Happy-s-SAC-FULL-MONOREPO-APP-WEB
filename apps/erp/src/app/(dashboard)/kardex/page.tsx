import { Suspense } from 'react';
import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowDownCircle, ArrowUpCircle, ArrowRightLeft, History, Warehouse } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { TableSkeleton } from '@/components/skeletons';
import { listarKardex, listarAlmacenes, type KardexMov } from '@/server/actions/kardex';

export const metadata = { title: 'Kardex' };
export const dynamic = 'force-dynamic';

type SP = {
  almacen?: string;
  tipo?: string;
  entidad?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

const TIPOS_MOVIMIENTO = [
  'ENTRADA_COMPRA','ENTRADA_PRODUCCION','ENTRADA_DEVOLUCION_CLIENTE',
  'ENTRADA_DEVOLUCION_TALLER','ENTRADA_TRASLADO','ENTRADA_AJUSTE',
  'SALIDA_VENTA','SALIDA_PRODUCCION','SALIDA_TRASLADO','SALIDA_TALLER_SERVICIO',
  'SALIDA_AJUSTE','SALIDA_MERMA',
] as const;

export default async function KardexPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const resAlms = await listarAlmacenes();
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];

  const tableKey = `${sp.almacen ?? ''}|${sp.tipo ?? ''}|${sp.entidad ?? ''}|${sp.desde ?? ''}|${sp.hasta ?? ''}|${sp.pagina ?? '1'}`;

  return (
    <PageShell
      title="Kardex"
      description="Movimientos de inventario por almacén — entradas, salidas, traslados, ajustes."
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
            <span className="text-xs font-medium text-slate-500">Tipo movimiento</span>
            <select
              name="tipo"
              defaultValue={sp.tipo ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Tipo entidad</span>
            <select
              name="entidad"
              defaultValue={sp.entidad ?? ''}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Variantes y materiales</option>
              <option value="VARIANTE">Solo variantes</option>
              <option value="MATERIAL">Solo materiales</option>
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
            <Link href="/kardex">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={15} cols={8} />}>
        <KardexTabla {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function KardexTabla({ almacen, tipo, entidad, desde, hasta, pagina }: SP) {
  const p = Number(pagina ?? 1) || 1;
  const res = await listarKardex({
    almacen_id: (almacen ?? '') as string,
    tipo: (tipo ?? '') as never,
    entidad: (entidad ?? '') as 'VARIANTE' | 'MATERIAL' | '',
    desde: desde ?? '',
    hasta: hasta ?? '',
    pagina: p,
    por_pagina: 50,
  });
  if (!res.ok) {
    return (
      <Card className="border-danger/40 p-4">
        <p className="text-sm text-danger">Error al cargar kardex: {res.error}</p>
      </Card>
    );
  }
  const { rows, total, por_pagina } = res.data!;
  const totalPaginas = Math.max(1, Math.ceil(total / por_pagina));

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-6 w-6" />}
        title="Sin movimientos"
        description="No hay movimientos de kardex con los filtros seleccionados."
      />
    );
  }

  const entradas = rows.filter((r) => r.tipo.startsWith('ENTRADA_')).length;
  const salidas = rows.filter((r) => r.tipo.startsWith('SALIDA_')).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Movimientos en página</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{rows.length}</p>
          <p className="text-[10px] text-slate-500">de {total} totales</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Entradas</p>
          <p className="flex items-center gap-1 font-display text-2xl font-semibold text-emerald-700">
            <ArrowDownCircle className="h-5 w-5" /> {entradas}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Salidas</p>
          <p className="flex items-center gap-1 font-display text-2xl font-semibold text-rose-700">
            <ArrowUpCircle className="h-5 w-5" /> {salidas}
          </p>
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
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <MovimientoRow key={m.id} m={m} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Paginador
        pagina={p}
        totalPaginas={totalPaginas}
        baseSp={{ almacen, tipo, entidad, desde, hasta }}
      />
    </div>
  );
}

function MovimientoRow({ m }: { m: KardexMov }) {
  const esEntrada = m.tipo.startsWith('ENTRADA_');
  const esSalida = m.tipo.startsWith('SALIDA_');
  const esTraslado = m.tipo === 'ENTRADA_TRASLADO' || m.tipo === 'SALIDA_TRASLADO';

  const fechaTxt = new Date(m.fecha).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  let itemLink: string | null = null;
  let itemLabel = '—';
  if (m.variante) {
    itemLabel = `${m.variante.producto_nombre} · Talla ${m.variante.talla.replace('T', '')}`;
    itemLink = `/kardex/variante/${m.variante.id}`;
  } else if (m.material) {
    itemLabel = m.material.nombre;
    itemLink = `/kardex/material/${m.material.id}`;
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
      <TableCell>
        <Badge
          variant={esEntrada ? 'success' : esSalida ? 'destructive' : 'secondary'}
          className="gap-1 text-[10px]"
        >
          {esEntrada && !esTraslado && <ArrowDownCircle className="h-3 w-3" />}
          {esSalida && !esTraslado && <ArrowUpCircle className="h-3 w-3" />}
          {esTraslado && <ArrowRightLeft className="h-3 w-3" />}
          {m.tipo.replace(/_/g, ' ')}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 text-xs">
          <Warehouse className="h-3 w-3 text-slate-400" />
          {m.almacen?.codigo ?? '—'}
          {m.almacen_contraparte && (
            <>
              <ArrowRightLeft className="h-3 w-3 text-slate-400" />
              <span className="text-slate-500">{m.almacen_contraparte.codigo}</span>
            </>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-[260px] truncate text-sm">
        {itemLink ? (
          <Link href={itemLink} className="hover:text-happy-600 hover:underline" title={itemLabel}>
            {itemLabel}
          </Link>
        ) : (
          <span className="text-slate-400">{itemLabel}</span>
        )}
        {m.variante && (
          <div className="font-mono text-[10px] text-slate-400">{m.variante.sku}</div>
        )}
        {m.material && (
          <div className="font-mono text-[10px] text-slate-400">{m.material.codigo}</div>
        )}
      </TableCell>
      <TableCell
        className={`text-right font-mono text-sm font-semibold ${
          esEntrada ? 'text-emerald-700' : esSalida ? 'text-rose-700' : 'text-slate-700'
        }`}
      >
        {esEntrada ? '+' : esSalida ? '−' : ''}
        {Number(m.cantidad).toLocaleString('es-PE', { maximumFractionDigits: 4 })}
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-slate-500">
        {m.costo_unitario != null ? `S/ ${m.costo_unitario.toFixed(4)}` : '—'}
      </TableCell>
      <TableCell className="text-xs">
        {m.referencia_tipo ? (
          <Badge variant="outline" className="text-[10px]">
            {m.referencia_tipo}
          </Badge>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-xs text-slate-500" title={m.observacion ?? ''}>
        {m.observacion ?? '—'}
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
    if (baseSp.almacen) sp2.set('almacen', baseSp.almacen);
    if (baseSp.tipo) sp2.set('tipo', baseSp.tipo);
    if (baseSp.entidad) sp2.set('entidad', baseSp.entidad);
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
