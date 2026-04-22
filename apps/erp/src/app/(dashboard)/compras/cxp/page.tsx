import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate, formatPEN } from '@happy/lib';

export const metadata = { title: 'Cuentas por Pagar' };
export const dynamic = 'force-dynamic';

export default async function CxpPage() {
  const sb = await createClient();
  const { data } = await sb.from('v_cuentas_pagar').select('*').order('fecha_entrega_esperada', { ascending: true });
  return (
    <PageShell title="Cuentas por Pagar" description="Saldos pendientes con proveedores.">
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>OC</TableHead><TableHead>Proveedor</TableHead><TableHead>Fecha</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Pagado</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">Sin saldos pendientes.</TableCell></TableRow>}
            {data?.map((r, i) => (
              <TableRow key={i}>
                <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                <TableCell className="font-medium">{r.proveedor}</TableCell>
                <TableCell className="text-sm">{formatDate(r.fecha)}</TableCell>
                <TableCell className="text-sm">{formatDate(r.fecha_entrega_esperada)}</TableCell>
                <TableCell className="text-right">{formatPEN(Number(r.total))}</TableCell>
                <TableCell className="text-right text-emerald-700">{formatPEN(Number(r.pagado))}</TableCell>
                <TableCell className="text-right font-semibold text-red-600">{formatPEN(Number(r.saldo_pendiente))}</TableCell>
                <TableCell><Badge variant={r.estado === 'PAGADA' ? 'success' : 'warning'}>{r.estado}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
