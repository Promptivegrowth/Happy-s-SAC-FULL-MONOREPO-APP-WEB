'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Plus, Trash2, Clock, X, Scissors, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { crearRegistroTiempoOT, eliminarRegistroTiempoOT } from '@/server/actions/ot';
import { formatTallaChip } from '@happy/lib';

/** Resumen (solo lectura) de la liquidación de tiempos del área de corte, que
 *  se declara en la orden de corte y en la OT solo se muestra informativo. */
type CorteResumen = {
  declarado: boolean;
  totalMin: number;
  cortes: { id: string; numero: string; estado: string }[];
  telas: {
    tela_nombre: string;
    tendido: number;
    corte: number;
    habilitado: number;
    fecha_tendido: string | null;
    fecha_corte: string | null;
    fecha_habilitado: string | null;
  }[];
};

type Proceso = {
  id: string;
  producto_id: string;
  /** Categoría del proceso (enum: CORTE, ACABADO…). Coincide con el área. */
  proceso: string;
  /** Nombre real del paso (ej. "DOBLADO Y EMBOLSADO"). Es lo que se muestra. */
  descripcion_operativa: string | null;
  talla: string | null;
  orden: number;
  tiempo_estandar_min: number;
  area: { id: string; codigo: string; nombre: string; valor_minuto: number | null } | null;
};

/**
 * Nombre a mostrar de una operación. Se prioriza `descripcion_operativa` (el
 * paso concreto que carga el cliente: "LIMPIEZA", "DOBLADO Y EMBOLSADO"…).
 * Antes se mostraba `proceso`, que es la CATEGORÍA y coincide con el nombre
 * del área — por eso las 5 operaciones de acabado salían todas como "ACABADO"
 * (reporte del cliente 21/07/2026).
 */
function nombreOperacion(p: { proceso: string; descripcion_operativa?: string | null }): string {
  const desc = (p.descripcion_operativa ?? '').trim();
  return desc || p.proceso.replace(/_/g, ' ');
}

type Linea = {
  id: string;
  producto_id: string;
  producto_nombre: string;
  producto_codigo: string;
  talla: string;
  cantidad_planificada: number;
  cantidad_cortada: number;
};

type RegistroTiempo = {
  id: string;
  proceso_id: string;
  talla: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  tiempo_total_min: number;
  unidades_procesadas: number | null;
  operario_id: string | null;
  operario_nombre: string | null;
  notas: string | null;
  created_at: string;
};

type Operario = { id: string; nombre: string };

type Props = {
  otId: string;
  procesos: Proceso[];
  lineas: Linea[];
  registros: RegistroTiempo[];
  operarios: Operario[];
  disabled: boolean;
  /** Orden de la operación de confección (COSTURA). Las operaciones con orden
   *  mayor son post-taller y requieren que retorne la OS. -1 si no hay. */
  ordenConfeccion?: number;
  /** ¿Hay al menos una OS de la OT recepcionada/cerrada? */
  osRetornada?: boolean;
  /** ¿Existe alguna OS para esta OT? */
  hayOs?: boolean;
  /** Resumen de la liquidación de tiempos de corte (se declara en la orden de corte). */
  corteResumen?: CorteResumen;
};

const PEN = (n: number) => `S/ ${n.toFixed(2)}`;

export function TiemposCostoTab({ otId, procesos, lineas, registros, operarios, disabled, ordenConfeccion = -1, osRetornada = false, hayOs = false, corteResumen }: Props) {
  // Productos únicos en las líneas de la OT
  const productos = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; codigo: string }>();
    for (const l of lineas) {
      if (!map.has(l.producto_id)) map.set(l.producto_id, { id: l.producto_id, nombre: l.producto_nombre, codigo: l.producto_codigo });
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [lineas]);
  const [productoSel, setProductoSel] = useState(productos[0]?.id ?? '');

  const lineasProducto = useMemo(() => lineas.filter((l) => l.producto_id === productoSel), [lineas, productoSel]);
  const procesosProducto = useMemo(() => procesos.filter((p) => p.producto_id === productoSel), [procesos, productoSel]);

  const tallasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const l of lineasProducto) set.add(l.talla);
    return [...set].sort();
  }, [lineasProducto]);
  const [tallaSel, setTallaSel] = useState('');
  if (tallaSel && !tallasDisponibles.includes(tallaSel)) setTallaSel(tallasDisponibles[0] ?? '');
  if (!tallaSel && tallasDisponibles.length > 0) setTallaSel(tallasDisponibles[0]!);

  const tieneProcesosPorProducto = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of productos) m.set(p.id, false);
    for (const pr of procesos) m.set(pr.producto_id, true);
    return m;
  }, [productos, procesos]);

  if (productos.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-400">
          La OT aún no tiene líneas — agregá líneas para registrar tiempos.
        </CardContent>
      </Card>
    );
  }

  if (procesosProducto.length === 0) {
    const prodInfo = productos.find((p) => p.id === productoSel);
    return (
      <div className="space-y-4">
        {productos.length > 1 && (
          <SelectorProducto productos={productos} productoSel={productoSel} setProductoSel={setProductoSel} tieneProcesosPorProducto={tieneProcesosPorProducto} />
        )}
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            <strong>{prodInfo?.nombre}</strong> no tiene operaciones en su receta. Cargalas desde Recetas (BOM).
          </CardContent>
        </Card>
      </div>
    );
  }

  // Procesos de esta talla (los con talla null aplican a todas)
  const procesosTalla = procesosProducto.filter((p) => p.talla === tallaSel || !p.talla);
  const lineaTalla = lineasProducto.find((l) => l.talla === tallaSel);
  const unidades = Number(lineaTalla?.cantidad_cortada ?? 0);
  const unidadesPlan = Number(lineaTalla?.cantidad_planificada ?? 0);

  // Agrupar procesos por área (área puede repetirse, cada operación es única)
  const procesosPorArea = useMemo(() => {
    const map = new Map<string, Proceso[]>();
    for (const p of procesosTalla) {
      const k = p.area?.codigo ?? 'SIN_AREA';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    for (const list of map.values()) list.sort((a, b) => a.orden - b.orden);
    return map;
  }, [procesosTalla]);

  // Registros filtrados a la talla seleccionada (para la vista "Avance por talla")
  const registrosTalla = useMemo(() => registros.filter((r) => r.talla === tallaSel), [registros, tallaSel]);

  // Totales GLOBALES de la orden (todas las tallas) — para el resumen global.
  const unidadesGlobal = lineasProducto.reduce((s, l) => s + Number(l.cantidad_cortada ?? 0), 0);
  const unidadesPlanGlobal = lineasProducto.reduce((s, l) => s + Number(l.cantidad_planificada ?? 0), 0);
  // Registros de este producto (todas las tallas) para el resumen global.
  const registrosProducto = useMemo(
    () => registros.filter((r) => procesosProducto.some((p) => p.id === r.proceso_id)),
    [registros, procesosProducto],
  );

  // BLOQUEO SECUENCIAL (pedido del cliente 21/07/2026): una operación solo se
  // puede registrar si la ANTERIOR (por orden) ya se completó — es decir,
  // declaró todas las unidades cortadas de la orden. Se calcula sobre el total.
  const bloqueoPorProceso = useMemo(() => {
    const orden = [...procesosProducto].sort((a, b) => a.orden - b.orden);
    const declaradas = new Map<string, number>();
    const tieneRegistro = new Map<string, boolean>();
    for (const r of registrosProducto) {
      declaradas.set(r.proceso_id, (declaradas.get(r.proceso_id) ?? 0) + Number(r.unidades_procesadas ?? 0));
      tieneRegistro.set(r.proceso_id, true);
    }
    // Una operación está "completa" si declaró todas las unidades cortadas.
    // En el ÁREA DE CORTE las unidades son opcionales, así que ahí basta con
    // que tenga al menos un registro (para no bloquear el flujo).
    const completa = (op: Proceso) => {
      if (unidadesGlobal <= 0) return true;
      // El área de corte se liquida en la orden de corte: se considera completa
      // si la liquidación tiene tiempos cargados (no se declara en la OT).
      if (op.area?.codigo === 'CORTE') return corteResumen?.declarado ?? tieneRegistro.get(op.id) === true;
      const dec = declaradas.get(op.id) ?? 0;
      if (dec >= unidadesGlobal) return true;
      return false;
    };
    const map = new Map<string, { bloqueado: boolean; prevNombre: string; prevFaltan: number }>();
    for (let i = 0; i < orden.length; i++) {
      const op = orden[i]!;
      const prev = i > 0 ? orden[i - 1]! : null;
      const bloqueado = prev != null && unidadesGlobal > 0 && !completa(prev);
      const prevFaltan = prev ? Math.max(0, unidadesGlobal - (declaradas.get(prev.id) ?? 0)) : 0;
      map.set(op.id, { bloqueado, prevNombre: prev ? nombreOperacion(prev) : '', prevFaltan });
    }
    return map;
  }, [procesosProducto, registrosProducto, unidadesGlobal, corteResumen?.declarado]);

  return (
    <div className="space-y-4">
      {productos.length > 1 && (
        <SelectorProducto productos={productos} productoSel={productoSel} setProductoSel={setProductoSel} tieneProcesosPorProducto={tieneProcesosPorProducto} />
      )}

      {/* REGISTRO DE AVANCE (entrada de datos) — sin filtro por talla arriba:
          dentro de cada registro se eligen las tallas trabajadas, así que el
          filtro por talla se movió al final como "Avance por talla" (pedido
          del cliente 21/07/2026, el filtro inicial confundía). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Registro de avance · {productos.find((p) => p.id === productoSel)?.nombre}
          </CardTitle>
          <p className="text-xs text-slate-500">
            Por cada operación puede cargar uno o varios registros: fecha/hora inicio + fin (calcula duración) o tiempo total directo. Dentro de cada registro elige las tallas trabajadas.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          {[...procesosPorArea.entries()].map(([areaCodigo, procs]) => {
            const area = procs[0]!.area;
            // El área de CORTE NO se registra en la OT: los tiempos (tendido,
            // corte, habilitado) se declaran en la orden de corte. Acá solo se
            // muestra un resumen informativo de solo lectura (pedido del cliente
            // 21/07/2026).
            if (areaCodigo === 'CORTE') {
              return <CorteAreaInfo key={areaCodigo} procesos={procs} resumen={corteResumen} />;
            }
            return (
              <div key={areaCodigo} className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="default" className="bg-corp-600 text-[10px]">{areaCodigo}</Badge>
                  <span className="text-xs text-slate-500">{area?.nombre ?? areaCodigo}</span>
                  {area?.valor_minuto != null && (
                    <span className="ml-2 font-mono text-[10px] text-slate-400">S/ {Number(area.valor_minuto).toFixed(3)}/min</span>
                  )}
                </div>
                <div className="space-y-2">
                  {procs.map((p) => {
                    // Lista de tallas con cantidad_cortada y unidades ya
                    // registradas para ESTE proceso. Sirve para que el form
                    // muestre el cuadro multi-talla con máximos disponibles.
                    const tallasParaForm = lineasProducto
                      .filter((l) => Number(l.cantidad_cortada) > 0)
                      .map((l) => {
                        const yaReg = registros
                          .filter((r) => r.proceso_id === p.id && r.talla === l.talla)
                          .reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
                        return {
                          talla: l.talla,
                          cortada: Number(l.cantidad_cortada),
                          yaRegistrado: yaReg,
                        };
                      })
                      .sort((a, b) => a.talla.localeCompare(b.talla));
                    // Talla por defecto para prepoblar el form: la primera con
                    // remanente por registrar (o la primera cortada).
                    const tallaDefault =
                      tallasParaForm.find((t) => t.cortada - t.yaRegistrado > 0)?.talla ??
                      tallasParaForm[0]?.talla ??
                      '';
                    return (
                      <OperacionBlock
                        key={p.id}
                        otId={otId}
                        proceso={p}
                        tallaActual={tallaDefault}
                        tallasDisponibles={tallasParaForm}
                        // Todos los registros de la operación (todas las tallas):
                        // el bloque de entrada ya no está filtrado por talla.
                        registros={registros.filter((r) => r.proceso_id === p.id)}
                        operarios={operarios}
                        esAreaCorte={areaCodigo === 'CORTE'}
                        disabled={disabled}
                        bloqueado={bloqueoPorProceso.get(p.id)?.bloqueado ?? false}
                        operacionAnterior={bloqueoPorProceso.get(p.id)?.prevNombre ?? ''}
                        faltanAnterior={bloqueoPorProceso.get(p.id)?.prevFaltan ?? 0}
                        // Post-confección: bloqueado hasta que retorne la OS.
                        esperandoTaller={ordenConfeccion >= 0 && p.orden > ordenConfeccion && !osRetornada}
                        hayOs={hayOs}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* RESUMEN GLOBAL DE LA ORDEN (todas las tallas) — pedido del cliente
          21/07/2026: el resumen principal debe ser del total de la orden. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen de la orden · toda la producción</CardTitle>
          <p className="text-xs text-slate-500">Suma de todas las tallas de este producto.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatsAvance
            procesos={procesosProducto}
            registros={registrosProducto}
            unidades={unidadesGlobal}
            unidadesPlan={unidadesPlanGlobal}
          />
        </CardContent>
        <CardContent className="p-0">
          <ResumenOperacionesTabla
            procesos={procesosProducto}
            registros={registrosProducto}
            unidades={unidadesGlobal}
            corteResumen={corteResumen}
          />
        </CardContent>
      </Card>

      {/* AVANCE POR TALLA (consulta) — debajo del resumen global: el selector
          de talla filtra este bloque para ver el avance de cada operación en
          una talla puntual. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avance por talla</CardTitle>
          <p className="text-xs text-slate-500">Elija una talla para ver el avance y costo de cada operación en esa talla.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selector talla */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Talla:</span>
            {tallasDisponibles.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTallaSel(t)}
                className={`flex h-8 min-w-[2.5rem] items-center justify-center rounded-md border px-2 text-xs font-semibold transition ${
                  tallaSel === t ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'
                }`}
              >
                {formatTallaChip(t)}
              </button>
            ))}
          </div>

          <StatsAvance
            procesos={procesosTalla}
            registros={registrosTalla}
            unidades={unidades}
            unidadesPlan={unidadesPlan}
          />
        </CardContent>
        <CardContent className="p-0">
          <div className="border-t px-4 pt-3 text-xs font-medium text-slate-500">
            Resumen por operación · Talla {formatTallaChip(tallaSel)}
          </div>
          <ResumenOperacionesTabla
            procesos={procesosTalla}
            registros={registrosTalla}
            unidades={unidades}
          />
        </CardContent>
      </Card>

      <div className="rounded-md border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-corp-900">¿Cómo funciona?</p>
        <ul className="ml-4 mt-1 list-disc space-y-0.5">
          <li>Cada operación puede tener <strong>múltiples registros de tiempo</strong> (uno por lote/sesión).</li>
          <li>Puede ingresar <strong>fecha/hora inicio + fin</strong> y el sistema calcula la duración, o ingresar el <strong>tiempo total directo</strong> en minutos.</li>
          <li>El campo <strong>unidades procesadas</strong> es opcional; en CORTE muchas veces se deja vacío (es global por operación).</li>
          <li>El <strong>resumen de la orden</strong> suma todas las tallas; el <strong>avance por talla</strong> permite ver una talla puntual.</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Tarjetas de resumen (unidades, tiempo estándar, tiempo real, costo MO).
 * Recibe el set de procesos + registros + unidades cortadas y calcula todo.
 * Se usa dos veces: global de la orden y por talla.
 */
function StatsAvance({
  procesos, registros, unidades, unidadesPlan,
}: {
  procesos: Proceso[];
  registros: RegistroTiempo[];
  unidades: number;
  unidadesPlan: number;
}) {
  let totalEstandarMin = 0;
  let totalRealMin = 0;
  let totalCostoEstandarUnit = 0;
  let totalCostoRealUnit = 0;
  let opsConRegistro = 0;
  for (const p of procesos) {
    const std = Number(p.tiempo_estandar_min ?? 0);
    const vmin = Number(p.area?.valor_minuto ?? 0);
    const regs = registros.filter((r) => r.proceso_id === p.id);
    const tiempoTotal = regs.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
    const unidadesProcesadasOp = regs.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
    const denominador = unidadesProcesadasOp > 0 ? unidadesProcesadasOp : unidades;
    const tiempoRealUnit = denominador > 0 ? tiempoTotal / denominador : 0;
    if (tiempoRealUnit > 0) opsConRegistro++;
    totalEstandarMin += std;
    totalRealMin += tiempoRealUnit > 0 ? tiempoRealUnit : std;
    totalCostoEstandarUnit += std * vmin;
    totalCostoRealUnit += (tiempoRealUnit > 0 ? tiempoRealUnit : std) * vmin;
  }
  const totalOps = procesos.length;
  const hayRegistros = opsConRegistro > 0;
  const parcial = hayRegistros && opsConRegistro < totalOps;
  const totalCostoEstandar = totalCostoEstandarUnit * unidades;
  const totalCostoReal = totalCostoRealUnit * unidades;
  const variacionPct = totalCostoEstandar > 0 ? ((totalCostoReal - totalCostoEstandar) / totalCostoEstandar) * 100 : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <StatBox label="Unidades cortadas" value={`${unidades} / ${unidadesPlan}`} sub="planificadas" />
      <StatBox label="Tiempo estándar" value={`${totalEstandarMin.toFixed(2)} min`} sub="por unidad" />
      <StatBox
        label="Tiempo real"
        value={hayRegistros ? `${totalRealMin.toFixed(2)} min` : '—'}
        sub={
          hayRegistros
            ? `por unidad${parcial ? ` · parcial (${opsConRegistro} de ${totalOps} operaciones)` : ''}${
                totalRealMin !== totalEstandarMin ? ` · Δ ${(totalRealMin - totalEstandarMin).toFixed(2)}` : ''
              }`
            : 'aún sin operaciones declaradas'
        }
      />
      <StatBox
        label={
          unidades > 0
            ? hayRegistros ? 'Costo MO OT' : 'Costo MO OT (estimado)'
            : 'Costo MO por unidad'
        }
        value={PEN(unidades > 0 ? totalCostoReal : totalCostoRealUnit)}
        sub={
          unidades === 0
            ? totalCostoRealUnit > 0
              ? `× 0 cortadas = S/ 0.00 total · declare avance para ver el total real`
              : 'sin costo configurado'
            : !hayRegistros
              ? `unitario ${PEN(totalCostoRealUnit)} · con tiempos estándar (aún sin registros)`
              : totalCostoEstandar > 0
                ? `unitario ${PEN(totalCostoRealUnit)} · vs estándar ${PEN(totalCostoEstandar)} (${variacionPct > 0 ? '+' : ''}${variacionPct.toFixed(1)}%)${parcial ? ' · parcial' : ''}`
                : `unitario ${PEN(totalCostoRealUnit)}`
        }
        highlight={unidades > 0 && hayRegistros && Math.abs(variacionPct) > 5}
      />
    </div>
  );
}

/** Tabla "Resumen por operación" — reutilizable (global o por talla).
 *  Para las operaciones del área de CORTE, el tiempo se toma de la LIQUIDACIÓN
 *  del corte (no de registros de la OT), sumando por tipo de operación. */
function ResumenOperacionesTabla({
  procesos, registros, unidades, corteResumen,
}: {
  procesos: Proceso[];
  registros: RegistroTiempo[];
  unidades: number;
  corteResumen?: CorteResumen;
}) {
  // Totales de la liquidación de corte por tipo de operación.
  const corteTot = { tendido: 0, corte: 0, habilitado: 0 };
  for (const t of corteResumen?.telas ?? []) {
    corteTot.tendido += t.tendido; corteTot.corte += t.corte; corteTot.habilitado += t.habilitado;
  }
  const corteMinDeOp = (p: Proceso): number | null => {
    if (p.area?.codigo !== 'CORTE') return null;
    const n = nombreOperacion(p).toUpperCase();
    if (n.includes('TENDIDO')) return corteTot.tendido;
    if (n.includes('HABILIT')) return corteTot.habilitado;
    if (n.includes('CORTE')) return corteTot.corte;
    return null;
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px] text-center">#</TableHead>
          <TableHead>Operación</TableHead>
          <TableHead>Área</TableHead>
          <TableHead className="text-right">Estándar (min/u)</TableHead>
          <TableHead className="text-right">Total registrado (min)</TableHead>
          <TableHead>Avance</TableHead>
          <TableHead className="text-right">Real (min/u)</TableHead>
          <TableHead className="text-right">S/ por min</TableHead>
          <TableHead className="text-right">Costo unit. real</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {procesos.map((p) => {
          const std = Number(p.tiempo_estandar_min ?? 0);
          const vmin = Number(p.area?.valor_minuto ?? 0);
          const regs = registros.filter((r) => r.proceso_id === p.id);
          // El tiempo de las operaciones de CORTE viene de la liquidación del corte.
          const corteMin = corteMinDeOp(p);
          const inyectadoCorte = corteMin !== null;
          const totalRegistrado = inyectadoCorte ? (corteMin ?? 0) : regs.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
          const unidadesProcOp = regs.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
          // El corte procesa TODAS las unidades cortadas: si la operación de corte
          // tiene tiempo, su avance es del 100% (pedido del cliente 22/07/2026).
          const unidadesEff = inyectadoCorte && totalRegistrado > 0 ? unidades : unidadesProcOp;
          const denominador = unidadesEff > 0 ? unidadesEff : unidades;
          const realPorUnidad = denominador > 0 ? totalRegistrado / denominador : 0;
          const tiempoUsado = realPorUnidad > 0 ? realPorUnidad : std;
          const hayDato = inyectadoCorte ? totalRegistrado > 0 : regs.length > 0;
          const parcial = unidadesEff > 0 && unidadesEff < unidades;
          const pct = unidades > 0 ? Math.min(100, Math.round((unidadesEff / unidades) * 100)) : 0;
          const completo = unidadesEff >= unidades && unidades > 0;
          return (
            <TableRow key={p.id}>
              <TableCell className="text-center text-xs text-slate-500">{p.orden}</TableCell>
              <TableCell className="text-sm font-medium">{nombreOperacion(p)}</TableCell>
              <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{p.area?.codigo ?? '—'}</Badge></TableCell>
              <TableCell className="text-right font-mono text-xs">{std.toFixed(2)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {hayDato ? totalRegistrado.toFixed(2) : <span className="text-slate-300">—</span>}
              </TableCell>
              <TableCell>
                {unidades === 0 ? (
                  <span className="text-[10px] text-slate-400">sin corte</span>
                ) : unidadesEff === 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] text-slate-400">0 / {unidades}</span>
                    <div className="h-1 w-20 rounded-full bg-slate-100" />
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5" title={`Procesadas: ${unidadesEff} de ${unidades} cortadas`}>
                    <span className={`font-mono text-[10px] ${completo ? 'text-emerald-700' : 'text-corp-900'}`}>
                      {unidadesEff} / {unidades}
                      <span className={`ml-1 font-semibold ${completo ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {pct}%
                      </span>
                    </span>
                    <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${completo ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {realPorUnidad > 0 ? (
                  <span title={parcial ? `Parcial: ${unidadesProcOp} de ${unidades} unidades procesadas` : undefined}>
                    {realPorUnidad.toFixed(2)}
                    {parcial && <span className="ml-1 text-[9px] text-amber-600">·{unidadesProcOp}u</span>}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-slate-500">{vmin > 0 ? PEN(vmin) : <span className="text-slate-400">—</span>}</TableCell>
              <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">{PEN(tiempoUsado * vmin)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function SelectorProducto({
  productos, productoSel, setProductoSel, tieneProcesosPorProducto,
}: {
  productos: { id: string; nombre: string; codigo: string }[];
  productoSel: string;
  setProductoSel: (id: string) => void;
  tieneProcesosPorProducto: Map<string, boolean>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-slate-200 bg-slate-50/50 p-3">
      <span className="text-xs font-medium text-slate-500">Producto:</span>
      {productos.map((p) => {
        const ok = tieneProcesosPorProducto.get(p.id) === true;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => setProductoSel(p.id)}
            title={ok ? 'Tiene operaciones definidas' : 'Sin operaciones — cargar receta'}
            className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              productoSel === p.id ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-happy-300'
            }`}
          >
            <span className={ok ? 'text-emerald-500' : 'text-amber-500'}>{ok ? '●' : '⚠'}</span>
            {p.nombre}
          </button>
        );
      })}
    </div>
  );
}

function StatBox({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={`p-3 ${highlight ? 'border-amber-300 bg-amber-50/50' : ''}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold text-corp-900">{value}</p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </Card>
  );
}

type TallaDisp = { talla: string; cortada: number; yaRegistrado: number };

/**
 * Bloque de SOLO LECTURA del área de corte en la OT. Los tiempos de corte se
 * declaran en la orden de corte (liquidación); acá se muestran como resumen
 * informativo con un enlace a la orden de corte para editarlos (pedido del
 * cliente 21/07/2026).
 */
function CorteAreaInfo({ procesos, resumen }: { procesos: Proceso[]; resumen?: CorteResumen }) {
  const fmt = (v: string | null) =>
    v ? new Date(`${v}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
  const telasConTiempo = (resumen?.telas ?? []).filter((t) => t.tendido + t.corte + t.habilitado > 0);
  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="default" className="bg-sky-600 text-[10px]">CORTE</Badge>
        <span className="flex items-center gap-1 text-xs font-medium text-sky-800">
          <Scissors className="h-3.5 w-3.5" /> Los tiempos de corte se declaran en la orden de corte (liquidación)
        </span>
        {resumen?.cortes.map((c) => (
          <Link
            key={c.id}
            href={`/corte/${c.id}`}
            className="inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100"
          >
            {c.numero} <ExternalLink className="h-2.5 w-2.5" />
          </Link>
        ))}
      </div>

      {/* Operaciones de corte (solo referencia, sin registro acá) */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {procesos.map((p) => (
          <span key={p.id} className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600">
            #{p.orden} {nombreOperacion(p)}
          </span>
        ))}
      </div>

      {telasConTiempo.length === 0 ? (
        <p className="text-[11px] text-amber-700">
          Aún no se declararon tiempos de corte. Regístrelos en la liquidación de la orden de corte.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-sky-200 text-left text-[10px] uppercase tracking-wide text-sky-700">
                <th className="py-1">Tela</th>
                <th className="py-1 text-right">Tendido</th>
                <th className="py-1 text-right">Corte</th>
                <th className="py-1 text-right">Habilitado</th>
                <th className="py-1 text-right">Fechas (T/C/H)</th>
              </tr>
            </thead>
            <tbody>
              {telasConTiempo.map((t, i) => (
                <tr key={i} className="border-b border-sky-100 last:border-0">
                  <td className="py-1 font-medium text-slate-700">{t.tela_nombre}</td>
                  <td className="py-1 text-right font-mono">{t.tendido.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono">{t.corte.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono">{t.habilitado.toFixed(2)}</td>
                  <td className="py-1 text-right font-mono text-[10px] text-slate-500">
                    {fmt(t.fecha_tendido)} · {fmt(t.fecha_corte)} · {fmt(t.fecha_habilitado)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold text-sky-800">
                <td className="py-1">Total</td>
                <td className="py-1 text-right font-mono">{telasConTiempo.reduce((s, t) => s + t.tendido, 0).toFixed(2)}</td>
                <td className="py-1 text-right font-mono">{telasConTiempo.reduce((s, t) => s + t.corte, 0).toFixed(2)}</td>
                <td className="py-1 text-right font-mono">{telasConTiempo.reduce((s, t) => s + t.habilitado, 0).toFixed(2)}</td>
                <td className="py-1 text-right font-mono">{(resumen?.totalMin ?? 0).toFixed(2)} min</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OperacionBlock({
  otId, proceso, tallaActual, tallasDisponibles, registros, operarios, esAreaCorte, disabled,
  bloqueado = false, operacionAnterior = '', faltanAnterior = 0,
  esperandoTaller = false, hayOs = false,
}: {
  otId: string;
  proceso: Proceso;
  tallaActual: string;
  tallasDisponibles: TallaDisp[];
  registros: RegistroTiempo[];
  operarios: Operario[];
  esAreaCorte: boolean;
  disabled: boolean;
  /** No se puede registrar hasta que la operación anterior esté completa (aviso). */
  bloqueado?: boolean;
  operacionAnterior?: string;
  faltanAnterior?: number;
  /** Operación post-confección: bloqueada (duro) hasta que retorne la OS. */
  esperandoTaller?: boolean;
  hayOs?: boolean;
}) {
  const [openForm, setOpenForm] = useState(false);
  const totalMin = registros.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
  const totalUnid = registros.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
  // Operación COMPLETA: todas las tallas cortadas ya tienen todas sus unidades
  // registradas (pedido del cliente 22/07/2026: no mostrar "Registrar" si ya se
  // registró todo). No aplica al área de corte (las unidades son opcionales).
  const tallasConCorte = tallasDisponibles.filter((t) => t.cortada > 0);
  const completo = !esAreaCorte && tallasConCorte.length > 0 && tallasConCorte.every((t) => t.yaRegistrado >= t.cortada);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-corp-900">
            <span className="mr-2 text-[10px] text-slate-400">#{proceso.orden}</span>
            {nombreOperacion(proceso)}
          </p>
          <p className="text-[10px] text-slate-500">
            Estándar: {Number(proceso.tiempo_estandar_min ?? 0).toFixed(2)} min/u ·{' '}
            {registros.length === 0 ? (
              <span className="italic">sin registros</span>
            ) : (
              <span>
                {registros.length} registro{registros.length === 1 ? '' : 's'} · total {totalMin.toFixed(2)} min
                {totalUnid > 0 && ` · ${totalUnid} unid`}
              </span>
            )}
          </p>
          {/* Aviso informativo (NO bloquea): el equipo puede trabajar
              operaciones en paralelo (aclaración del cliente 21/07/2026). */}
          {bloqueado && !esperandoTaller && (
            <p className="mt-0.5 text-[10px] text-amber-600">
              ⚠ La operación anterior (<strong>{operacionAnterior}</strong>) aún no está completa
              {faltanAnterior > 0 ? ` (faltan ${faltanAnterior} unid.)` : ''} — puede registrar igual si trabajan en paralelo.
            </p>
          )}
          {/* Bloqueo DURO: operación posterior a la confección — no se puede
              registrar hasta que retorne la orden de servicio del taller. */}
          {esperandoTaller && (
            <p className="mt-0.5 text-[10px] font-medium text-sky-700">
              🔒 {hayOs
                ? 'Disponible cuando la orden de servicio del taller se marque RECEPCIONADA (retorno).'
                : 'Va después de la confección — primero envíe la orden de servicio al taller y regístrela como recepcionada al retornar.'}
            </p>
          )}
        </div>
        {!disabled && !esperandoTaller && (
          completo && !openForm ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700" title="Todas las unidades cortadas ya fueron registradas">
              ✓ Completo
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setOpenForm((o) => !o)} className="h-7 gap-1 px-2 text-xs">
              {openForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {openForm ? 'Cerrar' : 'Registrar'}
            </Button>
          )
        )}
      </div>

      {openForm && (
        <FormRegistro
          otId={otId}
          procesoId={proceso.id}
          tallaActual={tallaActual}
          tallasDisponibles={tallasDisponibles}
          operarios={operarios}
          esAreaCorte={esAreaCorte}
          onSaved={() => setOpenForm(false)}
        />
      )}

      {registros.length > 0 && (
        <div className="mt-2 space-y-1">
          {registros.map((r) => (
            <RegistroRow key={r.id} otId={otId} registro={r} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  );
}

function FormRegistro({
  otId, procesoId, tallaActual, tallasDisponibles, operarios, esAreaCorte, onSaved,
}: {
  otId: string;
  procesoId: string;
  tallaActual: string;
  tallasDisponibles: TallaDisp[];
  operarios: Operario[];
  esAreaCorte: boolean;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [modo, setModo] = useState<'intervalo' | 'directo'>('intervalo');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [tiempoDirecto, setTiempoDirecto] = useState('');
  // Fecha en que se REALIZÓ el trabajo (modo directo). Arranca en hoy, pero
  // se puede cambiar para cargar producción de días anteriores — antes el
  // registro quedaba con la fecha de digitación (pedido del cliente 21/07/2026).
  const [fechaDirecta, setFechaDirecta] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  // Mediodía para que la fecha no se corra un día por diferencia horaria.
  const fechaTrabajoISO = fechaDirecta ? `${fechaDirecta}T12:00:00` : '';
  // Cantidades por talla (string para input controlado). Default: la talla
  // actualmente seleccionada arriba se prepopula con su remanente disponible
  // (cortada - ya registrado para este proceso). Las demás arrancan vacías.
  const [cantPorTalla, setCantPorTalla] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const t of tallasDisponibles) {
      if (t.talla === tallaActual) {
        const rem = Math.max(0, t.cortada - t.yaRegistrado);
        init[t.talla] = rem > 0 ? String(rem) : '';
      } else {
        init[t.talla] = '';
      }
    }
    return init;
  });
  const [operarioId, setOperarioId] = useState('');
  const [notas, setNotas] = useState('');

  function setCant(talla: string, valor: string) {
    setCantPorTalla((prev) => ({ ...prev, [talla]: valor }));
  }
  function marcarTodasTallas() {
    const next: Record<string, string> = {};
    for (const t of tallasDisponibles) {
      const rem = Math.max(0, t.cortada - t.yaRegistrado);
      next[t.talla] = rem > 0 ? String(rem) : '';
    }
    setCantPorTalla(next);
  }
  function limpiarTallas() {
    const next: Record<string, string> = {};
    for (const t of tallasDisponibles) next[t.talla] = '';
    setCantPorTalla(next);
  }

  // Tallas con cantidad > 0 son las que se van a registrar
  const tallasAEnviar = tallasDisponibles
    .map((t) => ({ ...t, cantidad: Number(cantPorTalla[t.talla] ?? 0) }))
    .filter((t) => t.cantidad > 0);

  function submit() {
    if (esAreaCorte && tallasAEnviar.length === 0) {
      // En CORTE las unidades son opcionales: si no marcaron nada, registramos
      // solo en la talla actual sin unidades.
      registrarSinUnidades();
      return;
    }
    if (tallasAEnviar.length === 0) {
      toast.error('Marcá al menos una talla con cantidad procesada > 0');
      return;
    }
    // Validar máximos en cliente (el server también valida)
    for (const t of tallasAEnviar) {
      const rem = t.cortada - t.yaRegistrado;
      if (t.cantidad > rem) {
        toast.error(
          `Talla ${formatTallaChip(t.talla)}: máximo ${Math.max(0, rem)} ` +
          `(se cortaron ${t.cortada}, ya registradas ${t.yaRegistrado})`,
        );
        return;
      }
    }

    // TIEMPO TOTAL de la operación (una sola vez, no por talla). El cliente
    // reportó (21/07/2026) que al poner 50 min y marcar varias tallas, el
    // sistema lo tomaba como 50 min POR talla. Ahora los 50 min son el TOTAL
    // y se REPARTEN entre las tallas en proporción a sus unidades.
    let totalMin: number;
    if (modo === 'directo') {
      totalMin = Number(tiempoDirecto);
      if (!(totalMin > 0)) return toast.error('Ingrese el tiempo total (minutos)');
    } else {
      if (!fechaInicio || !fechaFin) return toast.error('Ingrese fecha/hora de inicio y fin');
      const ti = new Date(fechaInicio).getTime();
      const tf = new Date(fechaFin).getTime();
      if (Number.isNaN(ti) || Number.isNaN(tf)) return toast.error('Fechas inválidas');
      if (tf < ti) return toast.error('La fecha de fin no puede ser anterior al inicio');
      totalMin = Math.round(((tf - ti) / 60000) * 100) / 100;
      if (!(totalMin > 0)) return toast.error('El intervalo debe ser mayor a 0 minutos');
    }
    // Fecha de trabajo: en directo la elegida; en intervalo, el día del inicio.
    const fechaTrabajoEnvio =
      modo === 'directo' ? fechaTrabajoISO : (fechaInicio ? `${fechaInicio.slice(0, 10)}T12:00:00` : '');

    // Reparto proporcional a las unidades; el último toma el remanente para
    // que la suma sea exactamente el total (sin arrastre de redondeo).
    const totalUnidades = tallasAEnviar.reduce((s, t) => s + t.cantidad, 0);
    let acumulado = 0;
    const conTiempo = tallasAEnviar.map((t, i) => {
      let min: number;
      if (i === tallasAEnviar.length - 1) {
        min = Math.round((totalMin - acumulado) * 100) / 100;
      } else {
        min = Math.round((totalMin * (t.cantidad / (totalUnidades || 1))) * 100) / 100;
        acumulado += min;
      }
      return { ...t, min: Math.max(0, min) };
    });

    start(async () => {
      let okCount = 0;
      let errMsg = '';
      for (const t of conTiempo) {
        const r = await crearRegistroTiempoOT(otId, {
          proceso_id: procesoId,
          talla: t.talla,
          fecha_inicio: '',
          fecha_fin: '',
          // Cada talla lleva SU parte del tiempo total.
          tiempo_total_min: t.min,
          fecha_trabajo: fechaTrabajoEnvio,
          unidades_procesadas: t.cantidad,
          operario_id: operarioId || '',
          notas: notas || null,
        });
        if (r.ok) okCount++;
        else { errMsg = r.error ?? 'Error'; break; }
      }
      if (okCount === conTiempo.length) {
        toast.success(
          okCount === 1
            ? 'Registro guardado'
            : `${okCount} tallas · ${totalMin.toFixed(2)} min repartidos entre ellas`,
        );
        onSaved();
      } else {
        toast.error(`${errMsg} · Se guardaron ${okCount}/${conTiempo.length} antes del error`);
      }
    });
  }

  function registrarSinUnidades() {
    start(async () => {
      const r = await crearRegistroTiempoOT(otId, {
        proceso_id: procesoId,
        talla: tallaActual,
        fecha_inicio: modo === 'intervalo' ? fechaInicio : '',
        fecha_fin: modo === 'intervalo' ? fechaFin : '',
        tiempo_total_min: modo === 'directo' && tiempoDirecto ? Number(tiempoDirecto) : undefined,
        fecha_trabajo: modo === 'directo' ? fechaTrabajoISO : '',
        unidades_procesadas: null,
        operario_id: operarioId || '',
        notas: notas || null,
      });
      if (r.ok) { toast.success('Registro guardado'); onSaved(); }
      else toast.error(r.error ?? 'Error al guardar registro');
    });
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-happy-200 bg-happy-50/40 p-2">
      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setModo('intervalo')}
          className={`rounded px-2 py-1 ${modo === 'intervalo' ? 'bg-happy-500 text-white' : 'bg-white text-slate-600'}`}
        >
          📅 Por fecha/hora
        </button>
        <button
          type="button"
          onClick={() => setModo('directo')}
          className={`rounded px-2 py-1 ${modo === 'directo' ? 'bg-happy-500 text-white' : 'bg-white text-slate-600'}`}
        >
          ⏱ Tiempo directo
        </button>
      </div>

      {modo === 'intervalo' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] text-slate-500">
            Inicio
            <Input type="datetime-local" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="h-8 text-xs" />
          </label>
          <label className="text-[10px] text-slate-500">
            Fin
            <Input type="datetime-local" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="h-8 text-xs" />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[10px] text-slate-500">
            Fecha del trabajo
            <Input
              type="date"
              value={fechaDirecta}
              onChange={(e) => setFechaDirecta(e.target.value)}
              className="h-8 text-xs"
              title="Día en que se realizó el trabajo (no el día en que se carga al sistema)"
            />
          </label>
          <label className="block text-[10px] text-slate-500">
            Tiempo total (min)
            <Input type="number" step="0.01" min="0" value={tiempoDirecto} onChange={(e) => setTiempoDirecto(e.target.value)} className="h-8 text-xs" placeholder="Ej. 45" />
          </label>
        </div>
      )}

      {/* Multi-talla: cuadro con TODAS las tallas cortadas y cantidad por cada una */}
      <div className="rounded-md border border-dashed border-slate-200 bg-white p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-medium text-slate-700">
            Unidades procesadas por talla
            {esAreaCorte && <span className="ml-1 font-normal text-slate-400">(opcional en CORTE)</span>}
          </span>
          <div className="flex gap-2 text-[10px]">
            <button type="button" onClick={marcarTodasTallas} className="text-happy-600 hover:underline">
              Todo el remanente
            </button>
            <span className="text-slate-300">·</span>
            <button type="button" onClick={limpiarTallas} className="text-slate-500 hover:underline">
              Limpiar
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
          {tallasDisponibles.map((t) => {
            const rem = Math.max(0, t.cortada - t.yaRegistrado);
            const completo = rem === 0;
            return (
              <div
                key={t.talla}
                className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                  completo ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
                }`}
              >
                <Badge variant="outline" className="text-[9px]">{formatTallaChip(t.talla)}</Badge>
                <Input
                  type="number"
                  min="0"
                  max={rem}
                  value={cantPorTalla[t.talla] ?? ''}
                  onChange={(e) => setCant(t.talla, e.target.value)}
                  disabled={completo}
                  className="h-6 px-1 text-right text-xs font-mono"
                  placeholder={completo ? 'ok' : `máx ${rem}`}
                  title={`Cortadas: ${t.cortada} · Ya registradas: ${t.yaRegistrado} · Disponible: ${rem}`}
                />
                <span className="text-[9px] text-slate-400">/{t.cortada}</span>
              </div>
            );
          })}
        </div>
        {tallasAEnviar.length > 0 && (
          <p className="mt-1 text-[10px] text-emerald-700">
            {tallasAEnviar.length === 1
              ? 'Se creará 1 registro con el tiempo ingresado.'
              : `El tiempo total ingresado se REPARTE entre las ${tallasAEnviar.length} tallas (según sus unidades), no se cobra por cada una.`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-[10px] text-slate-500">
          Operario (opcional)
          <select
            value={operarioId}
            onChange={(e) => setOperarioId(e.target.value)}
            className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
          >
            <option value="">— Sin asignar —</option>
            {operarios.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-slate-500">
          Notas (opcional)
          <Input value={notas} onChange={(e) => setNotas(e.target.value)} className="h-8 text-xs" maxLength={500} />
        </label>
      </div>

      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onSaved} disabled={pending} className="h-7 px-2 text-xs">Cancelar</Button>
        <Button variant="premium" size="sm" onClick={submit} disabled={pending} className="h-7 gap-1 px-2 text-xs">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}

function RegistroRow({ otId, registro: r, disabled }: { otId: string; registro: RegistroTiempo; disabled: boolean }) {
  const [pending, start] = useTransition();
  function eliminar() {
    if (!confirm('¿Eliminar este registro de tiempo?')) return;
    start(async () => {
      const res = await eliminarRegistroTiempoOT(otId, r.id);
      if (res.ok) toast.success('Registro eliminado');
      else toast.error(res.error ?? 'Error');
    });
  }
  // Con intervalo (inicio + fin) se muestra el rango. En "tiempo directo" solo
  // hay fecha de trabajo (sin fin): se muestra solo el día, sin el "→ ?" que
  // aparecía antes. Si el registro es viejo y no tiene fecha, cae a created_at.
  const fmtFechaHora = (v: string) =>
    new Date(v).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
  const fechaTxt = r.fecha_inicio
    ? r.fecha_fin
      ? `${fmtFechaHora(r.fecha_inicio)} → ${fmtFechaHora(r.fecha_fin)}`
      : new Date(r.fecha_inicio).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : fmtFechaHora(r.created_at);
  return (
    <div className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
      <Badge variant="outline" className="text-[9px]">{formatTallaChip(r.talla)}</Badge>
      <span className="text-slate-500">{fechaTxt}</span>
      <span className="font-mono font-semibold text-emerald-700">{Number(r.tiempo_total_min).toFixed(2)} min</span>
      {r.unidades_procesadas != null && <span className="text-slate-600">· {r.unidades_procesadas} u</span>}
      {r.operario_nombre && <span className="text-slate-500">· 👤 {r.operario_nombre}</span>}
      {r.notas && <span className="ml-1 truncate text-slate-400">· {r.notas}</span>}
      {!disabled && (
        <Button variant="ghost" size="sm" onClick={eliminar} disabled={pending} className="ml-auto h-5 w-5 p-0 text-slate-400 hover:text-danger">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );
}
