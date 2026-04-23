import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { OtAcciones, OtNotaForm, OtLineaProduccion } from './client';
import { formatDate, formatDateTime, formatNumber } from '@happy/lib';
import { Calendar, AlertTriangle, User } from 'lucide-react';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'default' | 'destructive'> = {
  BORRADOR: 'secondary',
  PLANIFICADA: 'default',
  EN_CORTE: 'warning',
  EN_HABILITADO: 'warning',
  EN_SERVICIO: 'warning',
  EN_DECORADO: 'warning',
  EN_CONTROL_CALIDAD: 'warning',
  COMPLETADA: 'success',
  CANCELADA: 'destructive',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: ot }, { data: lineas }, { data: eventos }, { data: almacenes }] = await Promise.all([
    sb.from('ot').select('*, plan_maestro(codigo)').eq('id', id).single(),
    sb.from('ot_lineas').select('*, productos(codigo, nombre)').eq('ot_id', id).order('producto_id'),
    sb.from('ot_eventos').select('*').eq('ot_id', id).order('fecha', { ascending: false }).limit(50),
    sb.from('almacenes').select('id, nombre, codigo').eq('tipo', 'PRODUCTO_TERMINADO').eq('activo', true),
  ]);
  if (!ot) notFound();

  const totalPlan = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_planificada ?? 0), 0);
  const totalCortado = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_cortada ?? 0), 0);
  const totalTerminado = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_terminada ?? 0), 0);
  const atrasada = ot.fecha_entrega_objetivo && new Date(ot.fecha_entrega_objetivo) < new Date() && !['COMPLETADA','CANCELADA'].includes(ot.estado);

  const plan = (ot as unknown as { plan_maestro?: { codigo: string } | null }).plan_maestro;

  return (
    <PageShell
      title={`OT ${ot.numero}`}
      description={
        <>
          {plan && <>Plan <Link href={`/plan-maestro/${ot.plan_id}`} className="text-happy-600 hover:underline">{plan.codigo}</Link> · </>}
          Apertura {formatDate(ot.fecha_apertura)}
          {ot.fecha_entrega_objetivo && <> · Entrega {formatDate(ot.fecha_entrega_objetivo)} {atrasada && <Badge variant="destructive" className="ml-1">Atrasada</Badge>}</>}
        </>
      }
      actions={<OtAcciones otId={id} estado={ot.estado} almacenes={almacenes ?? []} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={<Badge variant={COLOR[ot.estado] ?? 'secondary'}>{ot.estado.replace('_', ' ')}</Badge>} />
        <Stat label="Planificado" value={formatNumber(totalPlan)} />
        <Stat label="Cortado" value={formatNumber(totalCortado)} />
        <Stat label="Terminado" value={formatNumber(totalTerminado)} />
      </div>

      <Tabs defaultValue="lineas">
        <TabsList>
          <TabsTrigger value="lineas">Líneas / Producción</TabsTrigger>
          <TabsTrigger value="eventos">Bitácora ({(eventos ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lineas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avance por línea</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(lineas ?? []).length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-400">Sin líneas en esta OT.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Producto</TableHead><TableHead>Talla</TableHead>
                    <TableHead className="text-right">Plan</TableHead>
                    <TableHead className="text-right">Cortado</TableHead>
                    <TableHead className="text-right">Fallas</TableHead>
                    <TableHead className="text-right">Terminado</TableHead>
                    <TableHead className="w-[200px]">Declarar</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {lineas?.map((l) => {
                      const p = (l as unknown as { productos?: { codigo: string; nombre: string } }).productos;
                      return (
                        <TableRow key={l.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{p?.nombre}</div>
                            <div className="font-mono text-[10px] text-slate-500">{p?.codigo}</div>
                          </TableCell>
                          <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{l.cantidad_planificada}</TableCell>
                          <TableCell className="text-right font-mono">{l.cantidad_cortada ?? 0}</TableCell>
                          <TableCell className="text-right font-mono text-danger">{l.cantidad_fallas ?? 0}</TableCell>
                          <TableCell className="text-right font-mono font-semibold">{l.cantidad_terminada ?? 0}</TableCell>
                          <TableCell>
                            <OtLineaProduccion
                              otId={id}
                              lineaId={l.id}
                              cortada={Number(l.cantidad_cortada ?? 0)}
                              fallas={Number(l.cantidad_fallas ?? 0)}
                              disabled={['COMPLETADA','CANCELADA'].includes(ot.estado)}
                            />
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

        <TabsContent value="eventos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline de la OT</CardTitle>
            </CardHeader>
            <CardContent>
              <OtNotaForm otId={id} />
              <div className="mt-6 space-y-3">
                {(eventos ?? []).length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-400">Sin eventos.</div>
                ) : eventos?.map((e) => (
                  <div key={e.id} className="flex gap-3 rounded-lg border bg-slate-50 p-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-corp-100 text-corp-700">
                      {e.tipo === 'NOTA' ? <User className="h-3.5 w-3.5" /> :
                       e.tipo === 'ANOMALIA' || e.tipo === 'FALLA' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> :
                       <Calendar className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Badge variant="secondary" className="text-[9px]">{e.tipo.replace('_', ' ')}</Badge>
                        {e.estado_anterior && e.estado_nuevo && (
                          <span>{e.estado_anterior.replace('_',' ')} → <span className="font-medium text-corp-900">{e.estado_nuevo.replace('_',' ')}</span></span>
                        )}
                        <span className="ml-auto">{formatDateTime(e.fecha)}</span>
                      </div>
                      {e.detalle && <p className="mt-1 text-sm text-slate-700">{e.detalle}</p>}
                    </div>
                  </div>
                ))}
              </div>
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
