import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDateTime, formatPEN } from '@happy/lib';

export const metadata = { title: 'Pedidos Web' };
export const dynamic = 'force-dynamic';

const colorEstado = (e: string) =>
  e === 'PENDIENTE_PAGO' ? 'warning' :
  e === 'PAGO_VERIFICADO' ? 'default' :
  e === 'EN_PREPARACION' ? 'secondary' :
  e === 'EN_DELIVERY' ? 'secondary' :
  e === 'ENTREGADO' ? 'success' :
  e === 'CANCELADO' ? 'destructive' :
  e === 'WHATSAPP_DERIVADO' ? 'warning' : 'secondary';

export default async function PedidosWebPage() {
  const sb = await createClient();
  const { data } = await sb.from('pedidos_web')
    .select('id, numero, fecha, estado, metodo_entrega, total, contacto_nombre, contacto_telefono, metodo_pago_seleccionado')
    .order('fecha', { ascending: false }).limit(200);

  return (
    <PageShell
      title="Pedidos Web"
      description="Pedidos generados desde la tienda online disfraceshappys.com"
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>N°</TableHead><TableHead>Fecha</TableHead><TableHead>Cliente</TableHead>
              <TableHead>Entrega</TableHead><TableHead>Pago</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">Sin pedidos web aún.</TableCell></TableRow>}
              {data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.numero}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(p.fecha)}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{p.contacto_nombre}</div>
                    <div className="text-xs text-slate-500">{p.contacto_telefono}</div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{p.metodo_entrega}</Badge></TableCell>
                  <TableCell className="text-xs">{p.metodo_pago_seleccionado ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatPEN(Number(p.total))}</TableCell>
                  <TableCell><Badge variant={colorEstado(p.estado)}>{p.estado.replace('_',' ')}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
