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
import {
  ESTADO_LABEL, ESTADO_TONO, VISTA_LABEL, DIAS_SIN_PAGO, vistaDePedido,
  type EstadoPedidoWeb, type Tono, type VistaPedidosWeb,
} from '@/server/actions/pedidos-web-helpers';

export const metadata = { title: 'Pedidos web' };
export const dynamic = 'force-dynamic';

type SP = { vista?: string; estado?: string; q?: string; desde?: string; hasta?: string };

const VISTAS: VistaPedidosWeb[] = ['despachar', 'pago', 'sin_concretar', 'entregados', 'cancelados', 'todos'];

/** Qué hace cada vista, dicho para quien la mira. */
const VISTA_AYUDA: Record<VistaPedidosWeb, string> = {
  despachar: 'Pedidos ya pagados: son los únicos que el almacén tiene que preparar y despachar.',
  pago: 'El cliente eligió Yape, Plin, transferencia o WhatsApp. Cuando veas el dinero en la cuenta, abre el pedido y presiona "Confirmar pago"; recién ahí pasa a "Por despachar". Los pagos con tarjeta se confirman solos.',
  sin_concretar: `Intentos de compra que no se pagaron: el cliente hizo otro pedido después, o pasaron más de ${DIAS_SIN_PAGO} días sin pago. No se despachan. Si un cliente sí pagó uno de estos, ábrelo y confirma el pago.`,
  entregados: 'Pedidos ya entregados al cliente.',
  cancelados: 'Pedidos cancelados.',
  todos: 'Todos los pedidos, en cualquier estado.',
};

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
  // ?estado=… sigue funcionando para enlaces viejos; si no, se trabaja por vista.
  const estado = (sp.estado as EstadoPedidoWeb | '') || '';
  const vista: VistaPedidosWeb = VISTAS.includes(sp.vista as VistaPedidosWeb) ? (sp.vista as VistaPedidosWeb) : 'despachar';
  const todas = await listarPedidosWeb({
    estado: estado || undefined,
    q: sp.q,
    desde: sp.desde,
    hasta: sp.hasta,
  });
  const ahora = Date.now();
  const vistaDe = new Map(todas.map((r) => [r.id, vistaDePedido(r, ahora)]));
  const conteos = new Map<VistaPedidosWeb, number>();
  for (const v of vistaDe.values()) conteos.set(v, (conteos.get(v) ?? 0) + 1);
  const rows = estado || vista === 'todos' ? todas : todas.filter((r) => vistaDe.get(r.id) === vista);

  function chip(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.desde) sp2.set('desde', sp.desde);
    if (sp.hasta) sp2.set('hasta', sp.hasta);
    if (sp.vista) sp2.set('vista', sp.vista);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  return (
    <PageShell
      title="Pedidos Web"
      description="Pedidos recibidos por la tienda online. Confirma el pago, prepara y despacha desde aquí."
    >
      {/* Vistas: lo pagado, lo que espera pago y los intentos que no se concretaron */}
      <div className="flex flex-wrap items-center gap-1.5">
        {VISTAS.map((v) => {
          const n = v === 'todos' ? todas.length : (conteos.get(v) ?? 0);
          return (
            <FilterChip key={v} href={chip({ vista: v, estado: undefined })} active={!estado && vista === v}>
              {VISTA_LABEL[v]} ({n})
            </FilterChip>
          );
        })}
        {estado && (
          <FilterChip href={chip({ estado: '' })} active>
            Estado: {ESTADO_LABEL[estado as EstadoPedidoWeb]} ✕
          </FilterChip>
        )}
      </div>
      {!estado && <p className="-mt-2 text-xs text-slate-500">{VISTA_AYUDA[vista]}</p>}

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
        <input type="hidden" name="vista" value={vista} />
        {estado && <input type="hidden" name="estado" value={estado} />}
        <Button type="submit" variant="premium" size="sm">Filtrar</Button>
        <Link href="/pedidos-web">
          <Button type="button" variant="outline" size="sm">Limpiar</Button>
        </Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-6 w-6" />}
          title="Sin pedidos"
          description={estado
            ? `No hay pedidos en estado "${ESTADO_LABEL[estado as EstadoPedidoWeb]}".`
            : vista === 'despachar' ? 'No hay pedidos pagados por despachar.'
            : `No hay pedidos en "${VISTA_LABEL[vista]}".`}
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
                        {new Date(r.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Lima' })}
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
                        {vistaDe.get(r.id) === 'sin_concretar' && (
                          <div className="mt-0.5 text-[10px] text-slate-500">
                            {r.reemplazado_por ? `El cliente hizo otro pedido después: ${r.reemplazado_por}` : `Más de ${DIAS_SIN_PAGO} días sin pago`}
                          </div>
                        )}
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
