import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDateTime, formatPEN } from '@happy/lib';
import { detalleCuadre } from '@/server/actions/cuadres-caja';

export const metadata = { title: 'Cuadre de caja' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await detalleCuadre(id);
  if (!d) notFound();

  const { cabecera: c, arqueo, movimientos, ventas, cierres_parciales } = d;
  const dif = c.diferencia;
  const cuadra = dif !== null && Math.abs(dif) < 0.009;

  const encabezado = [
    `${c.caja_nombre} · ${c.almacen_nombre}`,
    `Abrió ${formatDateTime(c.abierta_en)} — ${c.abierta_por}`,
    c.cerrada_en ? `Cerró ${formatDateTime(c.cerrada_en)} — ${c.cerrada_por ?? '—'}` : 'Turno todavía abierto',
  ];

  /*
   * Tres documentos y no uno solo.
   *
   * El arqueo es lo que se firma y se archiva; el detalle de ventas es lo que
   * se revisa cuando el arqueo no cierra. Meterlos en la misma hoja obliga a
   * imprimir ochenta filas para guardar un cuadre de diez renglones.
   */
  const exportArqueo = {
    titulo: 'Arqueo de caja',
    subtitulo: `${c.caja_nombre} · ${formatDateTime(c.abierta_en)}`,
    filtros: encabezado,
    cols: [
      { header: 'Medio de pago', key: 'etiqueta', width: 34 },
      { header: 'Operaciones', key: 'cantidad', formato: 'numero' as const, width: 14 },
      { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 16 },
    ],
    rows: arqueo as unknown as Record<string, unknown>[],
    totales: { monto: arqueo.reduce((s, a) => s + a.monto, 0) },
  };

  const exportVentas = {
    titulo: 'Ventas del turno',
    subtitulo: `${c.caja_nombre} · ${formatDateTime(c.abierta_en)}`,
    filtros: encabezado,
    cols: [
      { header: 'Hora', key: 'fecha', formato: 'fecha' as const, width: 18 },
      { header: 'Comprobante', key: 'documento', width: 18 },
      { header: 'Tipo', key: 'tipo_documento', width: 14 },
      { header: 'N° interno', key: 'numero', width: 14 },
      { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Vendedor', key: 'vendedor', width: 24 },
      { header: 'Medios de pago', key: 'pagos', width: 44 },
      { header: 'Total', key: 'total', formato: 'moneda' as const, width: 14 },
    ],
    rows: ventas as unknown as Record<string, unknown>[],
    totales: { total: ventas.filter((v) => !v.anulada).reduce((s, v) => s + v.total, 0) },
  };

  const exportMovs = {
    titulo: 'Movimientos de caja chica',
    subtitulo: `${c.caja_nombre} · ${formatDateTime(c.abierta_en)}`,
    filtros: encabezado,
    cols: [
      { header: 'Hora', key: 'fecha', formato: 'fecha' as const, width: 18 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Concepto', key: 'concepto', width: 40 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Registró', key: 'registrado_por', width: 24 },
      { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 14 },
    ],
    rows: movimientos as unknown as Record<string, unknown>[],
  };

  return (
    <PageShell
      title={`Cuadre · ${c.caja_nombre}`}
      description={`${formatDateTime(c.abierta_en)} — ${c.cerrada_en ? formatDateTime(c.cerrada_en) : 'abierta'} · ${c.abierta_por}`}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/reportes/cuadres-caja" className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm hover:bg-slate-50">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </Link>
          <ExportButtons payload={exportArqueo} />
        </div>
      }
    >
      {/* ─────────── El cuadre, que es la pregunta del jefe ─────────── */}
      <Card className={cuadra ? 'border-emerald-200 bg-emerald-50/50' : c.abierta ? '' : 'border-amber-300 bg-amber-50/50'}>
        <CardContent className="py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Dato etiqueta="Fondo de apertura" valor={formatPEN(c.monto_apertura)} />
            <Dato etiqueta="Efectivo cobrado" valor={formatPEN(c.total_efectivo)}
                  ayuda={`${c.cantidad_ventas} venta(s), ${formatPEN(c.total_vendido)} en total`} />
            <Dato etiqueta="Caja chica" valor={formatPEN(c.total_gastos)}
                  ayuda="gastos e ingresos del turno" />
            <Dato etiqueta="Efectivo esperado" valor={formatPEN(c.efectivo_esperado)}
                  ayuda="apertura + efectivo + caja chica" />
            <Dato
              etiqueta="Contado por el cajero"
              valor={c.efectivo_contado === null ? '—' : formatPEN(c.efectivo_contado)}
              ayuda={
                c.abierta ? 'el turno sigue abierto'
                  : cuadra ? 'cuadra exacto'
                    : `${(dif ?? 0) < 0 ? 'falta' : 'sobra'} ${formatPEN(Math.abs(dif ?? 0))}`
              }
              alerta={!c.abierta && !cuadra}
            />
          </div>
          {c.observaciones && (
            <p className="mt-3 border-t pt-2 text-xs text-slate-600">
              <b>Observaciones del cierre:</b> {c.observaciones}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ─────────── El desglose por cuenta ─────────── */}
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-1 font-display text-sm font-semibold text-corp-900">Arqueo por medio de pago</h3>
          <p className="mb-3 text-xs text-slate-500">
            Los mismos renglones que los botones de cobro del POS. Un renglón en cero significa que
            por ahí no entró nada en el turno, y eso también es información.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medio de pago</TableHead>
                <TableHead className="text-right">Operaciones</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arqueo.map((a, i) => (
                <TableRow key={`${a.metodo}-${a.referencia ?? i}`} className={a.monto === 0 ? 'text-slate-400' : ''}>
                  <TableCell className="text-sm">{a.etiqueta}</TableCell>
                  <TableCell className="text-right text-sm">{a.cantidad}</TableCell>
                  <TableCell className="text-right text-sm font-semibold">{formatPEN(a.monto)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-slate-50">
                <TableCell className="text-sm font-semibold">Total cobrado</TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  {arqueo.reduce((s, a) => s + a.cantidad, 0)}
                </TableCell>
                <TableCell className="text-right text-sm font-semibold">
                  {formatPEN(arqueo.reduce((s, a) => s + a.monto, 0))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─────────── Cambios de turno ─────────── */}
      {cierres_parciales.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-display text-sm font-semibold text-corp-900">Cambios de turno</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Sale</TableHead><TableHead>Entra</TableHead>
                  <TableHead className="text-right">Ventas</TableHead>
                  <TableHead className="text-right">Esperado</TableHead>
                  <TableHead className="text-right">Contado</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cierres_parciales.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{formatDateTime(p.fecha)}</TableCell>
                    <TableCell className="text-xs">{p.cajero_saliente}</TableCell>
                    <TableCell className="text-xs">{p.cajero_entrante}</TableCell>
                    <TableCell className="text-right text-sm">{formatPEN(p.total_ventas)}</TableCell>
                    <TableCell className="text-right text-sm">{formatPEN(p.efectivo_esperado)}</TableCell>
                    <TableCell className="text-right text-sm">{formatPEN(p.efectivo_contado)}</TableCell>
                    <TableCell className={`text-right text-sm font-semibold ${Math.abs(p.diferencia) < 0.009 ? 'text-slate-500' : 'text-amber-700'}`}>
                      {formatPEN(p.diferencia)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─────────── Caja chica ─────────── */}
      {movimientos.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-corp-900">Movimientos de caja chica</h3>
              <ExportButtons payload={exportMovs} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead><TableHead>Tipo</TableHead><TableHead>Concepto</TableHead>
                  <TableHead>Registró</TableHead><TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{formatDateTime(m.fecha)}</TableCell>
                    <TableCell>
                      <Badge variant={String(m.tipo).toUpperCase() === 'INGRESO' ? 'success' : 'destructive'} className="text-[10px]">
                        {m.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{m.concepto}</TableCell>
                    <TableCell className="text-xs">{m.registrado_por}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatPEN(m.monto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─────────── Ventas del turno ─────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-corp-900">
              Ventas del turno ({ventas.length})
            </h3>
            <ExportButtons payload={exportVentas} />
          </div>
          {ventas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Este turno no registró ventas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hora</TableHead><TableHead>Comprobante</TableHead>
                  <TableHead>Cliente</TableHead><TableHead>Vendedor</TableHead>
                  <TableHead>Medios de pago</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.map((v) => (
                  <TableRow key={v.venta_id} className={v.anulada ? 'opacity-50 line-through' : ''}>
                    <TableCell className="text-xs">{formatDateTime(v.fecha)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="font-semibold text-corp-900">{v.documento}</div>
                      <div className="text-[10px] font-normal text-slate-400">{v.numero}</div>
                    </TableCell>
                    <TableCell className="text-xs">{v.cliente}</TableCell>
                    <TableCell className="text-xs">{v.vendedor}</TableCell>
                    <TableCell className="text-xs text-slate-600">{v.pagos}</TableCell>
                    <TableCell className="text-right text-sm font-semibold">{formatPEN(v.total)}</TableCell>
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

function Dato({ etiqueta, valor, ayuda, alerta }: {
  etiqueta: string; valor: string; ayuda?: string; alerta?: boolean;
}) {
  return (
    <div className={`rounded-lg border bg-white p-3 ${alerta ? 'border-amber-300' : ''}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{etiqueta}</p>
      <p className={`mt-0.5 font-display text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-corp-900'}`}>{valor}</p>
      {ayuda && <p className="text-[10px] text-slate-400">{ayuda}</p>}
    </div>
  );
}
