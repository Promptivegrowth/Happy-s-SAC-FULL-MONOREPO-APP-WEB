import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { FilterChip } from '@/components/filter-chip';
import { formatDate, formatPEN } from '@happy/lib';
import { Wallet } from 'lucide-react';

export const metadata = { title: 'Reporte de pagos a talleres' };
export const dynamic = 'force-dynamic';

type SP = { taller?: string; medio?: string; desde?: string; hasta?: string };

const MEDIOS = ['TRANSFERENCIA', 'YAPE', 'PLIN', 'EFECTIVO', 'CHEQUE', 'DEPOSITO', 'OTRO'] as const;

function defaultDesde(): string {
  // Inicio del mes actual
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || defaultDesde();
  const hasta = sp.hasta || new Date().toISOString().slice(0, 10);
  const sb = await createClient();

  // Talleres para filtro
  const { data: talleresData } = await sb
    .from('talleres')
    .select('id, codigo, nombre')
    .order('nombre');
  const talleres = (talleresData ?? []) as { id: string; codigo: string; nombre: string }[];

  // Query principal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  let q = sbAny
    .from('pagos_talleres')
    .select('id, fecha, monto, medio_pago, banco_destino, numero_operacion, concepto, taller_id, talleres(codigo, nombre), os_id, ordenes_servicio(numero)')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .limit(500);
  if (sp.taller) q = q.eq('taller_id', sp.taller);
  if (sp.medio) q = q.eq('medio_pago', sp.medio);

  const { data: pagosData } = await q;
  type Pago = {
    id: string;
    fecha: string;
    monto: number;
    medio_pago: string;
    banco_destino: string | null;
    numero_operacion: string | null;
    concepto: string | null;
    taller_id: string;
    os_id: string | null;
    talleres: { codigo: string; nombre: string } | null;
    ordenes_servicio: { numero: string } | null;
  };
  const pagos = (pagosData ?? []) as Pago[];

  // Totales
  const total = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const porTaller = new Map<string, { nombre: string; total: number; cant: number }>();
  for (const p of pagos) {
    const e = porTaller.get(p.taller_id) ?? {
      nombre: p.talleres?.nombre ?? p.taller_id.slice(0, 8),
      total: 0,
      cant: 0,
    };
    e.total += Number(p.monto);
    e.cant++;
    porTaller.set(p.taller_id, e);
  }
  const topTalleres = [...porTaller.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.taller) sp2.set('taller', sp.taller);
    if (sp.medio) sp2.set('medio', sp.medio);
    if (sp.desde) sp2.set('desde', sp.desde);
    if (sp.hasta) sp2.set('hasta', sp.hasta);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return `/reportes/pagos-talleres${s ? `?${s}` : ''}`;
  }

  return (
    <PageShell
      title="Reporte de pagos a talleres"
      description={`Pagos entre ${formatDate(desde)} y ${formatDate(hasta)}`}
    >
      {/* Cards de resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total pagado en el rango</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(total)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Cantidad de pagos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{pagos.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Talleres distintos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{porTaller.size}</p>
        </Card>
      </div>

      {/* Filtros */}
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
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Taller</label>
          <select name="taller" defaultValue={sp.taller ?? ''} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {talleres.map((t) => (
              <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Medio</label>
          <select name="medio" defaultValue={sp.medio ?? ''} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todos</option>
            {MEDIOS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">
          Aplicar filtros
        </button>
        <Link href="/reportes/pagos-talleres" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">
          Limpiar
        </Link>
      </form>

      {/* Top talleres */}
      {topTalleres.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-corp-900">Top talleres del período</h3>
            <div className="space-y-1.5">
              {topTalleres.map(([id, e]) => {
                const pct = total > 0 ? (e.total / total) * 100 : 0;
                return (
                  <div key={id} className="flex items-center gap-3 text-sm">
                    <Link href={chipUrl({ taller: id })} className="w-48 truncate font-medium text-corp-900 hover:text-happy-600">
                      {e.nombre}
                    </Link>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-happy-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>
                    <span className="w-32 text-right font-mono text-emerald-700">{formatPEN(e.total)}</span>
                    <span className="w-20 text-right text-xs text-slate-500">{e.cant} pagos</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {pagos.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Sin pagos en este rango"
          description="Probá ampliar las fechas o quitar filtros."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Taller</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead>Nº op.</TableHead>
                  <TableHead>OS / Concepto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{formatDate(p.fecha)}</TableCell>
                    <TableCell className="text-sm">
                      <Link href={`/talleres/${p.taller_id}/pagos`} className="font-medium text-corp-900 hover:text-happy-600">
                        {p.talleres?.nombre ?? '—'}
                      </Link>
                      {p.talleres?.codigo && (
                        <span className="ml-1 font-mono text-[10px] text-slate-400">{p.talleres.codigo}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPEN(Number(p.monto))}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{p.medio_pago}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{p.banco_destino ?? '—'}</TableCell>
                    <TableCell className="font-mono text-[10px] text-slate-500">{p.numero_operacion ?? '—'}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-600">
                      {p.ordenes_servicio?.numero ? (
                        <Link href={`/servicios/${p.os_id}`} className="font-mono text-happy-600 hover:underline">
                          {p.ordenes_servicio.numero}
                        </Link>
                      ) : (
                        p.concepto ?? '—'
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
