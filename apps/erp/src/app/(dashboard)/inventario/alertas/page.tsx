import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';

export const metadata = { title: 'Alertas de stock' };
export const dynamic = 'force-dynamic';

export default async function AlertasPage() {
  const sb = await createClient();
  const { data } = await sb.from('v_stock_alertas').select('*').limit(200);
  return (
    <PageShell title="Alertas de Stock Bajo" description="Productos por debajo del stock mínimo en cada almacén.">
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Almacén</TableHead><TableHead>Producto</TableHead><TableHead>SKU</TableHead>
            <TableHead>Talla</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Mínimo</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin alertas — todo el stock está por encima del mínimo.</TableCell></TableRow>}
            {data?.map((r, i) => (
              <TableRow key={i}>
                <TableCell><Badge variant="secondary">{r.almacen}</Badge></TableCell>
                <TableCell className="font-medium">{r.producto}</TableCell>
                <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                <TableCell><Badge variant="outline">{(r.talla as string)?.replace('T','')}</Badge></TableCell>
                <TableCell className="text-right font-semibold text-red-600">{r.cantidad}</TableCell>
                <TableCell className="text-right text-sm">{r.stock_minimo}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
