import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, ClipboardList, Eye } from 'lucide-react';
import { formatDate } from '@happy/lib';

export const metadata = { title: 'Plan Maestro' };
export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'default' | 'destructive'> = {
  BORRADOR: 'secondary',
  APROBADO: 'default',
  EN_EJECUCION: 'warning',
  COMPLETADO: 'success',
  CANCELADO: 'destructive',
};

export default async function Page() {
  const sb = await createClient();
  const { data } = await sb.from('plan_maestro')
    .select('id, codigo, semana, anio, fecha_inicio, fecha_fin, estado, plan_maestro_lineas(id)')
    .order('fecha_inicio', { ascending: false }).limit(50);

  return (
    <PageShell
      title="Plan Maestro"
      description="Lista semanal de productos a cortar/confeccionar. Genera explosión de materiales y OTs."
      actions={
        <Link href="/plan-maestro/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo plan</Button></Link>
      }
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Sin planes maestros"
          description="Crea un plan semanal y genera automáticamente las OTs y la explosión de materiales."
          action={<Link href="/plan-maestro/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo plan</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Semana</TableHead>
              <TableHead>Inicio</TableHead><TableHead>Fin</TableHead>
              <TableHead className="text-right">Líneas</TableHead><TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((p) => {
                const ln = (p as unknown as { plan_maestro_lineas?: { id: string }[] }).plan_maestro_lineas ?? [];
                return (
                  <TableRow key={p.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/plan-maestro/${p.id}`} className="hover:text-happy-600">{p.codigo}</Link>
                    </TableCell>
                    <TableCell>S{p.semana ?? '-'}/{p.anio ?? '-'}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.fecha_inicio)}</TableCell>
                    <TableCell className="text-sm">{formatDate(p.fecha_fin)}</TableCell>
                    <TableCell className="text-right font-mono">{ln.length}</TableCell>
                    <TableCell><Badge variant={COLOR[p.estado ?? 'BORRADOR'] ?? 'secondary'}>{(p.estado ?? 'BORRADOR').replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/plan-maestro/${p.id}`}><Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button></Link>
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
