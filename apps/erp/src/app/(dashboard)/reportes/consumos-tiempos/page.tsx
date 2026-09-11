import Link from 'next/link';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Button } from '@happy/ui/button';
import { Boxes, Clock, Info } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportMultiButton } from '@/components/reportes/export-multi-button';
import { formatDate, formatNumber, formatPEN } from '@happy/lib';
import { reporteConsumosYTiempos } from '@/server/actions/reportes-consumos';
import { hoy, inicioDeMes, inicioDeSemana } from '@/server/actions/reportes-helpers';
import type { ColExport } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Consumos y Tiempos: Receta vs Real' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string };

type HojaReporte = {
  nombre: string;
  titulo: string;
  subtitulo?: string;
  filtros?: string[];
  cols: ColExport[];
  rows: Record<string, unknown>[];
  totales?: Record<string, number>;
};

const COLS_CONSUMOS: ColExport[] = [
  { header: 'OT', key: 'ot_numero', width: 14 },
  { header: 'Estado OT', key: 'estado', width: 14 },
  { header: 'Producto', key: 'producto', width: 34 },
  { header: 'Cód. material', key: 'material_codigo', width: 14 },
  { header: 'Material', key: 'material_nombre', width: 38 },
  { header: 'Unidad', key: 'unidad', width: 9 },
  { header: 'Und. planificadas', key: 'und_plan', formato: 'numero', width: 16 },
  { header: 'Und. cortadas', key: 'und_cortadas', formato: 'numero', width: 14 },
  { header: 'Teórico s/ plan', key: 'teorico_plan', width: 15 },
  { header: 'Teórico s/ cortado', key: 'teorico_cortado', width: 17 },
  { header: 'Enviado al taller', key: 'enviado_taller', width: 16 },
  { header: 'Devuelto por taller', key: 'devuelto_taller', width: 18 },
  { header: 'Real consumido', key: 'real_cant', width: 15 },
  { header: 'Diferencia', key: 'diferencia', width: 12 },
  { header: '% Desv.', key: 'desviacion_pct', formato: 'porcentaje', width: 10 },
  { header: 'Precio unit.', key: 'precio_unitario', formato: 'moneda', width: 13 },
  { header: 'Valor teórico', key: 'valor_teorico', formato: 'moneda', width: 14 },
  { header: 'Valor real', key: 'valor_real', formato: 'moneda', width: 14 },
  { header: 'Dif. valorizada', key: 'valor_diferencia', formato: 'moneda', width: 15 },
  { header: 'Observación', key: 'nota', width: 30 },
];

const COLS_TIEMPOS: ColExport[] = [
  { header: 'OT', key: 'ot_numero', width: 14 },
  { header: 'Producto', key: 'producto', width: 34 },
  { header: 'Área', key: 'area', width: 18 },
  { header: 'Proceso', key: 'proceso', width: 24 },
  { header: 'Tercerizado', key: 'tercerizado', width: 12 },
  { header: 'Unidades', key: 'unidades', formato: 'numero', width: 10 },
  { header: 'Estándar min/u', key: 'estandar_min_u', width: 14 },
  { header: 'Real min/u', key: 'real_min_u', width: 12 },
  { header: 'Estándar (min)', key: 'estandar_min', width: 14 },
  { header: 'Real (min)', key: 'real_min', width: 12 },
  { header: 'Diferencia (min)', key: 'diferencia_min', width: 15 },
  { header: '% Desv.', key: 'desviacion_pct', formato: 'porcentaje', width: 10 },
  { header: 'N° registros', key: 'registros', formato: 'numero', width: 12 },
];

const COLS_RESUMEN: ColExport[] = [
  { header: 'Indicador', key: 'indicador', width: 42 },
  { header: 'Valor', key: 'valor', width: 22 },
  { header: 'Detalle', key: 'detalle', width: 58 },
];

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();

  const HOY = hoy();
  const presets = [
    { label: 'Hoy', desde: HOY, hasta: HOY },
    { label: 'Esta semana', desde: inicioDeSemana(), hasta: HOY },
    { label: 'Este mes', desde: inicioDeMes(), hasta: HOY },
  ];
  const activo = (p: { desde: string; hasta: string }) => p.desde === desde && p.hasta === hasta;

  const { metricas, consumos, tiempos } = await reporteConsumosYTiempos({ desde, hasta });

  const periodo = `Del ${formatDate(desde)} al ${formatDate(hasta)}`;
  const filtros = [`Período: ${formatDate(desde)} - ${formatDate(hasta)}`, 'OTs con actividad en el período'];

  const resumenRows: Record<string, unknown>[] = [
    { indicador: 'Órdenes de trabajo incluidas', valor: metricas.cantidad_ots, detalle: 'OTs con actividad en el período (abiertas o cerradas dentro del rango)' },
    { indicador: 'OTs con consumo registrado en el kardex', valor: metricas.ots_con_consumo, detalle: 'Los indicadores de materiales se calculan sólo sobre estas OTs' },
    { indicador: 'OTs sin ningún consumo registrado', valor: metricas.ots_sin_consumo, detalle: 'Aparecen en el detalle pero no entran en los indicadores: falta registrar su salida de material' },
    { indicador: 'Materiales — valor teórico (receta)', valor: formatPEN(metricas.valor_teorico), detalle: 'Receta × unidades cortadas, valorizado al precio del material' },
    { indicador: 'Materiales — valor real consumido', valor: formatPEN(metricas.valor_real), detalle: 'Salidas de producción del kardex, menos devoluciones de material' },
    { indicador: 'Materiales — diferencia', valor: formatPEN(metricas.valor_diferencia), detalle: `${metricas.desviacion_consumo_pct.toFixed(2)}% respecto de la receta (positivo = se consumió más)` },
    { indicador: 'Materiales consumidos fuera de receta', valor: metricas.materiales_sin_receta, detalle: 'Líneas con consumo real pero sin estar en la receta del producto' },
    { indicador: 'Tiempos — estándar de receta (min)', valor: formatNumber(metricas.estandar_min, 1), detalle: 'Tiempo estándar del proceso × unidades procesadas (sólo procesos con estándar en la receta)' },
    { indicador: 'Tiempos — real declarado (min)', valor: formatNumber(metricas.real_min, 1), detalle: 'Registros de tiempo de las operaciones de la OT' },
    { indicador: 'Tiempos — diferencia', valor: formatNumber(metricas.diferencia_min, 1), detalle: `${metricas.desviacion_tiempo_pct.toFixed(2)}% respecto de la receta (positivo = tomó más tiempo)` },
    { indicador: 'Minutos reales en procesos sin estándar', valor: formatNumber(metricas.real_min_sin_estandar, 1), detalle: 'Trabajo declarado en procesos que no tienen tiempo estándar cargado en la receta (no se puede comparar)' },
    { indicador: 'Minutos liquidados en corte', valor: formatNumber(metricas.corte_liquidado_min, 1), detalle: 'Tendido + corte + habilitado de la liquidación de corte (informativo, no entra en el cuadro de procesos)' },
  ];

  const hojas: HojaReporte[] = [
    { nombre: 'Resumen', titulo: 'Consumos y Tiempos: Receta vs Real', subtitulo: periodo, filtros, cols: COLS_RESUMEN, rows: resumenRows },
    {
      nombre: 'Consumos', titulo: 'Consumos: Receta vs Real', subtitulo: periodo, filtros,
      cols: COLS_CONSUMOS, rows: consumos as unknown as Record<string, unknown>[],
      totales: { valor_teorico: metricas.valor_teorico, valor_real: metricas.valor_real, valor_diferencia: metricas.valor_diferencia },
    },
    {
      nombre: 'Tiempos', titulo: 'Tiempos de producción: Receta vs Real', subtitulo: periodo, filtros,
      cols: COLS_TIEMPOS, rows: tiempos as unknown as Record<string, unknown>[],
      totales: { estandar_min: metricas.estandar_min, real_min: metricas.real_min, diferencia_min: metricas.diferencia_min },
    },
  ];

  const consUp = metricas.valor_diferencia >= 0;
  const tiempoUp = metricas.diferencia_min >= 0;

  return (
    <PageShell
      title="Consumos y Tiempos: Receta vs Real"
      description={`Cuánto material y cuánto tiempo dice la receta frente a lo que realmente se consumió y se trabajó, por OT · ${periodo}`}
      actions={<ExportMultiButton titulo="Consumos y Tiempos Receta vs Real" hojas={hojas} label="Descargar Excel (3 hojas)" />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Período:</span>
        {presets.map((p) => (
          <Link key={p.label} href={`/reportes/consumos-tiempos?desde=${p.desde}&hasta=${p.hasta}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${activo(p) ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-happy-300'}`}>
            {p.label}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3" method="get">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Desde</label>
          <input type="date" name="desde" defaultValue={desde} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <Button type="submit" size="sm" variant="premium">Aplicar</Button>
        <Link href="/reportes/consumos-tiempos" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">OTs incluidas</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.cantidad_ots}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">
            {metricas.ots_con_consumo} con consumo registrado
            {metricas.ots_sin_consumo > 0 ? ` · ${metricas.ots_sin_consumo} sin registrar` : ''}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Materiales: receta vs real</p>
          <p className="mt-1 font-display text-lg font-semibold text-corp-900">
            {formatPEN(metricas.valor_teorico)} <span className="text-slate-400">→</span> {formatPEN(metricas.valor_real)}
          </p>
          <p className={`mt-0.5 text-[10px] ${consUp ? 'text-red-700' : 'text-emerald-700'}`}>
            {consUp ? 'Se consumió más' : 'Se consumió menos'} · {formatPEN(Math.abs(metricas.valor_diferencia))} ({metricas.desviacion_consumo_pct.toFixed(1)}%)
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Tiempos: receta vs real</p>
          <p className="mt-1 font-display text-lg font-semibold text-corp-900">
            {(metricas.estandar_min / 60).toFixed(1)} h <span className="text-slate-400">→</span> {(metricas.real_min / 60).toFixed(1)} h
          </p>
          <p className={`mt-0.5 text-[10px] ${tiempoUp ? 'text-red-700' : 'text-emerald-700'}`}>
            {tiempoUp ? 'Más lento que la receta' : 'Más rápido que la receta'} · {metricas.desviacion_tiempo_pct.toFixed(1)}%
          </p>
          {metricas.real_min_sin_estandar > 0 && (
            <p className="mt-0.5 text-[10px] text-slate-500">
              + {formatNumber(metricas.real_min_sin_estandar, 0)} min en procesos sin estándar
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Minutos liquidados en corte</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatNumber(metricas.corte_liquidado_min, 0)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">tendido + corte + habilitado</p>
        </Card>
      </div>

      <Card className="border-sky-200 bg-sky-50/60 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-700" />
          <div className="space-y-1 text-[12px] leading-relaxed text-sky-900">
            <p className="font-semibold">Cómo leer este reporte</p>
            <p>
              <strong>Consumos.</strong> El teórico sale de la receta activa del producto (cantidad por talla × unidades).
              Se muestran dos teóricos: sobre lo <em>planificado</em> y sobre lo realmente <em>cortado</em>. La diferencia y
              el % de desviación comparan el consumo real contra el teórico <em>sobre lo cortado</em>, porque es lo que de
              verdad debió consumirse. El consumo real tiene dos fuentes: la <strong>tela</strong> sale del kardex (la salida
              que se genera al cerrar el corte) y los <strong>avíos de un servicio</strong> se cuentan como
              <strong>enviado al taller menos devuelto</strong>, así lo que el taller regresa deja de contarse como consumido.
            </p>
            <p>
              <strong>Tiempos.</strong> El estándar es el tiempo de la receta del proceso × unidades procesadas; el real son
              los registros de operaciones de la OT. Los minutos de la liquidación de corte se muestran aparte para no
              duplicar el proceso de corte.
            </p>
            <p>
              <strong>Valorización.</strong> Los consumos se valorizan con el precio unitario del material, tanto el teórico
              como el real, para que la comparación sea pareja.
            </p>
            <p>
              <strong>Qué entra en los indicadores de arriba.</strong> Los de materiales toman sólo las OTs que ya tienen
              consumo registrado en el kardex, y los de tiempos sólo los procesos que tienen tiempo estándar en la receta.
              Así el resumen no queda distorsionado por lo que todavía no se registró. El detalle de abajo sí muestra todo.
            </p>
            <p>
              Las observaciones te dicen qué revisar: “Sin consumo registrado todavía” (falta descargar el material),
              “Consumido sin estar en la receta” (revisa la receta o el material despachado) y “Devolución de material sin
              salida registrada” (entró una devolución del taller sin su salida correspondiente).
            </p>
          </div>
        </div>
      </Card>

      {consumos.length === 0 && tiempos.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="Sin datos en el período"
          description="No hay OTs con consumos ni tiempos registrados en estas fechas. Amplía el rango e intenta de nuevo."
        />
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between border-b bg-slate-50 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-corp-900"><Boxes className="h-4 w-4 text-slate-400" />Consumos por OT y material</h3>
              <span className="text-[11px] text-slate-500">{consumos.length} líneas{consumos.length > 200 ? ' · se muestran las primeras 200' : ''}</span>
            </div>
            <div className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OT</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Und. cort.</TableHead>
                    <TableHead className="text-right">Teórico</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead className="text-right">Dif.</TableHead>
                    <TableHead className="text-right">% Desv.</TableHead>
                    <TableHead className="text-right">Dif. S/</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consumos.slice(0, 200).map((c, i) => {
                    const up = c.diferencia > 0;
                    return (
                      <TableRow key={`${c.ot_id}-${c.material_codigo}-${i}`}>
                        <TableCell className="font-mono text-xs">{c.ot_numero}</TableCell>
                        <TableCell className="max-w-[14rem] truncate text-sm" title={c.producto}>{c.producto}</TableCell>
                        <TableCell className="max-w-[16rem] truncate text-sm" title={`${c.material_codigo} ${c.material_nombre}`}>
                          <span className="font-mono text-[11px] text-slate-500">{c.material_codigo}</span> {c.material_nombre}
                          {c.nota && <span className="ml-1 text-[10px] text-amber-700">· {c.nota}</span>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(c.und_cortadas, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNumber(c.teorico_cortado, 2)} {c.unidad}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNumber(c.real_cant, 2)} {c.unidad}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${up ? 'text-red-700' : c.diferencia < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {up ? '+' : ''}{formatNumber(c.diferencia, 2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.teorico_cortado === 0 ? <span className="text-[10px] text-slate-400">sin receta</span> : (
                            <Badge variant={Math.abs(c.desviacion_pct) < 10 ? 'success' : Math.abs(c.desviacion_pct) < 30 ? 'warning' : 'destructive'} className="text-[10px]">
                              {c.desviacion_pct >= 0 ? '+' : ''}{c.desviacion_pct.toFixed(1)}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${up ? 'text-red-700' : 'text-emerald-700'}`}>{formatPEN(c.valor_diferencia)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b bg-slate-50 p-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-corp-900"><Clock className="h-4 w-4 text-slate-400" />Tiempos por OT y proceso</h3>
              <span className="text-[11px] text-slate-500">{tiempos.length} líneas{tiempos.length > 200 ? ' · se muestran las primeras 200' : ''}</span>
            </div>
            <div className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>OT</TableHead>
                    <TableHead>Proceso</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead className="text-right">Und.</TableHead>
                    <TableHead className="text-right">Est. min/u</TableHead>
                    <TableHead className="text-right">Real min/u</TableHead>
                    <TableHead className="text-right">Estándar</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead className="text-right">Dif.</TableHead>
                    <TableHead className="text-right">% Desv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiempos.slice(0, 200).map((t, i) => {
                    const up = t.diferencia_min > 0;
                    return (
                      <TableRow key={`${t.ot_id}-${t.proceso}-${i}`}>
                        <TableCell className="font-mono text-xs">{t.ot_numero}</TableCell>
                        <TableCell className="text-sm">
                          {t.proceso}
                          {t.tercerizado === 'Sí' && <span className="ml-1 text-[10px] text-slate-500">· tercerizado</span>}
                        </TableCell>
                        <TableCell className="max-w-[10rem] truncate text-xs text-slate-600">{t.area}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatNumber(t.unidades, 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-slate-600">{t.estandar_min_u.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{t.unidades > 0 ? t.real_min_u.toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNumber(t.estandar_min, 1)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatNumber(t.real_min, 1)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${up ? 'text-red-700' : t.diferencia_min < 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {up ? '+' : ''}{formatNumber(t.diferencia_min, 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.estandar_min === 0 ? <span className="text-[10px] text-slate-400">sin estándar</span> : (
                            <Badge variant={Math.abs(t.desviacion_pct) < 10 ? 'success' : Math.abs(t.desviacion_pct) < 30 ? 'warning' : 'destructive'} className="text-[10px]">
                              {t.desviacion_pct >= 0 ? '+' : ''}{t.desviacion_pct.toFixed(1)}%
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </PageShell>
  );
}
