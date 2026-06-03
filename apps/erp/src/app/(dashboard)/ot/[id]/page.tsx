import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { OtAcciones, OtNotaForm, OtLineaProduccion, AgregarLineaOTForm, EliminarLineaOT } from './client';
import { TiemposCostoTab } from './tiempos-client';
import { EstadoBanner } from './estado-banner';
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
  const [{ data: ot }, { data: lineas }, { data: eventos }, { data: almacenes }, { data: productos }] = await Promise.all([
    sb.from('ot').select('*, plan_maestro(codigo)').eq('id', id).single(),
    sb.from('ot_lineas').select('*, productos(codigo, nombre)').eq('ot_id', id).order('producto_id'),
    sb.from('ot_eventos').select('*').eq('ot_id', id).order('fecha', { ascending: false }).limit(50),
    sb.from('almacenes').select('id, nombre, codigo').eq('tipo', 'PRODUCTO_TERMINADO').eq('activo', true),
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(500),
  ]);
  if (!ot) notFound();
  const puedeEditarLineas = !['COMPLETADA', 'CANCELADA'].includes(ot.estado);

  const totalPlan = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_planificada ?? 0), 0);
  const totalCortado = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_cortada ?? 0), 0);
  const totalTerminado = (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_terminada ?? 0), 0);

  // Si todas las líneas existentes son del mismo producto, pre-seleccionamos
  // ese producto en el formulario "Agregar línea" (caso típico: una OT por
  // producto, varias tallas). Si hay múltiples productos no fijamos default.
  const productosEnLineas = Array.from(new Set((lineas ?? []).map((l) => l.producto_id)));
  const productoIdDefault = productosEnLineas.length === 1 ? productosEnLineas[0] : undefined;

  // Procesos vigentes de TODOS los productos en líneas + registros de tiempo
  // de esta OT (mig 43) + operarios activos para el dropdown.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const [{ data: procesosRaw }, { data: registrosRaw }, { data: operariosRaw }] = await Promise.all([
    productosEnLineas.length > 0
      ? sbAny
          .from('productos_procesos')
          .select('id, producto_id, proceso, talla, orden, tiempo_estandar_min, areas_produccion(id, codigo, nombre, valor_minuto)')
          .in('producto_id', productosEnLineas)
          .eq('activo', true)
          .order('producto_id')
          .order('orden')
      : Promise.resolve({ data: [] }),
    sbAny
      .from('ot_registros_tiempo')
      .select('id, proceso_id, talla, fecha_inicio, fecha_fin, tiempo_total_min, unidades_procesadas, operario_id, notas, created_at, operarios(nombres, apellido_paterno)')
      .eq('ot_id', id)
      .order('created_at', { ascending: false }),
    sbAny
      .from('operarios')
      .select('id, nombres, apellido_paterno, apellido_materno')
      .eq('activo', true)
      .order('nombres'),
  ]);
  const procesos = ((procesosRaw ?? []) as Array<{
    id: string; producto_id: string; proceso: string; talla: string; orden: number; tiempo_estandar_min: number;
    areas_produccion: { id: string; codigo: string; nombre: string; valor_minuto: number | null } | null;
  }>).map((p) => ({
    id: p.id,
    producto_id: p.producto_id,
    proceso: p.proceso,
    talla: p.talla,
    orden: p.orden,
    tiempo_estandar_min: Number(p.tiempo_estandar_min ?? 0),
    area: p.areas_produccion,
  }));
  const registros = ((registrosRaw ?? []) as Array<{
    id: string;
    proceso_id: string;
    talla: string;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    tiempo_total_min: number;
    unidades_procesadas: number | null;
    operario_id: string | null;
    notas: string | null;
    created_at: string;
    operarios: { nombres: string; apellido_paterno: string | null } | null;
  }>).map((r) => ({
    id: r.id,
    proceso_id: r.proceso_id,
    talla: r.talla,
    fecha_inicio: r.fecha_inicio,
    fecha_fin: r.fecha_fin,
    tiempo_total_min: Number(r.tiempo_total_min ?? 0),
    unidades_procesadas: r.unidades_procesadas,
    operario_id: r.operario_id,
    operario_nombre: r.operarios ? [r.operarios.nombres, r.operarios.apellido_paterno].filter(Boolean).join(' ') : null,
    notas: r.notas,
    created_at: r.created_at,
  }));
  const operarios = ((operariosRaw ?? []) as Array<{ id: string; nombres: string; apellido_paterno: string | null; apellido_materno: string | null }>).map((o) => ({
    id: o.id,
    nombre: [o.nombres, o.apellido_paterno, o.apellido_materno].filter(Boolean).join(' '),
  }));
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
      actions={
        <OtAcciones
          otId={id}
          estado={ot.estado}
          almacenes={almacenes ?? []}
          // Áreas únicas presentes en la receta del/los producto(s) de la OT.
          // Sirve para que el cliente filtre los botones de "siguiente estado"
          // y no muestre transiciones a etapas que el producto no requiere
          // (ej. EN_DECORADO si la receta no tiene bordado/estampado/etc.).
          areasReceta={Array.from(new Set((procesos ?? []).map((p) => p.area?.codigo).filter((c): c is string => Boolean(c))))}
        />
      }
    >
      <EstadoBanner estado={ot.estado} />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={<Badge variant={COLOR[ot.estado] ?? 'secondary'}>{ot.estado.replace('_', ' ')}</Badge>} />
        <Stat label="Planificado" value={formatNumber(totalPlan)} />
        <Stat label="Cortado" value={formatNumber(totalCortado)} />
        <Stat
          label={ot.estado === 'COMPLETADA' ? 'Terminado' : 'Terminado (est.)'}
          value={formatNumber(ot.estado === 'COMPLETADA' ? totalTerminado : Math.max(totalCortado - (lineas ?? []).reduce((a, l) => a + Number(l.cantidad_fallas ?? 0), 0), 0))}
        />
      </div>

      <Tabs defaultValue="lineas">
        <TabsList>
          <TabsTrigger value="lineas">Líneas / Producción</TabsTrigger>
          <TabsTrigger value="tiempos">Tiempos &amp; costo MO</TabsTrigger>
          <TabsTrigger value="eventos">Bitácora ({(eventos ?? []).length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lineas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avance por línea</CardTitle>
            </CardHeader>
            <CardContent className={puedeEditarLineas ? 'space-y-4' : 'p-0'}>
              {puedeEditarLineas && (
                <AgregarLineaOTForm otId={id} productos={productos ?? []} productoIdDefault={productoIdDefault} />
              )}
              {(lineas ?? []).length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-400">
                  {puedeEditarLineas
                    ? 'Agrega la primera línea con el formulario de arriba (producto × talla × cantidad).'
                    : 'Esta OT no tiene líneas.'}
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Producto</TableHead><TableHead>Talla</TableHead>
                    <TableHead className="text-right" title="Unidades planificadas a producir">Plan</TableHead>
                    <TableHead className="text-right" title="Unidades cortadas (acumulado)">Cortado</TableHead>
                    <TableHead className="text-right" title="Unidades descartadas durante producción">Fallas</TableHead>
                    <TableHead className="text-right" title="Unidades que terminaron como PT. Durante el proceso muestra estimación (cortado − fallas); se confirma al cerrar la OT.">Terminado</TableHead>
                    <TableHead className="text-right" title="Plan − Cortado">Falta cortar</TableHead>
                    <TableHead className="w-[200px]" title="Registrar avance: unidades cortadas y fallas (acumulado, no incremento)">Declarar</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {lineas?.map((l) => {
                      const p = (l as unknown as { productos?: { codigo: string; nombre: string } }).productos;
                      const plan = Number(l.cantidad_planificada ?? 0);
                      const cortada = Number(l.cantidad_cortada ?? 0);
                      const fallas = Number(l.cantidad_fallas ?? 0);
                      const terminadaReal = Number(l.cantidad_terminada ?? 0);
                      const faltaCortar = Math.max(plan - cortada, 0);
                      // Durante el proceso mostramos estimación (cortado − fallas).
                      // Al cerrar la OT, cantidad_terminada se llena vía close_ot_atomic
                      // y prevalece. Distinguimos visualmente con sufijo "est.".
                      const otCerrada = ot.estado === 'COMPLETADA';
                      const terminadaMostrada = otCerrada ? terminadaReal : Math.max(cortada - fallas, 0);
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
                          <TableCell className="text-right font-mono font-semibold">
                            {terminadaMostrada}
                            {!otCerrada && terminadaMostrada > 0 && (
                              <span className="ml-1 text-[9px] font-normal uppercase text-slate-400" title="Estimado: cortado − fallas. Se confirma al cerrar la OT.">est.</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {faltaCortar === 0 ? (
                              <Badge variant="success" className="text-[10px]">Completo</Badge>
                            ) : (
                              <span className="font-semibold text-amber-700">{faltaCortar}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <OtLineaProduccion
                              otId={id}
                              lineaId={l.id}
                              planificada={Number(l.cantidad_planificada ?? 0)}
                              cortada={Number(l.cantidad_cortada ?? 0)}
                              fallas={Number(l.cantidad_fallas ?? 0)}
                              disabled={!puedeEditarLineas}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <EliminarLineaOT otId={id} lineaId={l.id} disabled={!puedeEditarLineas} />
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

        <TabsContent value="tiempos">
          <TiemposCostoTab
            otId={id}
            procesos={procesos}
            lineas={(lineas ?? []).map((l) => {
              const p = (l as unknown as { productos?: { codigo: string; nombre: string } }).productos;
              return {
                id: l.id,
                producto_id: l.producto_id,
                producto_nombre: p?.nombre ?? l.producto_id,
                producto_codigo: p?.codigo ?? '',
                talla: l.talla,
                cantidad_planificada: Number(l.cantidad_planificada ?? 0),
                cantidad_cortada: Number(l.cantidad_cortada ?? 0),
              };
            })}
            registros={registros}
            operarios={operarios}
            disabled={!puedeEditarLineas}
          />
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
