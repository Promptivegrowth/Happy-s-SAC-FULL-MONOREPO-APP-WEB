import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDateTime, formatPEN } from '@happy/lib';

export const metadata = { title: 'Ventas' };
export const dynamic = 'force-dynamic';

export default async function VentasPage() {
  const sb = await createClient();
  const { data } = await sb.from('ventas')
    .select('id, numero, canal, fecha, total, estado, almacenes(nombre), clientes(razon_social, nombres, apellido_paterno)')
    .order('fecha', { ascending: false }).limit(200);

  return (
    <PageShell
      title="Ventas (consolidadas)"
      description="Todas las ventas: POS (tiendas), Web y B2B."
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>N°</TableHead><TableHead>Fecha</TableHead><TableHead>Canal</TableHead>
              <TableHead>Tienda/Almacén</TableHead><TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">Sin ventas registradas.</TableCell></TableRow>}
              {data?.map((v) => {
                const a = (v as unknown as { almacenes?: { nombre: string } }).almacenes;
                const c = (v as unknown as { clientes?: { razon_social?: string; nombres?: string; apellido_paterno?: string } }).clientes;
                const cliente = c?.razon_social ?? (`${c?.nombres ?? ''} ${c?.apellido_paterno ?? ''}`.trim() || '—');
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.numero}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(v.fecha)}</TableCell>
                    <TableCell><Badge variant="secondary">{v.canal}</Badge></TableCell>
                    <TableCell className="text-sm">{a?.nombre}</TableCell>
                    <TableCell className="text-sm">{cliente}</TableCell>
                    <TableCell className="text-right font-medium">{formatPEN(Number(v.total))}</TableCell>
                    <TableCell><Badge variant={v.estado === 'COMPLETADA' ? 'success' : v.estado === 'ANULADA' ? 'destructive' : 'warning'}>{v.estado}</Badge></TableCell>
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
