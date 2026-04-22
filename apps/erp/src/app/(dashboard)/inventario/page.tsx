import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatNumber } from '@happy/lib';

export const metadata = { title: 'Inventario' };
export const dynamic = 'force-dynamic';

export default async function InventarioPage() {
  const sb = await createClient();
  const { data: stocks } = await sb.from('stock_actual')
    .select('id, cantidad, almacenes(nombre, codigo), productos_variantes(sku, talla, productos(nombre))')
    .not('variante_id', 'is', null)
    .gt('cantidad', 0)
    .order('cantidad', { ascending: false })
    .limit(300);

  return (
    <PageShell
      title="Stock actual"
      description="Vista consolidada de inventario por almacén y SKU."
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Almacén</TableHead><TableHead>SKU</TableHead><TableHead>Producto</TableHead>
              <TableHead>Talla</TableHead><TableHead className="text-right">Stock</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(stocks ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">Sin stock registrado.</TableCell></TableRow>}
              {stocks?.map((s) => {
                const a = (s as unknown as { almacenes?: { nombre: string } }).almacenes;
                const v = (s as unknown as { productos_variantes?: { sku: string; talla: string; productos?: { nombre: string } } }).productos_variantes;
                return (
                  <TableRow key={s.id}>
                    <TableCell><Badge variant="secondary">{a?.nombre}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{v?.sku}</TableCell>
                    <TableCell className="font-medium">{v?.productos?.nombre}</TableCell>
                    <TableCell><Badge variant="outline">{v?.talla?.replace('T','')}</Badge></TableCell>
                    <TableCell className="text-right font-semibold">{formatNumber(Number(s.cantidad))}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
