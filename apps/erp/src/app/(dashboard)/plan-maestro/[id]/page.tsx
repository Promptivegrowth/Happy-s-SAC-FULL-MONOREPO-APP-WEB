import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { LineasEditor, AccionesPlan } from './client';
import { formatDate, formatNumber } from '@happy/lib';
import { Factory } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: plan }, { data: lineas }, { data: productos }, { data: explosion }, { data: ots }] = await Promise.all([
    sb.from('plan_maestro').select('*').eq('id', id).single(),
    sb.from('plan_maestro_lineas').select('*, productos(id, codigo, nombre)').eq('plan_id', id),
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(500),
    sb.rpc('explosion_materiales_plan', { p_plan: id }),
    sb.from('ot').select('id, numero, estado, fecha_apertura, ot_lineas(cantidad_planificada)').eq('plan_id', id),
  ]);
  if (!plan) notFound();

  const isEditable = plan.estado === 'BORRADOR';
  const totalUnidades = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_planificada ?? 0), 0);

  return (
    <PageShell
      title={`Plan ${plan.codigo}`}
      description={`Semana ${plan.semana ?? '-'}/${plan.anio ?? '-'} · ${formatDate(plan.fecha_inicio)} a ${formatDate(plan.fecha_fin)}`}
      actions={<AccionesPlan planId={id} estado={plan.estado ?? 'BORRADOR'} hayLineas={(lineas?.length ?? 0) > 0} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={<Badge variant="default">{(plan.estado ?? 'BORRADOR').replace('_', ' ')}</Badge>} />
        <Stat label="Líneas" value={`${(lineas ?? []).length}`} />
        <Stat label="Total unidades" value={formatNumber(totalUnidades)} />
        <Stat label="OTs generadas" value={`${(ots ?? []).length}`} />
      </div>

      <Tabs defaultValue="lineas">
        <TabsList>
          <TabsTrigger value="lineas">Líneas</TabsTrigger>
          <TabsTrigger value="explosion">Explosión materiales</TabsTrigger>
          <TabsTrigger value="ots">OTs ({(ots ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lineas">
          <LineasEditor
            planId={id}
            lineas={(lineas ?? []) as Parameters<typeof LineasEditor>[0]['lineas']}
            productos={(productos ?? []) as { id: string; codigo: string; nombre: string }[]}
            isEditable={isEditable}
          />
        </TabsContent>

        <TabsContent value="explosion">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Materiales requeridos</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(!explosion || (explosion as unknown[]).length === 0) ? (
                <div className="px-6 py-10 text-center text-sm text-slate-400">
                  La explosión depende de que cada producto tenga BOM definido en /recetas.
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Material</TableHead><TableHead>Categoría</TableHead><TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Cantidad total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(explosion as { material_codigo: string; material_nombre: string; categoria: string; unidad: string; cantidad_total: number }[]).map((m, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="font-medium text-sm">{m.material_nombre}</div>
                          <div className="font-mono text-[10px] text-slate-500">{m.material_codigo}</div>
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{m.categoria}</Badge></TableCell>
                        <TableCell className="text-sm">{m.unidad}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{Number(m.cantidad_total).toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ots">
          <Card>
            <CardContent className="p-0">
              {(ots ?? []).length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-400">
                  Aún no se han generado OTs. Cuando apruebes el plan se generará una OT por cada producto.
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>OT</TableHead><TableHead>Apertura</TableHead><TableHead>Estado</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {ots?.map((o) => {
                      const cant = ((o as unknown as { ot_lineas?: { cantidad_planificada: number }[] }).ot_lineas ?? []).reduce((a, l) => a + Number(l.cantidad_planificada), 0);
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                          <TableCell className="text-sm">{formatDate(o.fecha_apertura)}</TableCell>
                          <TableCell><Badge variant="warning">{o.estado.replace('_', ' ')}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{cant}</TableCell>
                          <TableCell className="text-right">
                            <Link href={`/ot/${o.id}`}><Button variant="ghost" size="sm"><Factory className="h-3.5 w-3.5" /></Button></Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 font-display text-2xl font-semibold text-corp-900">{value}</div>
    </Card>
  );
}
