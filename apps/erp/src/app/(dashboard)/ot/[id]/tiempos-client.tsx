'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { upsertTiempoRealOT } from '@/server/actions/ot';

type Proceso = {
  id: string;
  producto_id: string;
  proceso: string;
  /** null o '' = aplica a todas las tallas. */
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

type TiempoReal = {
  proceso_id: string;
  talla: string;
  tiempo_real_min: number | null;
  notas: string | null;
};

type Props = {
  otId: string;
  procesos: Proceso[];
  lineas: Linea[];
  tiemposReales: TiempoReal[];
  disabled: boolean;
};

const PEN = (n: number) => `S/ ${n.toFixed(2)}`;

export function TiemposCostoTab({ otId, procesos, lineas, tiemposReales, disabled }: Props) {
  // Productos únicos presentes en las líneas de la OT.
  const productos = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; codigo: string }>();
    for (const l of lineas) {
      if (!map.has(l.producto_id)) {
        map.set(l.producto_id, { id: l.producto_id, nombre: l.producto_nombre, codigo: l.producto_codigo });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [lineas]);
  const [productoSel, setProductoSel] = useState<string>(productos[0]?.id ?? '');

  // Líneas y procesos filtrados al producto seleccionado.
  const lineasProducto = useMemo(() => lineas.filter((l) => l.producto_id === productoSel), [lineas, productoSel]);
  const procesosProducto = useMemo(() => procesos.filter((p) => p.producto_id === productoSel), [procesos, productoSel]);

  // Mapa producto_id → boolean (true si ese producto tiene procesos definidos).
  // Sirve para mostrar ✓ / ⚠ en el selector y que el usuario vea de un vistazo
  // qué productos están listos y cuáles necesitan cargar receta.
  const tieneProcesosPorProducto = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const p of productos) m.set(p.id, false);
    for (const pr of procesos) m.set(pr.producto_id, true);
    return m;
  }, [productos, procesos]);

  const tallasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const l of lineasProducto) set.add(l.talla);
    return Array.from(set).sort();
  }, [lineasProducto]);
  const [tallaSel, setTallaSel] = useState<string>('');
  // Reset talla cuando cambia producto y la talla actual ya no existe.
  if (tallaSel && !tallasDisponibles.includes(tallaSel)) {
    setTallaSel(tallasDisponibles[0] ?? '');
  }
  if (!tallaSel && tallasDisponibles.length > 0) {
    setTallaSel(tallasDisponibles[0]!);
  }

  // Mapa rápido (proceso_id|talla) → tiempo real
  const overrideMap = useMemo(() => {
    const m = new Map<string, TiempoReal>();
    for (const t of tiemposReales) m.set(`${t.proceso_id}|${t.talla}`, t);
    return m;
  }, [tiemposReales]);

  if (productos.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-400">
          La OT aún no tiene líneas — agrega líneas para ver el costo MO por talla.
        </CardContent>
      </Card>
    );
  }

  if (procesosProducto.length === 0) {
    const prodSelInfo = productos.find((p) => p.id === productoSel);
    return (
      <div className="space-y-4">
        {productos.length > 1 && (
          <SelectorProducto
            productos={productos}
            productoSel={productoSel}
            setProductoSel={setProductoSel}
            tieneProcesosPorProducto={tieneProcesosPorProducto}
          />
        )}
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            <strong>{prodSelInfo?.nombre ?? 'Este producto'}</strong> no tiene operaciones definidas en su receta.
            <br />
            Andá a <span className="font-mono text-xs">Recetas (BOM) → {prodSelInfo?.nombre} → Procesos / Operaciones</span> para crearlas.
          </CardContent>
        </Card>
      </div>
    );
  }

  // Un proceso aplica a la talla seleccionada si: es específico de esa talla,
  // O si su talla es null/'' (significa "aplica a todas las tallas").
  const procesosTalla = procesosProducto.filter((p) => p.talla === tallaSel || !p.talla);
  const lineaTalla = lineasProducto.find((l) => l.talla === tallaSel);
  // Para el cálculo de costo MO se usan unidades cortadas (lo que realmente
  // pasó por el proceso). Si está en 0 mostramos el costo unitario igual.
  const unidades = Number(lineaTalla?.cantidad_cortada ?? 0);
  const unidadesPlan = Number(lineaTalla?.cantidad_planificada ?? 0);

  let totalEstandarMin = 0;
  let totalRealMin = 0;
  let totalCostoEstandarUnit = 0;
  let totalCostoRealUnit = 0;
  for (const p of procesosTalla) {
    const std = Number(p.tiempo_estandar_min ?? 0);
    const ov = overrideMap.get(`${p.id}|${tallaSel}`);
    const real = ov?.tiempo_real_min != null ? Number(ov.tiempo_real_min) : std;
    const vmin = Number(p.area?.valor_minuto ?? 0);
    totalEstandarMin += std;
    totalRealMin += real;
    totalCostoEstandarUnit += std * vmin;
    totalCostoRealUnit += real * vmin;
  }
  const totalCostoEstandar = totalCostoEstandarUnit * unidades;
  const totalCostoReal = totalCostoRealUnit * unidades;
  const variacionPct = totalCostoEstandar > 0
    ? ((totalCostoReal - totalCostoEstandar) / totalCostoEstandar) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Selector de producto (solo si hay varios) */}
      {productos.length > 1 && (
        <SelectorProducto
          productos={productos}
          productoSel={productoSel}
          setProductoSel={setProductoSel}
          tieneProcesosPorProducto={tieneProcesosPorProducto}
        />
      )}

      {/* Selector de talla */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Talla:</span>
        {tallasDisponibles.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTallaSel(t)}
            className={`flex h-8 min-w-[2.5rem] items-center justify-center rounded-md border px-2 text-xs font-semibold transition ${
              tallaSel === t
                ? 'border-happy-500 bg-happy-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'
            }`}
          >
            {t.replace('T', '')}
          </button>
        ))}
      </div>

      {/* Stats por talla */}
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
                ? `× 0 cortadas = S/ 0.00 total · declará avance para ver el total real`
                : 'sin costo configurado (¿áreas sin valor/min?)'
              : totalCostoEstandar > 0
                ? `unitario ${PEN(totalCostoRealUnit)} · vs estándar ${PEN(totalCostoEstandar)} (${variacionPct > 0 ? '+' : ''}${variacionPct.toFixed(1)}%)`
                : `unitario ${PEN(totalCostoRealUnit)} · sin estándar configurado`
          }
          highlight={unidades > 0 && Math.abs(variacionPct) > 5}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Operaciones · {productos.find((p) => p.id === productoSel)?.nombre ?? ''} · Talla {tallaSel.replace('T', '')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {procesosTalla.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              No hay operaciones definidas para la talla {tallaSel.replace('T', '')}. Configurálas desde la receta del producto.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px] text-center">#</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Estándar (min)</TableHead>
                  <TableHead className="text-right">Real (min)</TableHead>
                  <TableHead className="text-right">S/ por min</TableHead>
                  <TableHead className="text-right">Costo unit. real</TableHead>
                  <TableHead className="w-[150px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procesosTalla.map((p) => (
                  <ProcesoRow
                    key={p.id}
                    otId={otId}
                    proceso={p}
                    talla={tallaSel}
                    override={overrideMap.get(`${p.id}|${tallaSel}`) ?? null}
                    disabled={disabled}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border-2 border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-medium text-corp-900">¿Cómo funciona?</p>
        <ul className="ml-4 mt-1 list-disc space-y-0.5">
          <li>El <strong>costo estándar</strong> usa el tiempo definido en la receta del producto × valor/min del área.</li>
          <li>El <strong>costo real</strong> sustituye el tiempo estándar por el medido en esta OT (si lo cargás).</li>
          <li>Si dejás vacío el tiempo real, esa operación usa el estándar.</li>
          <li>Los totales se multiplican por unidades <strong>cortadas</strong> (no planificadas) para reflejar producción real.</li>
        </ul>
      </div>
    </div>
  );
}

function SelectorProducto({
  productos,
  productoSel,
  setProductoSel,
  tieneProcesosPorProducto,
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
            title={ok ? 'Tiene operaciones definidas' : 'Sin operaciones — necesita cargar receta de procesos'}
            className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
              productoSel === p.id
                ? 'border-happy-500 bg-happy-500 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:border-happy-300'
            }`}
          >
            <span className={ok ? 'text-emerald-500' : 'text-amber-500'}>{ok ? '●' : '⚠'}</span>
            {p.nombre}
            {p.codigo && <span className={`ml-1 font-mono text-[9px] ${productoSel === p.id ? 'text-happy-100' : 'text-slate-400'}`}>{p.codigo}</span>}
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

function ProcesoRow({
  otId,
  proceso,
  talla,
  override,
  disabled,
}: {
  otId: string;
  proceso: Proceso;
  talla: string;
  override: TiempoReal | null;
  disabled: boolean;
}) {
  const [pending, start] = useTransition();
  const std = Number(proceso.tiempo_estandar_min ?? 0);
  const vmin = Number(proceso.area?.valor_minuto ?? 0);
  const realInicial = override?.tiempo_real_min != null ? String(override.tiempo_real_min) : '';
  const [valor, setValor] = useState<string>(realInicial);

  const realNum = valor.trim() ? Number(valor) : std;
  const costoUnitReal = realNum * vmin;
  const dirty = valor.trim() !== realInicial.trim();

  function save() {
    const num = valor.trim() ? Number(valor) : null;
    if (num !== null && (Number.isNaN(num) || num < 0)) {
      toast.error('Tiempo real inválido');
      return;
    }
    start(async () => {
      const r = await upsertTiempoRealOT(otId, {
        proceso_id: proceso.id,
        talla,
        tiempo_real_min: num,
      });
      if (r.ok) {
        toast.success(num === null ? 'Tiempo real removido (usa estándar)' : 'Tiempo real guardado');
      } else {
        toast.error(r.error ?? 'Error al guardar');
      }
    });
  }

  function reset() {
    setValor('');
    start(async () => {
      const r = await upsertTiempoRealOT(otId, {
        proceso_id: proceso.id,
        talla,
        tiempo_real_min: null,
      });
      if (r.ok) toast.success('Restaurado al estándar');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <TableRow>
      <TableCell className="text-center text-xs text-slate-500">{proceso.orden}</TableCell>
      <TableCell className="text-sm font-medium">{proceso.proceso.replace(/_/g, ' ')}</TableCell>
      <TableCell className="text-xs">
        {proceso.area ? (
          <Badge variant="outline" className="text-[10px]">{proceso.area.codigo}</Badge>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{std.toFixed(2)}</TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          step="0.01"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={std.toFixed(2)}
          className="h-8 w-20 text-right text-xs"
          disabled={disabled || pending}
          title="Vacío = usa estándar"
        />
      </TableCell>
      <TableCell className="text-right font-mono text-xs text-slate-500">
        {vmin > 0 ? PEN(vmin) : <span className="text-slate-400">—</span>}
      </TableCell>
      <TableCell className="text-right font-mono text-xs font-semibold text-emerald-700">
        {PEN(costoUnitReal)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="premium"
            size="sm"
            onClick={save}
            disabled={!dirty || pending || disabled}
            className="h-7 px-2"
            title="Guardar tiempo real"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          </Button>
          {override && (
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={pending || disabled}
              className="h-7 px-2"
              title="Restaurar al estándar"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
