import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate } from '@happy/lib';
import { Plus, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Órdenes de Trabajo' };
export const dynamic = 'force-dynamic';

export default async function OtPage() {
  const sb = await createClient();
  const { data } = await sb
    .from('ot')
    .select('id, numero, estado, fecha_apertura, fecha_entrega_objetivo, prioridad, observacion, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const estadoColor = (e: string) =>
    e === 'COMPLETADA' ? 'success' :
    e === 'CANCELADA' ? 'destructive' :
    e === 'BORRADOR' ? 'secondary' : 'default';

  return (
    <PageShell
      title="Órdenes de Trabajo (OT)"
      description="Producción en curso. Cada OT agrupa modelos y tallas a producir."
      actions={<Link href="/ot/nueva"><Button variant="premium"><Plus className="h-4 w-4" /> Nueva OT</Button></Link>}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>N°</TableHead><TableHead>Apertura</TableHead><TableHead>Entrega obj.</TableHead>
              <TableHead>Estado</TableHead><TableHead>Prioridad</TableHead><TableHead>Observación</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin OTs.</TableCell></TableRow>}
              {data?.map((o) => {
                const atrasada = o.fecha_entrega_objetivo && new Date(o.fecha_entrega_objetivo) < new Date() && !['COMPLETADA','CANCELADA'].includes(o.estado);
                return (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs"><Link href={`/ot/${o.id}`} className="hover:text-happy-600">{o.numero}</Link></TableCell>
                    <TableCell className="text-sm">{formatDate(o.fecha_apertura)}</TableCell>
                    <TableCell className="text-sm">
                      {atrasada && <AlertTriangle className="mr-1 inline h-3 w-3 text-red-500" />}
                      {formatDate(o.fecha_entrega_objetivo)}
                    </TableCell>
                    <TableCell><Badge variant={estadoColor(o.estado)}>{o.estado.replace('_',' ')}</Badge></TableCell>
                    <TableCell className="text-sm">{o.prioridad}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-500">{o.observacion}</TableCell>
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
