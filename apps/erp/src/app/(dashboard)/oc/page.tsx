import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate, formatPEN } from '@happy/lib';
import { Plus } from 'lucide-react';

export const metadata = { title: 'Órdenes de Compra' };
export const dynamic = 'force-dynamic';

export default async function OcPage() {
  const sb = await createClient();
  const { data } = await sb.from('oc').select('id, numero, tipo, fecha, total, estado, proveedores(razon_social)').order('fecha', { ascending: false }).limit(100);
  return (
    <PageShell
      title="Órdenes de Compra"
      description="Compras a proveedores nacionales y de importación."
      actions={<Link href="/oc/nueva"><Button><Plus className="h-4 w-4" /> Nueva OC</Button></Link>}
    >
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>N°</TableHead><TableHead>Fecha</TableHead><TableHead>Proveedor</TableHead>
            <TableHead>Tipo</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin órdenes de compra.</TableCell></TableRow>}
            {data?.map((o) => {
              const p = (o as unknown as { proveedores?: { razon_social: string } }).proveedores;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                  <TableCell className="text-sm">{formatDate(o.fecha)}</TableCell>
                  <TableCell className="text-sm font-medium">{p?.razon_social}</TableCell>
                  <TableCell><Badge variant="secondary">{o.tipo}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{formatPEN(Number(o.total))}</TableCell>
                  <TableCell><Badge variant={o.estado === 'PAGADA' ? 'success' : o.estado === 'CANCELADA' ? 'destructive' : 'warning'}>{o.estado}</Badge></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
