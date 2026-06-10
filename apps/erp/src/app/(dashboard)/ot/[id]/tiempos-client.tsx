'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Plus, Trash2, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { crearRegistroTiempoOT, eliminarRegistroTiempoOT } from '@/server/actions/ot';

type Proceso = {
  id: string;
  producto_id: string;
  proceso: string;
  talla: string | null;
  orden: number;
  tiempo_estandar_min: number;
  area: { id: string; codigo: string; nombre: string; valor_minuto: number | null } | null;
};

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
};

const PEN = (n: number) => `S/ ${n.toFixed(2)}`;

export function TiemposCostoTab({ otId, procesos, lineas, registros, operarios, disabled }: Props) {
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

  // Registros filtrados a la talla seleccionada
  const registrosTalla = useMemo(() => registros.filter((r) => r.talla === tallaSel), [registros, tallaSel]);

  // Totales para el resumen.
  // "Real por unidad" = total tiempo registrado / SUMA DE UNIDADES PROCESADAS
  // de los registros (no `cantidad_cortada`, que es el total a producir).
  // Esto refleja el avance parcial: si procesaste 50 de 100, el ratio es sobre
  // 50. Si ninguno de los registros trae unidades_procesadas, caemos al
  // cortado como fallback (legacy) para no romper datos viejos.
  let totalEstandarMin = 0;
  let totalRealMin = 0;
  let totalCostoEstandarUnit = 0;
  let totalCostoRealUnit = 0;
  for (const p of procesosTalla) {
    const std = Number(p.tiempo_estandar_min ?? 0);
    const vmin = Number(p.area?.valor_minuto ?? 0);
    const regs = registrosTalla.filter((r) => r.proceso_id === p.id);
    const tiempoTotal = regs.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
    const unidadesProcesadasOp = regs.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
    const denominador = unidadesProcesadasOp > 0 ? unidadesProcesadasOp : unidades;
    const tiempoRealUnit = denominador > 0 ? tiempoTotal / denominador : 0;
    totalEstandarMin += std;
    totalRealMin += tiempoRealUnit > 0 ? tiempoRealUnit : std;
    totalCostoEstandarUnit += std * vmin;
    totalCostoRealUnit += (tiempoRealUnit > 0 ? tiempoRealUnit : std) * vmin;
  }
  const totalCostoEstandar = totalCostoEstandarUnit * unidades;
  const totalCostoReal = totalCostoRealUnit * unidades;
  const variacionPct = totalCostoEstandar > 0 ? ((totalCostoReal - totalCostoEstandar) / totalCostoEstandar) * 100 : 0;

  return (
    <div className="space-y-4">
      {productos.length > 1 && (
        <SelectorProducto productos={productos} productoSel={productoSel} setProductoSel={setProductoSel} tieneProcesosPorProducto={tieneProcesosPorProducto} />
      )}

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
            {t.replace('T', '')}
          </button>
        ))}
      </div>

      {/* Stats agregadas */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatBox label="Unidades cortadas" value={`${unidades} / ${unidadesPlan}`} sub="planificadas" />
        <StatBox label="Tiempo estándar" value={`${totalEstandarMin.toFixed(2)} min`} sub="por unidad" />
        <StatBox label="Tiempo real" value={`${totalRealMin.toFixed(2)} min`} sub={`por unidad${totalRealMin !== totalEstandarMin ? ` · Δ ${(totalRealMin - totalEstandarMin).toFixed(2)}` : ''}`} />
        <StatBox
          label={unidades > 0 ? 'Costo MO OT' : 'Costo MO por unidad'}
          value={PEN(unidades > 0 ? totalCostoReal : totalCostoRealUnit)}
          sub={
            unidades === 0
              ? totalCostoRealUnit > 0
                ? `× 0 cortadas = S/ 0.00 total · declará avance para ver total real`
                : 'sin costo configurado'
              : totalCostoEstandar > 0
                ? `unitario ${PEN(totalCostoRealUnit)} · vs estándar ${PEN(totalCostoEstandar)} (${variacionPct > 0 ? '+' : ''}${variacionPct.toFixed(1)}%)`
                : `unitario ${PEN(totalCostoRealUnit)}`
          }
          highlight={unidades > 0 && Math.abs(variacionPct) > 5}
        />
      </div>

      {/* Vista jerárquica área → operación → registros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Registro de avance · {productos.find((p) => p.id === productoSel)?.nombre} · Talla {tallaSel.replace('T', '')}
          </CardTitle>
          <p className="text-xs text-slate-500">
            Por cada operación podés cargar uno o varios registros: fecha/hora inicio + fin (calcula duración) o tiempo total directo en minutos.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-3">
          {[...procesosPorArea.entries()].map(([areaCodigo, procs]) => {
            const area = procs[0]!.area;
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
                    return (
                      <OperacionBlock
                        key={p.id}
                        otId={otId}
                        proceso={p}
                        tallaActual={tallaSel}
                        tallasDisponibles={tallasParaForm}
                        registros={registrosTalla.filter((r) => r.proceso_id === p.id)}
                        operarios={operarios}
                        esAreaCorte={areaCodigo === 'CORTE'}
                        disabled={disabled}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Resumen tabla (lo que antes era el editor) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumen por operación</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
              {procesosTalla.map((p) => {
                const std = Number(p.tiempo_estandar_min ?? 0);
                const vmin = Number(p.area?.valor_minuto ?? 0);
                const regs = registrosTalla.filter((r) => r.proceso_id === p.id);
                const totalRegistrado = regs.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
                const unidadesProcOp = regs.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
                const denominador = unidadesProcOp > 0 ? unidadesProcOp : unidades;
                const realPorUnidad = denominador > 0 ? totalRegistrado / denominador : 0;
                const tiempoUsado = realPorUnidad > 0 ? realPorUnidad : std;
                const parcial = unidadesProcOp > 0 && unidadesProcOp < unidades;
                const pct = unidades > 0 ? Math.min(100, Math.round((unidadesProcOp / unidades) * 100)) : 0;
                const completo = unidadesProcOp >= unidades && unidades > 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-center text-xs text-slate-500">{p.orden}</TableCell>
                    <TableCell className="text-sm font-medium">{p.proceso.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{p.area?.codigo ?? '—'}</Badge></TableCell>
                    <TableCell className="text-right font-mono text-xs">{std.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {regs.length > 0 ? totalRegistrado.toFixed(2) : <span className="text-slate-300">—</span>}
                    </TableCell>
                    <TableCell>
                      {unidades === 0 ? (
                        <span className="text-[10px] text-slate-400">sin corte</span>
                      ) : unidadesProcOp === 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[10px] text-slate-400">0 / {unidades}</span>
                          <div className="h-1 w-20 rounded-full bg-slate-100" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5" title={`Procesadas: ${unidadesProcOp} de ${unidades} cortadas`}>
                          <span className={`font-mono text-[10px] ${completo ? 'text-emerald-700' : 'text-corp-900'}`}>
                            {unidadesProcOp} / {unidades}
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
        </CardContent>
      </Card>

      <div className="rounded-md border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-corp-900">¿Cómo funciona?</p>
        <ul className="ml-4 mt-1 list-disc space-y-0.5">
          <li>Cada operación puede tener <strong>múltiples registros de tiempo</strong> (uno por lote/sesión).</li>
          <li>Podés ingresar <strong>fecha/hora inicio + fin</strong> y el sistema calcula la duración, o ingresar el <strong>tiempo total directo</strong> en minutos.</li>
          <li>El campo <strong>unidades procesadas</strong> es opcional; en CORTE muchas veces se deja vacío (es global por operación).</li>
          <li>El <strong>resumen de abajo</strong> es informativo: suma los registros y calcula real/unidad y costo.</li>
        </ul>
      </div>
    </div>
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

function OperacionBlock({
  otId, proceso, tallaActual, tallasDisponibles, registros, operarios, esAreaCorte, disabled,
}: {
  otId: string;
  proceso: Proceso;
  tallaActual: string;
  tallasDisponibles: TallaDisp[];
  registros: RegistroTiempo[];
  operarios: Operario[];
  esAreaCorte: boolean;
  disabled: boolean;
}) {
  const [openForm, setOpenForm] = useState(false);
  const totalMin = registros.reduce((s, r) => s + Number(r.tiempo_total_min), 0);
  const totalUnid = registros.reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
  return (
    <div className="rounded-md border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-corp-900">
            <span className="mr-2 text-[10px] text-slate-400">#{proceso.orden}</span>
            {proceso.proceso.replace(/_/g, ' ')}
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
        </div>
        {!disabled && (
          <Button variant="outline" size="sm" onClick={() => setOpenForm((o) => !o)} className="h-7 gap-1 px-2 text-xs">
            {openForm ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {openForm ? 'Cerrar' : 'Registrar'}
          </Button>
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
          `Talla ${t.talla.replace('T', '')}: máximo ${Math.max(0, rem)} ` +
          `(se cortaron ${t.cortada}, ya registradas ${t.yaRegistrado})`,
        );
        return;
      }
    }
    start(async () => {
      let okCount = 0;
      let errMsg = '';
      for (const t of tallasAEnviar) {
        const r = await crearRegistroTiempoOT(otId, {
          proceso_id: procesoId,
          talla: t.talla,
          fecha_inicio: modo === 'intervalo' ? fechaInicio : '',
          fecha_fin: modo === 'intervalo' ? fechaFin : '',
          tiempo_total_min: modo === 'directo' && tiempoDirecto ? Number(tiempoDirecto) : undefined,
          unidades_procesadas: t.cantidad,
          operario_id: operarioId || '',
          notas: notas || null,
        });
        if (r.ok) okCount++;
        else { errMsg = r.error ?? 'Error'; break; }
      }
      if (okCount === tallasAEnviar.length) {
        toast.success(
          okCount === 1
            ? 'Registro guardado'
            : `${okCount} registros guardados (uno por talla)`,
        );
        onSaved();
      } else {
        toast.error(`${errMsg} · Se guardaron ${okCount}/${tallasAEnviar.length} antes del error`);
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
        <label className="block text-[10px] text-slate-500">
          Tiempo total (min)
          <Input type="number" step="0.01" min="0" value={tiempoDirecto} onChange={(e) => setTiempoDirecto(e.target.value)} className="h-8 text-xs" placeholder="Ej. 45" />
        </label>
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
                <Badge variant="outline" className="text-[9px]">{t.talla.replace('T', '')}</Badge>
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
            Se crearán {tallasAEnviar.length} registro{tallasAEnviar.length === 1 ? '' : 's'} (uno por talla),
            cada uno con el mismo tiempo total ingresado arriba.
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
  const fechaTxt = r.fecha_inicio
    ? `${new Date(r.fecha_inicio).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} → ${r.fecha_fin ? new Date(r.fecha_fin).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?'}`
    : new Date(r.created_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-[11px]">
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
