import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDateTime, formatPEN } from '@happy/lib';
import { BarraFiltro, Paginado, leerFiltro, rangoLima, textoBusqueda, POR_PAGINA } from '@/components/filtro-listado';
import { listarDevolucionesErp } from '@/server/devoluciones-core';

export const metadata = { title: 'Devoluciones y cambios' };
export const dynamic = 'force-dynamic';

/**
 * Desde el 30/09/2026 cada devolución de dinero queda sola en la caja del turno
 * (migración 110). Las anteriores se anotaban a mano como gasto: que no figuren
 * no es una falla.
 */
const REGISTRO_AUTOMATICO_DESDE = '2026-09-30T05:00:00';

/**
 * Devoluciones y cambios hechos en las cajas, para controlarlos desde el ERP.
 *
 * Cada fila dice qué prendas se devolvieron y si entraron al stock, cuánto
 * dinero se devolvió, por qué medio y cuenta, y si la salida quedó en la caja
 * del turno (ver server/devoluciones-core.ts).
 */
export default async function DevolucionesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = leerFiltro(await searchParams);
  const { desde, hasta } = rangoLima(f);
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { filas, total } = await listarDevolucionesErp(sbAny, {
    desde, hasta, q: textoBusqueda(f.q),
    desdeFila: (f.pag - 1) * POR_PAGINA, hastaFila: f.pag * POR_PAGINA - 1,
  });

  const devuelto = filas.reduce((s, d) => s + d.monto_devuelto, 0);
  const porMedio = new Map<string, number>();
  for (const d of filas) if (d.medio && d.monto_devuelto > 0) porMedio.set(d.medio, (porMedio.get(d.medio) ?? 0) + d.monto_devuelto);
  const sinReingreso = filas.filter((d) => d.unidades_reingresadas < d.unidades).length;

  const exportPayload = {
    titulo: 'Devoluciones y cambios',
    subtitulo: f.desde || f.hasta ? `Del ${f.desde || '…'} al ${f.hasta || '…'}` : 'Todas',
    filtros: f.q ? [`Búsqueda: ${f.q}`] : [],
    cols: [
      { header: 'N°', key: 'numero', width: 10 },
      { header: 'Fecha', key: 'fecha_txt', width: 16 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Tienda', key: 'tienda', width: 18 },
      { header: 'Atendió', key: 'atendido_por', width: 20 },
      { header: 'Venta original', key: 'venta_original', width: 14 },
      { header: 'Prendas', key: 'prendas', width: 36 },
      { header: 'Volvieron al stock', key: 'reingreso_txt', width: 16 },
      { header: 'Devuelto', key: 'monto_devuelto', formato: 'moneda' as const, width: 12 },
      { header: 'Medio / cuenta', key: 'medio_txt', width: 20 },
      { header: 'Venta nueva (cambio)', key: 'venta_nueva', width: 14 },
      { header: 'Motivo', key: 'motivo', width: 30 },
    ],
    rows: filas.map((d) => ({
      ...d,
      fecha_txt: formatDateTime(d.fecha),
      tipo: d.tipo === 'CAMBIO' ? 'Cambio' : 'Devolución',
      reingreso_txt: `${d.unidades_reingresadas} de ${d.unidades}${d.almacen_reingreso ? ` · ${d.almacen_reingreso}` : ''}`,
      medio_txt: d.medio ?? '—',
      venta_original: d.venta_original ?? '—',
      venta_nueva: d.venta_nueva ?? '—',
    })),
    totales: { monto_devuelto: devuelto },
  };

  return (
    <PageShell
      title="Devoluciones y cambios"
      description="Lo que se devolvió en las cajas: qué prendas volvieron al stock, cuánto dinero salió y por qué cuenta."
      actions={<ExportButtons payload={exportPayload} />}
    >
      <BarraFiltro base="/devoluciones" f={f} placeholder="N° de devolución o motivo" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Devoluciones y cambios</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{total}</p>
          <p className="text-[10px] text-slate-400">{filas.filter((d) => d.tipo === 'CAMBIO').length} cambio(s) en esta página</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Dinero devuelto</p>
          <p className="mt-1 font-display text-2xl font-semibold text-rose-600">{formatPEN(devuelto)}</p>
          <p className="text-[10px] text-slate-400">
            {[...porMedio.entries()].map(([m, v]) => `${m} ${formatPEN(v)}`).join(' · ') || 'sin devoluciones de dinero'}
          </p>
        </Card>
        <Card className={`p-4 ${sinReingreso > 0 ? 'border-amber-300 bg-amber-50/40' : ''}`}>
          <p className="text-xs text-slate-500">Prendas que volvieron al stock</p>
          <p className={`mt-1 font-display text-2xl font-semibold ${sinReingreso > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {sinReingreso > 0 ? `${sinReingreso} con diferencia` : 'Todas'}
          </p>
          <p className="text-[10px] text-slate-400">comprobado contra el kardex</p>
        </Card>
        <Card className="p-4 text-[11px] leading-relaxed text-slate-600">
          La salida de dinero de cada devolución la registra el sistema en la caja del turno.
          La cajera <b>no la escribe ni la puede borrar</b>; en el cuadre aparece como «Automático».
        </Card>
      </div>

      <Paginado base="/devoluciones" f={f} total={total} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tienda · atendió</TableHead>
                <TableHead>Venta</TableHead>
                <TableHead>Prendas</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead className="text-right">Devuelto</TableHead>
                <TableHead>Medio / cuenta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                    No hay devoluciones con esos filtros.
                  </TableCell>
                </TableRow>
              )}
              {filas.map((d) => {
                const completo = d.unidades_reingresadas >= d.unidades;
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-mono text-sm font-semibold">{d.numero}</div>
                      <Badge variant={d.tipo === 'CAMBIO' ? 'secondary' : 'destructive'} className="text-[9px]">
                        {d.tipo === 'CAMBIO' ? 'Cambio' : 'Devolución'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateTime(d.fecha)}</TableCell>
                    <TableCell className="text-xs">
                      {d.tienda}
                      <div className="text-slate-500">{d.atendido_por}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{d.venta_original ?? '—'}</div>
                      {d.venta_nueva && <div className="text-slate-500">→ nueva {d.venta_nueva}</div>}
                    </TableCell>
                    <TableCell className="max-w-xs text-xs">
                      {d.prendas}
                      {d.motivo && <div className="text-slate-500">Motivo: {d.motivo}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className={`inline-flex items-center gap-1 ${completo ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {completo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                        {d.unidades_reingresadas} de {d.unidades}
                      </span>
                      {d.almacen_reingreso && <div className="text-slate-500">{d.almacen_reingreso}</div>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {d.monto_devuelto > 0 ? formatPEN(d.monto_devuelto) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.medio ?? (d.tipo === 'CAMBIO' ? 'Sin dinero (cambio)' : '—')}
                      {d.monto_devuelto > 0 && d.medio !== 'Saldo a favor' && (
                        <div className={d.salida_en_caja || d.fecha < REGISTRO_AUTOMATICO_DESDE ? 'text-emerald-700' : 'text-amber-700'}>
                          {d.salida_en_caja
                            ? 'registrada en la caja'
                            : d.fecha < REGISTRO_AUTOMATICO_DESDE
                              ? 'anterior al registro automático'
                              : 'no figura en la caja'}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Paginado base="/devoluciones" f={f} total={total} />
    </PageShell>
  );
}
