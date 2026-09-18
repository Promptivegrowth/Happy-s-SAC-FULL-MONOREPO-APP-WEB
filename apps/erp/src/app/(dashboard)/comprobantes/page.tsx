import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDateTime, formatPEN } from '@happy/lib';
import { ResumenBoletasButton } from './resumen-boletas-button';

export const metadata = { title: 'Comprobantes SUNAT' };
export const dynamic = 'force-dynamic';

const tono = (e: string) =>
  e === 'ACEPTADO' ? 'success' :
  e === 'RECHAZADO' ? 'destructive' :
  e === 'OBSERVADO' ? 'warning' :
  e === 'ANULADO' ? 'secondary' : 'default';

export default async function ComprobantesPage() {
  const sb = await createClient();
  /*
   * Solo los documentos que van a SUNAT.
   *
   * La nota de venta ahora también se guarda en esta tabla —hacía falta para
   * poder buscarla por el número que sale impreso en el ticket— pero no es un
   * comprobante electrónico y no tiene nada que hacer en esta pantalla, que se
   * llama "Comprobantes SUNAT". Las notas se ven en la lista de ventas.
   */
  const { data } = await sb
    .from('comprobantes')
    .select('id, tipo, serie, numero, numero_completo, fecha_emision, total, estado, razon_social_cliente, numero_documento_cliente')
    .in('tipo', ['BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO'])
    .order('fecha_emision', { ascending: false })
    .limit(200);
  return (
    <PageShell title="Comprobantes Electrónicos SUNAT" description="Boletas, Facturas, Notas de Crédito/Débito, Guías." actions={<ResumenBoletasButton />}>
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>N°</TableHead><TableHead>Tipo</TableHead><TableHead>Fecha</TableHead>
            <TableHead>Cliente</TableHead><TableHead className="text-right">Total</TableHead><TableHead>SUNAT</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin comprobantes aún.</TableCell></TableRow>}
            {data?.map((c) => (
              <TableRow key={c.id} className="hover:bg-happy-50/50">
                <TableCell className="font-mono text-xs">
                  <a href={`/comprobantes/${c.id}`} className="hover:text-happy-600">{c.numero_completo}</a>
                </TableCell>
                <TableCell><Badge variant="secondary">{c.tipo}</Badge></TableCell>
                <TableCell className="text-sm">{formatDateTime(c.fecha_emision)}</TableCell>
                <TableCell className="text-sm">
                  <div>{c.razon_social_cliente}</div>
                  <div className="font-mono text-xs text-slate-500">{c.numero_documento_cliente}</div>
                </TableCell>
                <TableCell className="text-right font-medium">{formatPEN(Number(c.total))}</TableCell>
                <TableCell><Badge variant={tono(c.estado)}>{c.estado}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
