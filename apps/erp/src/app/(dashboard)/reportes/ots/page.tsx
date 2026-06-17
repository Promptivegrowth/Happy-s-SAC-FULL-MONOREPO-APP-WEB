import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { ClipboardList, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate } from '@happy/lib';
import { reporteOTs } from '@/server/actions/reportes';
import { ESTADOS_OT, hoy, inicioDeMes, type EstadoOT } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Reporte de OTs' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; estado?: string; responsable_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const estado = (sp.estado as EstadoOT | '') || '';
  const responsable_id = sp.responsable_id || '';

  const resultado = await reporteOTs({ desde, hasta, estado, responsable_id });
  const { metricas, rows } = resultado;

  const exportPayload = {
    titulo: 'Reporte de OTs',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros: [
      `Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`,
      estado ? `Estado: ${estado}` : `Estado: Todos`,
    ],
    cols: [
      { header: 'Número', key: 'numero', width: 14 },
      { header: 'Producto', key: 'producto', width: 32 },
      { header: 'Apertura', key: 'fecha_apertura', formato: 'fecha' as const, width: 12 },
      { header: 'Entrega objetivo', key: 'fecha_entrega_objetivo', formato: 'fecha' as const, width: 14 },
      { header: 'Estado', key: 'estado', width: 16 },
      { header: 'Días en proceso', key: 'dias_en_proceso', formato: 'numero' as const, width: 12 },
      { header: 'Atrasada', key: 'atrasada_txt', width: 10 },
    ],
    rows: rows.map((r) => ({ ...r, atrasada_txt: r.atrasada ? 'SÍ' : 'NO' })),
  };

  return (
    <PageShell
      title="Reporte de OTs"
      description={`Abiertas, cerradas y atrasadas en el período`}
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total OTs</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{metricas.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Completadas</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{metricas.completadas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Atrasadas</p>
          <p className={`mt-1 font-display text-2xl font-semibold ${metricas.atrasadas > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {metricas.atrasadas}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Estados distintos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{Object.keys(metricas.por_estado).length}</p>
        </Card>
      </div>

      {Object.keys(metricas.por_estado).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-corp-900">Por estado</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metricas.por_estado).map(([e, n]) => (
                <Badge key={e} variant="secondary" className="text-xs">{e}: <b className="ml-1">{n}</b></Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Estado</label>
          <select name="estado" defaultValue={estado} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {ESTADOS_OT.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Responsable (UUID)</label>
          <input type="text" name="responsable_id" defaultValue={responsable_id} placeholder="opcional" className="h-9 w-44 rounded-md border px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Aplicar</button>
        <Link href="/reportes/ots" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Sin OTs" description="No hay órdenes en el rango." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Apertura</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/ot/${r.id}`} className="hover:text-happy-600">{r.numero}</Link>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{r.producto}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.fecha_apertura)}</TableCell>
                    <TableCell className="text-xs">{r.fecha_entrega_objetivo ? formatDate(r.fecha_entrega_objetivo) : '—'}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{r.estado}</Badge></TableCell>
                    <TableCell className="text-right text-xs font-mono">{r.dias_en_proceso}</TableCell>
                    <TableCell>
                      {r.atrasada && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                          <AlertTriangle className="h-3 w-3" /> ATRASADA
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
