import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate } from '@happy/lib';
import { Plus, AlertTriangle, Eye, Factory } from 'lucide-react';

export const metadata = { title: 'Órdenes de Trabajo' };
export const dynamic = 'force-dynamic';

export default async function OtPage() {
  const sb = await createClient();
  const { data } = await sb
    .from('ot')
    .select(
      'id, numero, estado, fecha_apertura, fecha_entrega_objetivo, prioridad, observacion, created_at, ot_lineas(cantidad_planificada, cantidad_cortada, cantidad_terminada)',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const estadoColor = (e: string) =>
    e === 'COMPLETADA' ? 'success' :
    e === 'CANCELADA' ? 'destructive' :
    e === 'BORRADOR' ? 'secondary' : 'default';

  const ots = (data ?? []) as Array<{
    id: string;
    numero: string;
    estado: string;
    fecha_apertura: string;
    fecha_entrega_objetivo: string | null;
    prioridad: number | null;
    observacion: string | null;
    ot_lineas?: { cantidad_planificada: number; cantidad_cortada: number | null; cantidad_terminada: number | null }[];
  }>;

  return (
    <PageShell
      title="Órdenes de Trabajo (OT)"
      description="Producción en curso. Cada OT agrupa modelos y tallas a producir. Click en 'Ver' para entrar al detalle y declarar avance."
      actions={
        <Link href="/ot/nueva">
          <Button variant="premium">
            <Plus className="h-4 w-4" /> Nueva OT
          </Button>
        </Link>
      }
    >
      {ots.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-6 w-6" />}
          title="Sin órdenes de trabajo"
          description="Las OTs se generan desde un Plan Maestro aprobado o se pueden crear manualmente."
          action={
            <Link href="/ot/nueva">
              <Button variant="premium">
                <Plus className="h-4 w-4" /> Crear primera OT
              </Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Entrega obj.</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead className="text-right">Avance</TableHead>
                  <TableHead>Observación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ots.map((o) => {
                  const atrasada =
                    o.fecha_entrega_objetivo &&
                    new Date(o.fecha_entrega_objetivo) < new Date() &&
                    !['COMPLETADA', 'CANCELADA'].includes(o.estado);
                  const lineas = o.ot_lineas ?? [];
                  const totalPlan = lineas.reduce((a, l) => a + Number(l.cantidad_planificada ?? 0), 0);
                  const totalTerm = lineas.reduce((a, l) => a + Number(l.cantidad_terminada ?? 0), 0);
                  const totalCort = lineas.reduce((a, l) => a + Number(l.cantidad_cortada ?? 0), 0);
                  const progreso = totalPlan > 0
                    ? Math.round((Math.max(totalTerm, totalCort) / totalPlan) * 100)
                    : 0;
                  return (
                    <TableRow key={o.id} className="hover:bg-happy-50/50">
                      <TableCell className="font-mono text-xs">
                        <Link href={`/ot/${o.id}`} className="font-medium text-corp-900 hover:text-happy-600">
                          {o.numero}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(o.fecha_apertura)}</TableCell>
                      <TableCell className="text-sm">
                        {atrasada && (
                          <AlertTriangle className="mr-1 inline h-3 w-3 text-red-500" aria-label="Atrasada" />
                        )}
                        {formatDate(o.fecha_entrega_objetivo)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={estadoColor(o.estado)}>{o.estado.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{o.prioridad ?? 100}</TableCell>
                      <TableCell className="text-right">
                        {totalPlan > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono text-xs text-slate-600">
                              {totalTerm || totalCort}/{totalPlan}
                            </span>
                            <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-slate-200 sm:block">
                              <div
                                className={`h-full transition-all ${progreso >= 100 ? 'bg-emerald-500' : 'bg-happy-500'}`}
                                style={{ width: `${Math.min(progreso, 100)}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">sin líneas</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-slate-500">{o.observacion}</TableCell>
                      <TableCell className="text-right">
                        <Link href={`/ot/${o.id}`}>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Eye className="h-3.5 w-3.5" /> Ver
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
