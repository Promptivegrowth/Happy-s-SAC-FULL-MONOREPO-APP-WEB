import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Scissors, Eye } from 'lucide-react';
import { formatDateTime } from '@happy/lib';

export const metadata = { title: 'Corte' };
export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  ABIERTO: 'warning',
  EN_PROCESO: 'warning',
  COMPLETADO: 'success',
  ANULADO: 'destructive',
};

export default async function Page() {
  const sb = await createClient();
  const { data } = await sb.from('ot_corte')
    .select('id, numero, estado, fecha_inicio, fecha_fin, capas_tendidas, metros_consumidos, ot(numero), productos(codigo, nombre)')
    .order('fecha_inicio', { ascending: false }).limit(100);

  return (
    <PageShell
      title="Órdenes de Corte"
      description="Una orden de corte por modelo. Agrupa todas las tallas trabajadas en simultáneo."
      actions={
        <Link href="/corte/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nueva orden de corte</Button></Link>
      }
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Scissors className="h-6 w-6" />}
          title="Sin órdenes de corte"
          description="Las órdenes de corte se crean por OT y modelo. Agrupan tallas que se trabajan en simultáneo."
          action={<Link href="/corte/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nueva orden de corte</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>N°</TableHead><TableHead>OT</TableHead><TableHead>Modelo</TableHead>
              <TableHead>Inicio</TableHead><TableHead className="text-right">Capas</TableHead>
              <TableHead className="text-right">Metros</TableHead><TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((c) => {
                const ot = (c as unknown as { ot?: { numero: string } | null }).ot;
                const p = (c as unknown as { productos?: { codigo: string; nombre: string } | null }).productos;
                return (
                  <TableRow key={c.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/corte/${c.id}`} className="hover:text-happy-600">{c.numero}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{ot?.numero ?? '—'}</TableCell>
                    <TableCell className="font-medium">{p?.nombre}</TableCell>
                    <TableCell className="text-sm">{formatDateTime(c.fecha_inicio)}</TableCell>
                    <TableCell className="text-right">{c.capas_tendidas ?? 0}</TableCell>
                    <TableCell className="text-right">{Number(c.metros_consumidos ?? 0).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={COLOR[c.estado ?? 'ABIERTO'] ?? 'secondary'}>{(c.estado ?? 'ABIERTO').replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/corte/${c.id}`}><Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button></Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </PageShell>
  );
}
