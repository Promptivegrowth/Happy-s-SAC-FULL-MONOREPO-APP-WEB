import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ShoppingBag, TrendingUp, Calendar, Receipt } from 'lucide-react';
import { formatPEN, formatDate } from '@happy/lib';
import { obtenerHistorialCliente } from '@/server/actions/clientes';

export async function HistorialClienteSection({ clienteId }: { clienteId: string }) {
  const { rows, metricas } = await obtenerHistorialCliente(clienteId);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <ShoppingBag className="h-3 w-3" /> Compras
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">
            {metricas.total_compras}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <TrendingUp className="h-3 w-3" /> Monto total
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-700">
            {formatPEN(metricas.monto_total)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Receipt className="h-3 w-3" /> Ticket promedio
          </p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">
            {formatPEN(metricas.ticket_promedio)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Calendar className="h-3 w-3" /> Última compra
          </p>
          <p className="mt-1 font-display text-base font-semibold text-corp-900">
            {metricas.ultima_compra ? formatDate(metricas.ultima_compra) : '—'}
          </p>
          {metricas.primera_compra && metricas.ultima_compra !== metricas.primera_compra && (
            <p className="text-[10px] text-slate-500">
              Primera: {formatDate(metricas.primera_compra)}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de compras</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              Este cliente todavía no tiene compras registradas.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Canal · Almacén</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.venta_id} className={r.estado === 'ANULADA' ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">
                      <div>{new Date(r.fecha).toLocaleDateString('es-PE')}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(r.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-corp-900">
                        {r.comprobante?.numero_completo ?? r.numero}
                      </div>
                      {r.comprobante && (
                        <Badge variant="outline" className="text-[9px]">
                          {r.comprobante.tipo}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium text-slate-700">{r.canal}</div>
                      {r.almacen && <div className="text-[10px] text-slate-500">{r.almacen}</div>}
                    </TableCell>
                    <TableCell className="text-xs">{r.vendedor ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.metodos.length === 0 && <span className="text-[10px] text-slate-400">—</span>}
                        {r.metodos.map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px]">{m}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.cantidad_items}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      {formatPEN(r.total)}
                    </TableCell>
                    <TableCell>
                      {r.estado === 'ANULADA' ? (
                        <Badge variant="destructive" className="text-[10px]">Anulada</Badge>
                      ) : r.estado === 'COMPLETADA' ? (
                        <Badge variant="success" className="text-[10px]">Completada</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">{r.estado}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
