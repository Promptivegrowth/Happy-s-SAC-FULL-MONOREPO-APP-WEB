import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { UserCog } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import { reporteProductividad, listarOperariosLookup, listarTalleresLookup } from '@/server/actions/reportes';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Productividad' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; operario_id?: string; taller_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const operario_id = sp.operario_id || '';
  const taller_id = sp.taller_id || '';

  const [resultado, operarios, talleres] = await Promise.all([
    reporteProductividad({ desde, hasta, operario_id, taller_id }),
    listarOperariosLookup(),
    listarTalleresLookup(),
  ]);
  const { metricas, por_operario, por_taller } = resultado;

  const filtros = [`Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`];
  if (operario_id) filtros.push(`Operario: ${operarios.find((o) => o.id === operario_id)?.nombre ?? operario_id}`);
  if (taller_id) filtros.push(`Taller: ${talleres.find((t) => t.id === taller_id)?.nombre ?? taller_id}`);

  const exportOperarios = {
    titulo: 'Productividad por operario',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Código', key: 'codigo', width: 12 },
      { header: 'Operario', key: 'nombre', width: 28 },
      { header: 'Área', key: 'area', width: 12 },
      { header: 'Min. reales', key: 'minutos_reales', formato: 'numero' as const, width: 12 },
      { header: 'Min. estándar', key: 'minutos_estandar', formato: 'numero' as const, width: 12 },
      { header: 'Cantidad', key: 'cantidad', formato: 'numero' as const, width: 10 },
      { header: 'Eficiencia %', key: 'eficiencia_pct', formato: 'porcentaje' as const, width: 12 },
      { header: '% Fallas', key: 'pct_fallas', formato: 'porcentaje' as const, width: 10 },
    ],
    rows: por_operario as unknown as Record<string, unknown>[],
    totales: { minutos_reales: metricas.minutos_totales },
  };

  const exportTalleres = {
    titulo: 'Productividad por taller',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros,
    cols: [
      { header: 'Código', key: 'codigo', width: 12 },
      { header: 'Taller', key: 'nombre', width: 28 },
      { header: '# Órdenes', key: 'ordenes', formato: 'numero' as const, width: 12 },
      { header: 'Uds. terminadas', key: 'unidades_terminadas', formato: 'numero' as const, width: 14 },
      { header: 'Monto pagado', key: 'monto_pagado', formato: 'moneda' as const, width: 14 },
    ],
    rows: por_taller as unknown as Record<string, unknown>[],
  };

  return (
    <PageShell
      title="Productividad: operarios y talleres"
      description={`Del ${formatDate(desde)} al ${formatDate(hasta)}`}
    >
      <div className="grid gap-3 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Min. producidos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.minutos_totales.toLocaleString('es-PE', { maximumFractionDigits: 0 })}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Eficiencia prom.</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{metricas.eficiencia_promedio_pct.toFixed(1)}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">% Fallas</p>
          <p className="mt-1 font-display text-2xl font-semibold text-red-600">{metricas.pct_fallas_global.toFixed(2)}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Operarios activos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.operarios_activos}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Talleres activos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.talleres_activos}</p>
        </Card>
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
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Operario</label>
          <select name="operario_id" defaultValue={operario_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {operarios.map((o) => <option key={o.id} value={o.id}>{o.codigo} · {o.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Taller</label>
          <select name="taller_id" defaultValue={taller_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {talleres.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Aplicar</button>
        <Link href="/reportes/productividad" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-corp-900">Por operario</h3>
            <ExportButtons payload={exportOperarios} />
          </div>
          {por_operario.length === 0 ? (
            <EmptyState icon={<UserCog className="h-6 w-6" />} title="Sin tickets" description="No hay tickets de operación en el rango." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operario</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead className="text-right">Min. reales</TableHead>
                  <TableHead className="text-right">Min. estándar</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Eficiencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_operario.slice(0, 100).map((r) => (
                  <TableRow key={r.operario_id}>
                    <TableCell>
                      <div className="font-medium text-corp-900">{r.nombre}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.codigo}</div>
                    </TableCell>
                    <TableCell className="text-xs">{r.area}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.minutos_reales.toFixed(0)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.minutos_estandar.toFixed(0)}</TableCell>
                    <TableCell className="text-right">{r.cantidad}</TableCell>
                    <TableCell className={`text-right font-semibold ${r.eficiencia_pct >= 100 ? 'text-emerald-700' : r.eficiencia_pct >= 80 ? 'text-amber-700' : 'text-red-700'}`}>
                      {r.eficiencia_pct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-corp-900">Por taller</h3>
            <ExportButtons payload={exportTalleres} />
          </div>
          {por_taller.length === 0 ? (
            <EmptyState icon={<UserCog className="h-6 w-6" />} title="Sin órdenes" description="No hay órdenes de servicio en el rango." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Taller</TableHead>
                  <TableHead className="text-right"># Órdenes</TableHead>
                  <TableHead className="text-right">Uds. terminadas</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {por_taller.slice(0, 100).map((r) => (
                  <TableRow key={r.taller_id}>
                    <TableCell>
                      <div className="font-medium text-corp-900">{r.nombre}</div>
                      <div className="font-mono text-[10px] text-slate-400">{r.codigo}</div>
                    </TableCell>
                    <TableCell className="text-right">{r.ordenes}</TableCell>
                    <TableCell className="text-right">{r.unidades_terminadas}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPEN(r.monto_pagado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
