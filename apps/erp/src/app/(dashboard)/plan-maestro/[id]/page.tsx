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
import { Factory, AlertTriangle, FileWarning, FlaskConical } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Linea = {
  id: string;
  producto_id: string;
  talla: string;
  cantidad_planificada: number;
  prioridad: number | null;
  campana_id: string | null;
  productos: { id: string; codigo: string; nombre: string } | null;
};

type RecetaLineaCheck = {
  producto_id: string;
  talla: string;
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data: plan }, { data: lineasRaw }, { data: productos }, { data: explosion }, { data: ots }] =
    await Promise.all([
      sb.from('plan_maestro').select('*').eq('id', id).single(),
      sb.from('plan_maestro_lineas').select('*, productos(id, codigo, nombre)').eq('plan_id', id),
      sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(500),
      sb.rpc('explosion_materiales_plan', { p_plan: id }),
      sb.from('ot').select('id, numero, estado, fecha_apertura, ot_lineas(cantidad_planificada)').eq('plan_id', id),
    ]);
  if (!plan) notFound();

  const lineas = (lineasRaw ?? []) as unknown as Linea[];

  // Diagnóstico: qué líneas del plan tienen/no tienen receta para su talla.
  let recetasDisponibles: Set<string> = new Set();
  if (lineas.length > 0) {
    const productoIds = Array.from(new Set(lineas.map((l) => l.producto_id)));
    const { data: rl } = await sb
      .from('recetas_lineas')
      .select('talla, recetas!inner(producto_id, activa)')
      .in('recetas.producto_id', productoIds)
      .eq('recetas.activa', true);
    const checks = (rl ?? []) as unknown as Array<{ talla: string; recetas: { producto_id: string } | null }>;
    recetasDisponibles = new Set(
      checks
        .filter((r) => r.recetas)
        .map((r) => `${r.recetas!.producto_id}|${r.talla}`),
    );
  }
  const lineasConReceta = lineas.filter((l) => recetasDisponibles.has(`${l.producto_id}|${l.talla}`));
  const lineasSinReceta = lineas.filter((l) => !recetasDisponibles.has(`${l.producto_id}|${l.talla}`));

  const isEditable = plan.estado === 'BORRADOR';
  const totalUnidades = lineas.reduce((a, l) => a + Number(l.cantidad_planificada ?? 0), 0);
  const codigoCorrupto = (plan.codigo ?? '').endsWith('-null');

  return (
    <PageShell
      title={`Plan ${plan.codigo}`}
      description={`Semana ${plan.semana ?? '-'}/${plan.anio ?? '-'} · ${formatDate(plan.fecha_inicio)} a ${formatDate(plan.fecha_fin)}`}
      actions={<AccionesPlan planId={id} estado={plan.estado ?? 'BORRADOR'} hayLineas={lineas.length > 0} />}
    >
      {codigoCorrupto && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            El código de este plan termina en <code className="font-mono">-null</code> porque se creó antes
            del fix de correlativos (24-abr). Los planes nuevos ya generan el código correcto. Si querés,
            podés borrarlo y crear uno nuevo desde <Link href="/plan-maestro/nuevo" className="underline font-medium">/plan-maestro/nuevo</Link>.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={<Badge variant="default">{(plan.estado ?? 'BORRADOR').replace('_', ' ')}</Badge>} />
        <Stat label="Líneas" value={`${lineas.length}`} />
        <Stat label="Total unidades" value={formatNumber(totalUnidades)} />
        <Stat label="OTs generadas" value={`${(ots ?? []).length}`} />
      </div>

      <Tabs defaultValue="lineas">
        <TabsList>
          <TabsTrigger value="lineas">Líneas</TabsTrigger>
          <TabsTrigger value="explosion">
            Explosión materiales
            {lineasSinReceta.length > 0 && (
              <Badge variant="destructive" className="ml-1.5 text-[9px]">
                {lineasSinReceta.length} sin receta
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ots">OTs ({(ots ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lineas">
          <LineasEditor
            planId={id}
            lineas={lineas as Parameters<typeof LineasEditor>[0]['lineas']}
            productos={(productos ?? []) as { id: string; codigo: string; nombre: string }[]}
            isEditable={isEditable}
          />
        </TabsContent>

        <TabsContent value="explosion">
          <div className="space-y-4">
            {/* Diagnóstico de cobertura BOM */}
            {lineas.length > 0 && (
              <Card className={lineasSinReceta.length > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-emerald-300 bg-emerald-50/40'}>
                <CardContent className="flex items-start gap-3 p-4 text-sm">
                  {lineasSinReceta.length === 0 ? (
                    <>
                      <FlaskConical className="mt-0.5 h-5 w-5 text-emerald-600" />
                      <div>
                        <p className="font-medium text-emerald-900">
                          Cobertura BOM completa: las {lineas.length} líneas del plan tienen receta activa para su talla.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <FileWarning className="mt-0.5 h-5 w-5 text-amber-600" />
                      <div className="flex-1">
                        <p className="font-medium text-amber-900">
                          {lineasSinReceta.length} de {lineas.length} líneas no tienen receta para su talla.
                        </p>
                        <p className="mt-1 text-amber-800">
                          La explosión de materiales solo calcula los productos × tallas que tengan receta activa con líneas para esa talla específica.
                        </p>
                        <ul className="mt-3 space-y-1.5 text-xs">
                          {lineasSinReceta.map((l) => (
                            <li key={l.id} className="flex items-center gap-2">
                              <Badge variant="destructive" className="text-[9px]">Falta</Badge>
                              <span className="font-medium text-amber-900">{l.productos?.nombre ?? '—'}</span>
                              <Badge variant="outline" className="border-amber-300 text-[9px]">Talla {l.talla.replace('T', '')}</Badge>
                              <span className="text-amber-700">·</span>
                              <span className="text-amber-700">{l.cantidad_planificada} unid</span>
                              {l.productos?.id && (
                                <Link
                                  href={`/recetas?producto=${l.productos.id}`}
                                  className="ml-auto text-[11px] font-medium text-amber-900 underline hover:text-amber-700"
                                >
                                  Crear/editar receta →
                                </Link>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Materiales requeridos
                  {lineasConReceta.length > 0 && lineasConReceta.length < lineas.length && (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      (parcial: {lineasConReceta.length}/{lineas.length} líneas)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!explosion || (explosion as unknown[]).length === 0 ? (
                  <div className="px-6 py-10 text-center text-sm text-slate-400">
                    {lineas.length === 0
                      ? 'Agrega líneas al plan primero.'
                      : 'Sin materiales calculados — ningún producto del plan tiene receta activa para su talla.'}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Unidad</TableHead>
                        <TableHead className="text-right">Cantidad total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(explosion as { material_codigo: string; material_nombre: string; categoria: string; unidad: string; cantidad_total: number }[]).map((m, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="font-medium text-sm">{m.material_nombre}</div>
                            <div className="font-mono text-[10px] text-slate-500">{m.material_codigo}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">{m.categoria}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{m.unidad}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{Number(m.cantidad_total).toFixed(4)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
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
                  <TableHeader>
                    <TableRow>
                      <TableHead>OT</TableHead>
                      <TableHead>Apertura</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ots?.map((o) => {
                      const cant = ((o as unknown as { ot_lineas?: { cantidad_planificada: number }[] }).ot_lineas ?? []).reduce(
                        (a, l) => a + Number(l.cantidad_planificada),
                        0,
                      );
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                          <TableCell className="text-sm">{formatDate(o.fecha_apertura)}</TableCell>
                          <TableCell><Badge variant="warning">{o.estado.replace('_', ' ')}</Badge></TableCell>
                          <TableCell className="text-right font-mono">{cant}</TableCell>
                          <TableCell className="text-right">
                            <Link href={`/ot/${o.id}`}>
                              <Button variant="ghost" size="sm">
                                <Factory className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
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
