import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ShoppingCart, Truck, Store, Eye } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { FilterChip } from '@/components/filter-chip';
import { formatPEN } from '@happy/lib';
import { listarPedidosWeb } from '@/server/actions/pedidos-web';
import { ESTADOS_PEDIDO_WEB, ESTADO_LABEL, ESTADO_TONO, type EstadoPedidoWeb, type Tono } from '@/server/actions/pedidos-web-helpers';

export const metadata = { title: 'Pedidos web' };
export const dynamic = 'force-dynamic';

type SP = { estado?: string; q?: string; desde?: string; hasta?: string };

const TONO_CLASES: Record<Tono, string> = {
  amber: 'bg-amber-100 text-amber-800',
  sky: 'bg-sky-100 text-sky-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  violet: 'bg-violet-100 text-violet-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  rose: 'bg-rose-100 text-rose-800',
  slate: 'bg-slate-100 text-slate-700',
};

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const estado = (sp.estado as EstadoPedidoWeb | '') || '';
  const rows = await listarPedidosWeb({
    estado: estado || undefined,
    q: sp.q,
    desde: sp.desde,
    hasta: sp.hasta,
  });

  function chip(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.desde) sp2.set('desde', sp.desde);
    if (sp.hasta) sp2.set('hasta', sp.hasta);
    if (sp.estado) sp2.set('estado', sp.estado);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  // Conteo por estado
  const conteos = new Map<EstadoPedidoWeb, number>();
  for (const r of rows) conteos.set(r.estado, (conteos.get(r.estado) ?? 0) + 1);

  return (
    <PageShell
      title="Pedidos Web"
      description="Pedidos recibidos por la tienda online. Confirmá el pago, prepará y despachá desde acá."
    >
      {/* Filtros por estado */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Estado:</span>
        <FilterChip href={chip({ estado: '' })} active={!estado}>
          Todos ({rows.length})
        </FilterChip>
        {ESTADOS_PEDIDO_WEB.map((e) => {
          const n = conteos.get(e) ?? 0;
          if (n === 0 && estado !== e) return null;
          return (
            <FilterChip key={e} href={chip({ estado: e })} active={estado === e}>
              {ESTADO_LABEL[e]} {n > 0 && `(${n})`}
            </FilterChip>
          );
        })}
      </div>

      {/* Filtro búsqueda + fechas */}
      <form className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="text-xs font-medium text-slate-500">Buscar</label>
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="N° pedido o nombre…"
            className="mt-1 h-9 w-full rounded-md border border-input bg-white px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Desde</label>
          <input
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ''}
            className="mt-1 h-9 rounded-md border border-input bg-white px-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500">Hasta</label>
          <input
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ''}
            className="mt-1 h-9 rounded-md border border-input bg-white px-2 text-sm"
          />
        </div>
        <input type="hidden" name="estado" value={estado} />
        <Button type="submit" variant="premium" size="sm">Filtrar</Button>
        <Link href="/pedidos-web">
          <Button type="button" variant="outline" size="sm">Limpiar</Button>
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-6 w-6" />}
          title="Sin pedidos"
          description={estado ? `No hay pedidos en estado "${ESTADO_LABEL[estado as EstadoPedidoWeb]}".` : 'Todavía no hay pedidos web recibidos.'}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const tono = ESTADO_TONO[r.estado];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-medium">{r.numero}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(r.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-corp-900">{r.cliente_nombre}</div>
                        {r.cliente_doc && <div className="text-[10px] text-slate-500">{r.cliente_doc}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          {r.metodo_entrega === 'DELIVERY'
                            ? <><Truck className="h-3 w-3" /> Delivery</>
                            : <><Store className="h-3 w-3" /> Recojo</>}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px] uppercase text-slate-600">{r.metodo_pago ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.cantidad_items}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{formatPEN(r.total)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${TONO_CLASES[tono]}`}>
                          {ESTADO_LABEL[r.estado]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link href={`/pedidos-web/${r.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 px-2">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
