import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Wallet, ArrowRight } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDateTime, formatPEN } from '@happy/lib';
import { listarCuadres, listarCajasLookup } from '@/server/actions/cuadres-caja';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Cuadres de caja' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; caja_id?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();
  const caja_id = sp.caja_id || '';

  const [rows, cajas] = await Promise.all([
    listarCuadres({ desde, hasta, caja_id }),
    listarCajasLookup(),
  ]);

  const cerrados = rows.filter((r) => !r.abierta);
  const totalVendido = rows.reduce((s, r) => s + r.total_vendido, 0);
  const descuadre = cerrados.reduce((s, r) => s + Math.abs(r.diferencia ?? 0), 0);
  const conDiferencia = cerrados.filter((r) => Math.abs(r.diferencia ?? 0) > 0.009).length;

  const exportPayload = {
    titulo: 'Cuadres de caja',
    subtitulo: `Del ${desde} al ${hasta}`,
    filtros: [
      `Desde ${desde} hasta ${hasta}`,
      caja_id ? `Caja: ${cajas.find((c) => c.id === caja_id)?.nombre ?? caja_id}` : 'Caja: Todas',
    ],
    cols: [
      { header: 'Apertura', key: 'abierta_en', formato: 'fecha' as const, width: 18 },
      { header: 'Cierre', key: 'cerrada_txt', width: 18 },
      { header: 'Caja', key: 'caja_nombre', width: 20 },
      { header: 'Tienda', key: 'almacen_nombre', width: 20 },
      { header: 'Abrió', key: 'abierta_por', width: 22 },
      { header: 'Cerró', key: 'cerro_txt', width: 22 },
      { header: 'Ventas', key: 'cantidad_ventas', formato: 'numero' as const, width: 10 },
      { header: 'Total vendido', key: 'total_vendido', formato: 'moneda' as const, width: 16 },
      { header: 'Efectivo cobrado', key: 'total_efectivo', formato: 'moneda' as const, width: 16 },
      { header: 'Otros medios (banco)', key: 'otros_medios', formato: 'moneda' as const, width: 18 },
      { header: 'Apertura S/', key: 'monto_apertura', formato: 'moneda' as const, width: 14 },
      { header: 'Caja chica', key: 'total_gastos', formato: 'moneda' as const, width: 14 },
      { header: 'Efectivo esperado', key: 'efectivo_esperado', formato: 'moneda' as const, width: 18 },
      { header: 'Efectivo contado', key: 'contado_txt', width: 18 },
      { header: 'Diferencia', key: 'diferencia_txt', width: 14 },
    ],
    rows: rows.map((r) => ({
      ...r,
      cerrada_txt: r.cerrada_en ? formatDateTime(r.cerrada_en) : 'ABIERTA',
      otros_medios: Math.max(0, r.total_vendido - r.total_efectivo),
      cerro_txt: r.cerrada_por ?? '—',
      contado_txt: r.efectivo_contado === null ? '—' : formatPEN(r.efectivo_contado),
      diferencia_txt: r.diferencia === null ? '—' : formatPEN(r.diferencia),
    })) as unknown as Record<string, unknown>[],
    totales: { total_vendido: totalVendido },
  };

  return (
    <PageShell
      title="Cuadres de caja"
      description={`Todos los turnos del ${desde} al ${hasta}. Entrá a uno para ver el arqueo completo e imprimirlo.`}
      actions={<ExportButtons payload={exportPayload} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Turnos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{rows.length}</p>
          <p className="text-[10px] text-slate-400">{cerrados.length} cerrados</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total vendido</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(totalVendido)}</p>
        </Card>
        <Card className={`p-4 ${conDiferencia > 0 ? 'border-amber-300 bg-amber-50/40' : ''}`}>
          <p className="text-xs text-slate-500">Turnos con diferencia</p>
          <p className={`mt-1 font-display text-2xl font-semibold ${conDiferencia > 0 ? 'text-amber-700' : 'text-corp-900'}`}>
            {conDiferencia}
          </p>
          <p className="text-[10px] text-slate-400">de {cerrados.length} cerrados</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Descuadre acumulado</p>
          <p className={`mt-1 font-display text-2xl font-semibold ${descuadre > 0.009 ? 'text-amber-700' : 'text-corp-900'}`}>
            {formatPEN(descuadre)}
          </p>
          <p className="text-[10px] text-slate-400">suma de faltantes y sobrantes</p>
        </Card>
      </div>

      <p className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs leading-relaxed text-sky-900">
        <b>Vendido</b> es todo lo cobrado, por cualquier medio. <b>Esperado en el cajón</b> es sólo la
        plata física: el fondo de apertura más lo cobrado en efectivo, menos los gastos de caja chica.
        Lo que entró por Yape, Plin, transferencia o tarjeta va al banco y nunca pasa por el cajón, así
        que las dos cifras no tienen por qué coincidir — y casi nunca coinciden.
      </p>

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
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Caja</label>
          <select name="caja_id" defaultValue={caja_id} className="h-9 rounded-md border bg-white px-2 text-sm">
            <option value="">Todas</option>
            {cajas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-medium text-white hover:bg-happy-600">Aplicar</button>
        <Link href="/reportes/cuadres-caja" className="h-9 rounded-md border px-3 text-sm leading-9 hover:bg-slate-50">Limpiar</Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Sin turnos en el período"
          description="No se abrió ninguna caja entre esas fechas."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Turno</TableHead>
                  <TableHead>Caja / Tienda</TableHead>
                  <TableHead>Cajero</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">
                    Vendido
                    <span className="block text-[9px] font-normal normal-case text-slate-400">todos los medios</span>
                  </TableHead>
                  <TableHead className="text-right">
                    Esperado en el cajón
                    <span className="block text-[9px] font-normal normal-case text-slate-400">apertura + efectivo − caja chica</span>
                  </TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">Cuadre</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const dif = r.diferencia;
                  const cuadra = dif !== null && Math.abs(dif) < 0.009;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        <div className="font-medium text-corp-900">{formatDateTime(r.abierta_en)}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.cerrada_en ? `cerró ${formatDateTime(r.cerrada_en)}` : 'sigue abierta'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{r.caja_nombre}</div>
                        <div className="text-[10px] text-slate-400">{r.almacen_nombre}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{r.abierta_por}</div>
                        {r.cerrada_por && r.cerrada_por !== r.abierta_por && (
                          <div className="text-[10px] text-slate-400">cerró: {r.cerrada_por}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm">{r.cantidad_ventas}</TableCell>
                      {/*
                        * Debajo del total, en que se reparte.
                        *
                        * Javier pregunto por que "Vendido S/1,541" no cuadra con
                        * "Efectivo S/451": porque el resto se cobro por Yape,
                        * Plin o transferencia y nunca pasa por el cajon. La
                        * columna sola no lo decia y obligaba a entrar al detalle.
                        */}
                      <TableCell className="text-right">
                        <div className="text-sm font-semibold text-emerald-700">{formatPEN(r.total_vendido)}</div>
                        <div className="text-[10px] text-slate-400">
                          efectivo {formatPEN(r.total_efectivo)} · otros {formatPEN(Math.max(0, r.total_vendido - r.total_efectivo))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatPEN(r.efectivo_esperado)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {r.efectivo_contado === null ? <span className="text-slate-400">—</span> : formatPEN(r.efectivo_contado)}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${
                        dif === null ? 'text-slate-400' : cuadra ? 'text-slate-500' : dif < 0 ? 'text-red-600' : 'text-sky-700'
                      }`}>
                        {dif === null ? '—' : formatPEN(dif)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.abierta
                          ? <Badge variant="warning">Abierta</Badge>
                          : cuadra
                            ? <Badge variant="success">Cuadra</Badge>
                            : <Badge variant="destructive">{(dif ?? 0) < 0 ? 'Falta' : 'Sobra'}</Badge>}
                        <Link
                          href={`/reportes/cuadres-caja/${r.id}`}
                          className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-happy-600 hover:underline"
                        >
                          Ver <ArrowRight className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
