import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { History, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate } from '@happy/lib';
import { reporteMovimientos, listarAlmacenesLookup } from '@/server/actions/reportes';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Movimientos de inventario' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; almacen?: string };

const PEN = (n: number) =>
  `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NUM = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 2 });

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const almacen_id = sp.almacen ?? '';

  const [resultado, almacenes] = await Promise.all([
    reporteMovimientos({ desde, hasta, almacen_id }),
    listarAlmacenesLookup(),
  ]);
  const { metricas, rows } = resultado;

  const exportPayload = {
    titulo: 'Movimientos de inventario (resumen por tipo)',
    subtitulo: `${formatDate(desde)} - ${formatDate(hasta)}`,
    filtros: [
      `Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`,
      almacen_id
        ? `Almacén: ${almacenes.find((a) => a.id === almacen_id)?.codigo ?? almacen_id}`
        : 'Almacén: Todos',
    ],
    cols: [
      { header: 'Tipo movimiento', key: 'tipo', width: 28 },
      { header: 'Sentido', key: 'signo', width: 12 },
      { header: '# Movimientos', key: 'movimientos', formato: 'numero' as const, width: 14 },
      { header: 'Cantidad total', key: 'cantidad_total', formato: 'numero' as const, width: 14 },
      { header: 'Valor total', key: 'valor_total', formato: 'moneda' as const, width: 14 },
    ],
    rows,
  };

  return (
    <PageShell
      title="Movimientos de inventario"
      description="Resumen agregado por tipo de movimiento del kardex"
      actions={<ExportButtons payload={exportPayload} />}
    >
      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={desde}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={hasta}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">Almacén</span>
            <select
              name="almacen"
              defaultValue={almacen_id}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm"
            >
              <option value="">Todos</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" variant="premium" size="sm">
              Filtrar
            </Button>
            <Link href="/reportes/inventario/movimientos">
              <Button type="button" variant="outline" size="sm">
                Limpiar
              </Button>
            </Link>
          </div>
        </form>
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="border-emerald-200 bg-emerald-50/40 p-4">
          <p className="text-xs text-emerald-700">Entradas (cantidad)</p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-semibold text-emerald-800">
            <ArrowDownCircle className="h-5 w-5" />
            {NUM(metricas.total_entradas)}
          </p>
          <p className="text-[10px] text-emerald-700">Valor: {PEN(metricas.valor_entradas)}</p>
        </Card>
        <Card className="border-rose-200 bg-rose-50/40 p-4">
          <p className="text-xs text-rose-700">Salidas (cantidad)</p>
          <p className="mt-1 flex items-center gap-1 font-display text-2xl font-semibold text-rose-800">
            <ArrowUpCircle className="h-5 w-5" />
            {NUM(metricas.total_salidas)}
          </p>
          <p className="text-[10px] text-rose-700">Valor: {PEN(metricas.valor_salidas)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Neto (valor)</p>
          <p
            className={`mt-1 font-display text-2xl font-semibold ${
              metricas.neto_valor >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {PEN(metricas.neto_valor)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total movimientos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">
            {rows.reduce((s, r) => s + r.movimientos, 0)}
          </p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="Sin movimientos"
          description="No hay movimientos de inventario en el período seleccionado."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de movimiento</TableHead>
                  <TableHead>Sentido</TableHead>
                  <TableHead className="text-right"># Movimientos</TableHead>
                  <TableHead className="text-right">Cantidad total</TableHead>
                  <TableHead className="text-right">Valor total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.tipo}>
                    <TableCell className="text-sm font-medium">{r.tipo.replace(/_/g, ' ')}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.signo === 'ENTRADA' ? 'success' : r.signo === 'SALIDA' ? 'destructive' : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {r.signo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.movimientos}</TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-semibold ${
                        r.signo === 'ENTRADA' ? 'text-emerald-700' : r.signo === 'SALIDA' ? 'text-rose-700' : 'text-corp-900'
                      }`}
                    >
                      {r.signo === 'ENTRADA' ? '+' : r.signo === 'SALIDA' ? '−' : ''}
                      {NUM(r.cantidad_total)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-slate-700">
                      {r.valor_total > 0 ? PEN(r.valor_total) : <span className="text-slate-300">—</span>}
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
