import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Wrench, Eye } from 'lucide-react';
import { formatDate, formatPEN } from '@happy/lib';

export const metadata = { title: 'Órdenes de Servicio' };
export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'destructive' | 'default'> = {
  EMITIDA: 'default',
  DESPACHADA: 'warning',
  EN_PROCESO: 'warning',
  RECEPCIONADA: 'success',
  CERRADA: 'success',
  ANULADA: 'destructive',
};

export default async function Page() {
  const sb = await createClient();
  const { data } = await sb.from('ordenes_servicio')
    .select('id, numero, proceso, fecha_emision, fecha_entrega_esperada, monto_total, estado, talleres(nombre), ot(numero)')
    .order('fecha_emision', { ascending: false }).limit(100);

  return (
    <PageShell
      title="Órdenes de Servicio"
      description="Trabajo enviado a talleres externos: confección, bordado, estampado, etc."
      actions={<Link href="/servicios/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nueva OS</Button></Link>}
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-6 w-6" />}
          title="Sin órdenes de servicio"
          description="Las OS se generan desde el cierre de un corte o manualmente."
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>N°</TableHead><TableHead>OT</TableHead><TableHead>Taller</TableHead>
              <TableHead>Proceso</TableHead><TableHead>Emisión</TableHead><TableHead>Entrega</TableHead>
              <TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((o) => {
                const t = (o as unknown as { talleres?: { nombre: string } | null }).talleres;
                const ot = (o as unknown as { ot?: { numero: string } | null }).ot;
                return (
                  <TableRow key={o.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/servicios/${o.id}`} className="hover:text-happy-600">{o.numero}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{ot?.numero ?? '—'}</TableCell>
                    <TableCell className="font-medium">{t?.nombre}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{o.proceso}</Badge></TableCell>
                    <TableCell className="text-sm">{formatDate(o.fecha_emision)}</TableCell>
                    <TableCell className="text-sm">{formatDate(o.fecha_entrega_esperada)}</TableCell>
                    <TableCell className="text-right font-medium">{formatPEN(Number(o.monto_total ?? 0))}</TableCell>
                    <TableCell><Badge variant={COLOR[o.estado ?? 'EMITIDA'] ?? 'secondary'}>{(o.estado ?? 'EMITIDA').replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/servicios/${o.id}`}><Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button></Link>
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
