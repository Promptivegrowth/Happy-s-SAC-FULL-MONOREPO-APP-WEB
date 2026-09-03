import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { esGerente } from '@/server/actions/_helpers';
import { OtAcciones, OtNotaForm, AgregarLineaOTForm, EliminarLineaOT } from './client';
import { TiemposCostoTab } from './tiempos-client';
import { EstadoBanner } from './estado-banner';
import { OtTimeline } from './ot-timeline';
import { formatDate, formatDateTime, formatNumber , formatTallaChip } from '@happy/lib';
import { Calendar, AlertTriangle, User, ShieldCheck, Scissors, Clock } from 'lucide-react';

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

  // Fechas de cada etapa para la línea de tiempo (del primer evento de cada
  // estado). Alineado a las etapas de OtTimeline.
  const fechaPorEstado: Record<string, string> = {};
  for (const e of (eventos ?? []) as { estado_nuevo: string | null; fecha: string | null }[]) {
    if (e.estado_nuevo && e.fecha) {
      const prev = fechaPorEstado[e.estado_nuevo];
      if (!prev || e.fecha < prev) fechaPorEstado[e.estado_nuevo] = e.fecha;
    }
  }

  // Liquidar corte con cantidades distintas al plan requiere gerencia
  // (pedido del cliente 21/07/2026). El server revalida igual; esto es solo
  // para mostrar el aviso correcto antes de intentar guardar.
  const usuarioEsGerente = await esGerente();

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
  const [{ data: procesosRaw }, { data: registrosRaw }, { data: operariosRaw }, { data: osRaw }] = await Promise.all([
    productosEnLineas.length > 0
      ? sbAny
          .from('productos_procesos')
          .select('id, producto_id, proceso, descripcion_operativa, es_tercerizado, talla, orden, tiempo_estandar_min, areas_produccion(id, codigo, nombre, valor_minuto)')
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
    // Órdenes de servicio de esta OT — para gatear las operaciones que van
    // DESPUÉS de la confección: solo se registran cuando la OS retorna
    // (pedido del cliente 21/07/2026).
    sbAny
      .from('ordenes_servicio')
      .select('estado, proceso')
      .eq('ot_id', id),
  ]);
  const procesos = ((procesosRaw ?? []) as Array<{
    id: string; producto_id: string; proceso: string; descripcion_operativa: string | null;
    es_tercerizado: boolean; talla: string; orden: number; tiempo_estandar_min: number;
    areas_produccion: { id: string; codigo: string; nombre: string; valor_minuto: number | null } | null;
  }>).map((p) => ({
    id: p.id,
    producto_id: p.producto_id,
    proceso: p.proceso,
    // Nombre real del paso — se muestra en vez de la categoría (ver
    // nombreOperacion en tiempos-client).
    descripcion_operativa: p.descripcion_operativa,
    es_tercerizado: p.es_tercerizado,
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

  // Gate de las operaciones POST-CONFECCIÓN (pedido del cliente 21/07/2026):
  // se pueden registrar solo cuando RETORNA la orden de servicio del taller.
  // - ordenConfeccion = orden de la operación de COSTURA (confección); las
  //   operaciones con orden mayor son "post-taller".
  // - osRetornada = hay al menos una OS de la OT recepcionada/cerrada.
  const ordenConfeccion = ((procesos ?? []) as { proceso: string; orden: number }[])
    .filter((p) => p.proceso === 'COSTURA')
    .reduce((max, p) => Math.max(max, Number(p.orden ?? 0)), -1);
  const osArr = (osRaw ?? []) as { estado: string; proceso: string }[];
  // Recepción parcial (campaña) también cuenta como retorno: las unidades que
  // ya volvieron habilitan las operaciones post-confección.
  const osRetornada = osArr.some((o) => ['RECEPCION_PARCIAL', 'RECEPCIONADA', 'CERRADA'].includes(o.estado));
  const hayOs = osArr.length > 0;

  // TIEMPOS DEL ÁREA DE CORTE (pedido del cliente 21/07/2026): se declaran en
  // la ORDEN DE CORTE (liquidación), no en la OT. Acá solo se muestran como
  // resumen informativo y sirven para saber si el área de corte ya está
  // declarada (habilita el avance).
  const { data: cortesRaw } = await sbAny
    .from('ot_corte')
    .select('id, numero, estado')
    .eq('ot_id', id)
    .neq('estado', 'ANULADO');
  const corteIds = ((cortesRaw ?? []) as { id: string }[]).map((c) => c.id);
  const { data: corteTiemposRaw } = corteIds.length > 0
    ? await sbAny
        .from('ot_corte_tiempos')
        .select('tela_nombre, tiempo_tendido_min, tiempo_corte_min, tiempo_habilitado_min, fecha_tendido, fecha_corte, fecha_habilitado')
        .in('corte_id', corteIds)
    : { data: [] as unknown[] };
  const corteTiempos = ((corteTiemposRaw ?? []) as Array<{
    tela_nombre: string | null;
    tiempo_tendido_min: number | string | null;
    tiempo_corte_min: number | string | null;
    tiempo_habilitado_min: number | string | null;
    fecha_tendido: string | null; fecha_corte: string | null; fecha_habilitado: string | null;
  }>).map((t) => ({
    tela_nombre: t.tela_nombre ?? '—',
    tendido: Number(t.tiempo_tendido_min ?? 0),
    corte: Number(t.tiempo_corte_min ?? 0),
    habilitado: Number(t.tiempo_habilitado_min ?? 0),
    fecha_tendido: t.fecha_tendido,
    fecha_corte: t.fecha_corte,
    fecha_habilitado: t.fecha_habilitado,
  }));
  const corteTotalMin = corteTiempos.reduce((s, t) => s + t.tendido + t.corte + t.habilitado, 0);
  const corteDeclarado = corteTotalMin > 0;
  const corteResumen = {
    declarado: corteDeclarado,
    totalMin: corteTotalMin,
    cortes: ((cortesRaw ?? []) as { id: string; numero: string; estado: string }[]).map((c) => ({ id: c.id, numero: c.numero, estado: c.estado })),
    telas: corteTiempos,
  };

  // ÁREA EN CURSO derivada de las declaraciones (pedido del cliente
  // 21/07/2026): la primera área — en orden de proceso — que todavía tiene
  // operaciones sin declarar. A medida que se declaran los tiempos, el
  // indicador avanza solo a la siguiente área. No cambia el `estado` de la OT
  // (ese sigue siendo manual y controla el cierre / ingreso a PT); es un
  // semáforo de avance real. Ignora procesos tercerizados (van por OS).
  const areaEnCurso = (() => {
    if (['COMPLETADA', 'CANCELADA'].includes(ot.estado)) return null;
    const declarado = new Set(registros.map((r) => `${r.proceso_id}::${r.talla}`));
    const lineasCorte = ((lineas ?? []) as Array<{ producto_id: string; talla: string; cantidad_cortada: number | null }>)
      .filter((l) => Number(l.cantidad_cortada ?? 0) > 0);
    if (lineasCorte.length === 0) return null; // aún sin corte declarado
    const info = new Map<string, { nombre: string; minOrden: number; pendientes: number; total: number }>();
    for (const p of procesos) {
      if (p.es_tercerizado) continue;
      const cod = p.area?.codigo;
      if (!cod) continue;
      for (const l of lineasCorte) {
        if (l.producto_id !== p.producto_id) continue;
        const prev = info.get(cod) ?? { nombre: p.area?.nombre ?? cod, minOrden: p.orden, pendientes: 0, total: 0 };
        prev.minOrden = Math.min(prev.minOrden, p.orden);
        prev.total += 1;
        // El área de CORTE se declara en la orden de corte (liquidación), no en
        // los registros de la OT. Se considera declarada si la liquidación tiene
        // tiempos cargados.
        const estaDeclarado = cod === 'CORTE' ? corteDeclarado : declarado.has(`${p.id}::${l.talla}`);
        if (!estaDeclarado) prev.pendientes += 1;
        info.set(cod, prev);
      }
    }
    const ordenadas = [...info.entries()].sort((a, b) => a[1].minOrden - b[1].minOrden);
    const enCurso = ordenadas.find(([, i]) => i.pendientes > 0);
    if (!enCurso) return { completo: true as const };
    const [codigo, i] = enCurso;
    return { completo: false as const, codigo, nombre: i.nombre, pendientes: i.pendientes, total: i.total };
  })();

  // LÍNEA DE TIEMPO DINÁMICA (pedido cliente 2026-09-02): las etapas reflejan la
  // SECUENCIA REAL de áreas de los procesos del/los producto(s) de la OT
  // (productos_procesos.orden + areas_produccion), no una lista genérica fija.
  // El estado de cada etapa se deriva del avance real: corte declarado, registros
  // de tiempo y OS retornadas (procesos tercerizados).
  const etapasTimeline = (() => {
    const declaradoSet = new Set(registros.map((r) => `${r.proceso_id}::${r.talla}`));
    const osRetSet = new Set(
      osArr.filter((o) => ['RECEPCION_PARCIAL', 'RECEPCIONADA', 'CERRADA'].includes(o.estado)).map((o) => o.proceso),
    );
    const lineasCorte = ((lineas ?? []) as Array<{ producto_id: string; talla: string; cantidad_cortada: number | null }>)
      .filter((l) => Number(l.cantidad_cortada ?? 0) > 0);

    // Primera fecha de declaración por proceso (para la fecha del área).
    const fechaRegPorProc = new Map<string, string>();
    for (const r of registros) {
      const f = r.fecha_inicio ?? r.created_at;
      if (!f) continue;
      const prev = fechaRegPorProc.get(r.proceso_id);
      if (!prev || f < prev) fechaRegPorProc.set(r.proceso_id, f);
    }

    type Agg = { codigo: string; nombre: string; minOrden: number; total: number; hechos: number; fecha: string | null };
    const agg = new Map<string, Agg>();
    for (const p of procesos) {
      const cod = p.area?.codigo;
      if (!cod) continue;
      for (const l of lineasCorte) {
        if (l.producto_id !== p.producto_id) continue;
        const cur = agg.get(cod) ?? { codigo: cod, nombre: p.area?.nombre ?? cod, minOrden: p.orden, total: 0, hechos: 0, fecha: null };
        cur.minOrden = Math.min(cur.minOrden, p.orden);
        cur.total += 1;
        const declarado = cod === 'CORTE'
          ? corteDeclarado
          : p.es_tercerizado
            ? osRetSet.has(p.proceso)
            : declaradoSet.has(`${p.id}::${l.talla}`);
        if (declarado) cur.hechos += 1;
        const fproc = cod === 'CORTE' ? (fechaPorEstado['EN_CORTE'] ?? null) : (fechaRegPorProc.get(p.id) ?? null);
        if (fproc && (!cur.fecha || fproc < cur.fecha)) cur.fecha = fproc;
        agg.set(cod, cur);
      }
    }
    const areasOrden = [...agg.values()].sort((a, b) => a.minOrden - b.minOrden);

    const cancelada = ot.estado === 'CANCELADA';
    const completada = ot.estado === 'COMPLETADA';
    const hayCorte = lineasCorte.length > 0;

    const etapas: import('./ot-timeline').EtapaTimeline[] = [];
    etapas.push({
      label: 'Planificación',
      codigo: '__PLAN__',
      estado: hayCorte || areasOrden.some((a) => a.hechos > 0) ? 'done' : 'current',
      fecha: fechaPorEstado['PLANIFICADA'] ?? (ot as { fecha_apertura?: string | null }).fecha_apertura ?? null,
    });
    let currentAssigned = etapas[0]!.estado === 'current';
    for (const a of areasOrden) {
      const done = a.total > 0 && a.hechos >= a.total;
      let estado: 'done' | 'current' | 'pending';
      if (done) estado = 'done';
      else if (!currentAssigned) { estado = 'current'; currentAssigned = true; }
      else estado = 'pending';
      etapas.push({ label: a.nombre, codigo: a.codigo, estado, fecha: a.fecha });
    }
    etapas.push({
      label: 'Enviado a almacén',
      codigo: '__ALM__',
      estado: completada ? 'done' : (!currentAssigned ? 'current' : 'pending'),
      fecha: fechaPorEstado['COMPLETADA'] ?? (ot as { fecha_cierre?: string | null }).fecha_cierre ?? null,
    });
    if (completada) for (const e of etapas) e.estado = 'done';

    return { etapas, cancelada };
  })();

  // BLOQUEO DE AVANCE (pedido del cliente 21/07/2026): no se puede pasar la OT
  // al siguiente proceso si el área del proceso ACTUAL todavía tiene operaciones
  // sin declarar como tiempo ejecutado. El área en curso se deriva de las
  // declaraciones; si coincide con el área del estado actual y hay pendientes,
  // se bloquean los botones de avance (CANCELAR siempre queda disponible).
  const AREA_DE_ESTADO: Record<string, string[]> = {
    EN_CORTE: ['CORTE'],
    EN_HABILITADO: ['CORTE'],
    EN_DECORADO: ['BORDADO', 'ESTAMPADO', 'DECORADO', 'SUBLIMADO', 'PLISADO'],
  };
  const avanceBloqueo = (() => {
    if (!areaEnCurso || areaEnCurso.completo) return null;
    const codigos = AREA_DE_ESTADO[ot.estado];
    if (!codigos || !codigos.includes(areaEnCurso.codigo)) return null;
    return { nombre: areaEnCurso.nombre, pendientes: areaEnCurso.pendientes, total: areaEnCurso.total, esCorte: areaEnCurso.codigo === 'CORTE' };
  })();

  // TIMELINE de la bitácora — se arma de las DECLARACIONES de tiempo (lo que
  // realmente se produjo) + eventos relevantes (creación, notas, autorización
  // de corte, cierre forzado). Se OCULTAN los cambios de estado por botón
  // (ESTADO_CAMBIO): el cliente no los quiere en el resumen (pedido 21/07/2026,
  // "que salga de las declaraciones, no de los botones").
  const nombreOp = new Map(
    procesos.map((p) => [p.id, (p.descripcion_operativa ?? '').trim() || p.proceso.replace(/_/g, ' ')]),
  );
  type TLItem = { id: string; fecha: string; tipo: string; detalle: string };
  const tlDeclaraciones: TLItem[] = registros.map((r) => ({
    id: `reg-${r.id}`,
    // fecha_inicio = fecha real del trabajo; si no hay, cae a cuando se cargó.
    fecha: r.fecha_inicio ?? r.created_at,
    tipo: 'DECLARACION',
    detalle:
      `${nombreOp.get(r.proceso_id) ?? 'Operación'} · Talla ${formatTallaChip(r.talla)} · ` +
      `${Number(r.tiempo_total_min).toFixed(2)} min` +
      `${r.unidades_procesadas ? ` · ${r.unidades_procesadas} und` : ''}` +
      `${r.operario_nombre ? ` · ${r.operario_nombre}` : ''}`,
  }));
  const tlEventos: TLItem[] = ((eventos ?? []) as Array<{ id: number; fecha: string; tipo: string; detalle: string | null }>)
    .filter((e) => e.tipo !== 'ESTADO_CAMBIO')
    .map((e) => ({ id: `evt-${e.id}`, fecha: e.fecha, tipo: e.tipo, detalle: e.detalle ?? '' }));
  const timeline = [...tlDeclaraciones, ...tlEventos].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

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
          usuarioEsGerente={usuarioEsGerente}
          avanceBloqueo={avanceBloqueo}
          tieneCorte={totalCortado > 0 || registros.length > 0}
        />
      }
    >
      <EstadoBanner estado={ot.estado} />

      {/* Línea de tiempo del avance de la OT con FECHAS de cada etapa (de los
          eventos de estado). Planificación → materiales → corte → confección →
          decorado → control de calidad → almacén (pedido cliente 2026-08-27). */}
      <OtTimeline etapas={etapasTimeline.etapas} cancelada={etapasTimeline.cancelada} />

      {/* Semáforo de AVANCE REAL por área (derivado de las declaraciones de
          tiempo). Avanza solo a medida que se declaran las operaciones. */}
      {areaEnCurso && (
        areaEnCurso.completo ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>
              <strong>Avance de producción:</strong> todas las áreas tienen sus operaciones declaradas.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-900">
            <Scissors className="h-4 w-4 shrink-0" />
            <span>
              <strong>Avance de producción:</strong> según lo declarado, la OT está en el área{' '}
              <Badge variant="default" className="bg-sky-600 align-middle">{areaEnCurso.nombre}</Badge>
            </span>
            <span className="text-xs text-sky-700">
              (faltan {areaEnCurso.pendientes} de {areaEnCurso.total} operación(es) de esta área por declarar)
            </span>
          </div>
        )
      )}

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
          <TabsTrigger value="eventos">Bitácora ({timeline.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lineas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Avance por línea</CardTitle>
            </CardHeader>
            <CardContent className={puedeEditarLineas ? 'space-y-4' : 'p-0'}>
              {puedeEditarLineas && (
                <AgregarLineaOTForm otId={id} productos={productos ?? []} productoIdDefault={productoIdDefault} estado={ot.estado} esGerente={usuarioEsGerente} />
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
                          <TableCell><Badge variant="outline">{formatTallaChip(l.talla)}</Badge></TableCell>
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
                          <TableCell className="text-right">
                            {/* No se puede eliminar una talla ya cortada (pedido
                                cliente 2026-08-16): el botón se oculta y el server
                                también lo rechaza. */}
                            <EliminarLineaOT otId={id} lineaId={l.id} disabled={!puedeEditarLineas || cortada > 0} />
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
            ordenConfeccion={ordenConfeccion}
            osRetornada={osRetornada}
            hayOs={hayOs}
            corteResumen={corteResumen}
          />
        </TabsContent>

        <TabsContent value="eventos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Timeline de la OT</CardTitle>
            </CardHeader>
            <CardContent>
              <OtNotaForm otId={id} />
              <p className="mt-3 text-xs text-slate-500">
                Registro de las declaraciones de tiempo y las novedades de la OT (notas, autorizaciones, cierre).
              </p>
              <div className="mt-4 space-y-3">
                {timeline.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-slate-400">
                    Aún no hay declaraciones ni novedades. Registre tiempos en &quot;Tiempos &amp; costo MO&quot;.
                  </div>
                ) : timeline.map((e) => (
                  <div key={e.id} className="flex gap-3 rounded-lg border bg-slate-50 p-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-corp-100 text-corp-700">
                      {e.tipo === 'DECLARACION' ? <Clock className="h-3.5 w-3.5 text-sky-600" /> :
                       e.tipo === 'NOTA' ? <User className="h-3.5 w-3.5" /> :
                       e.tipo === 'ANOMALIA' || e.tipo === 'FALLA' || e.tipo === 'AUTORIZACION_CANTIDAD' || e.tipo === 'CIERRE_FORZADO'
                         ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> :
                       <Calendar className="h-3.5 w-3.5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Badge variant="secondary" className="text-[9px]">
                          {e.tipo === 'DECLARACION' ? 'TIEMPO DECLARADO' : e.tipo.replace(/_/g, ' ')}
                        </Badge>
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
