import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatTallaChip, formatPEN } from '@happy/lib';
import { reporteTrazabilidadDetalle } from '@/server/actions/reportes-produccion2';

export const metadata = { title: 'Trazabilidad · detalle' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string; almacen?: string };

const dma = (iso: string) => iso.split('-').reverse().join('/');
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const n = (x: number) => x.toLocaleString('es-PE', { maximumFractionDigits: 2 });

/**
 * Una talla de punta a punta: dónde está hoy (y si el kárdex cuadra con el
 * stock), cada venta con su vendedor, comprobante, pago y cliente, y cada
 * movimiento con el saldo que dejó en su almacén.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ varianteId: string }>; searchParams: Promise<SP> }) {
  const { varianteId } = await params;
  const sp = await searchParams;
  const filtros = { desde: sp.desde || undefined, hasta: sp.hasta || undefined, almacenId: sp.almacen || undefined };
  const d = await reporteTrazabilidadDetalle(varianteId, filtros);
  if (!d) notFound();

  const almElegido = d.almacenes.find((a) => a.id === filtros.almacenId);
  const periodo = [
    filtros.desde || filtros.hasta ? `Del ${filtros.desde ? dma(filtros.desde) : 'inicio'} al ${filtros.hasta ? dma(filtros.hasta) : 'hoy'}` : 'Todas las fechas',
    almElegido ? almElegido.nombre : 'Todos los almacenes',
  ];
  const qsVolver = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const titulo = `${d.variante.producto_nombre} · talla ${formatTallaChip(d.variante.talla)}`;
  const ventasValidas = d.ventas.filter((v) => v.estado !== 'ANULADA');
  const totalUnidades = ventasValidas.reduce((s, v) => s + v.cantidad, 0);
  const totalMonto = ventasValidas.reduce((s, v) => s + v.monto, 0);
  const stockHoy = d.control.reduce((s, c) => s + c.stock, 0);
  const descuadres = d.control.filter((c) => Math.abs(c.stock - c.kardex) > 0.001);

  const exportVentas = {
    titulo: `Ventas · ${titulo}`, subtitulo: `SKU ${d.variante.sku}`, filtros: periodo,
    cols: [
      { header: 'Fecha', key: 'fecha_txt', width: 17 }, { header: 'Venta', key: 'venta', width: 12 }, { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Tienda', key: 'tienda', width: 16 }, { header: 'Vendedor', key: 'vendedor', width: 20 }, { header: 'Comprobante', key: 'comprobante', width: 24 },
      { header: 'Medio de pago', key: 'pago', width: 34 }, { header: 'Cant.', key: 'cantidad', formato: 'numero' as const, width: 7 },
      { header: 'Precio', key: 'precio', formato: 'moneda' as const, width: 10 }, { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 11 },
      { header: 'Total venta', key: 'total_venta', formato: 'moneda' as const, width: 12 },
      { header: 'Cliente', key: 'cliente', width: 28 }, { header: 'Documento', key: 'documento', width: 14 },
    ],
    rows: d.ventas.map((v) => ({ ...v, fecha_txt: fechaHora(v.fecha) })),
    totales: { cantidad: totalUnidades, monto: +totalMonto.toFixed(2) },
  };
  const exportMovs = {
    titulo: `Movimientos · ${titulo}`, subtitulo: `SKU ${d.variante.sku} · saldo por almacén después de cada movimiento`, filtros: periodo,
    cols: [
      { header: 'Fecha', key: 'fecha_txt', width: 17 }, { header: 'Almacén', key: 'almacen', width: 20 }, { header: 'Movimiento', key: 'tipo', width: 20 },
      { header: 'Detalle', key: 'detalle', width: 44 }, { header: 'Cantidad', key: 'cantidad', formato: 'numero' as const, width: 10 },
      { header: 'Saldo del almacén', key: 'saldo', formato: 'numero' as const, width: 12 }, { header: 'Usuario', key: 'usuario', width: 20 },
    ],
    rows: d.movimientos.map((m) => ({ ...m, fecha_txt: fechaHora(m.fecha) })),
  };

  return (
    <PageShell
      title={titulo}
      description={`SKU ${d.variante.sku} · ${periodo.join(' · ')}`}
      actions={
        <Link href={`/reportes/trazabilidad-modelo${qsVolver ? `?${qsVolver}` : ''}`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-corp-900">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>
      }
    >
      {/* Dónde está hoy, y si el kárdex respalda ese stock */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {d.control.map((c) => {
          const ok = Math.abs(c.stock - c.kardex) <= 0.001;
          return (
            <Card key={c.almacen_id} className="p-4">
              <p className="text-xs text-slate-500">{c.almacen}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{n(c.stock)}</p>
              <p className={`mt-1 flex items-center gap-1 text-[11px] ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {ok ? 'Cuadra con el kárdex' : `El kárdex da ${n(c.kardex)}`}
              </p>
            </Card>
          );
        })}
        <Card className="bg-slate-50 p-4">
          <p className="text-xs text-slate-500">Stock total hoy</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{n(stockHoy)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Vendido en el período: <b>{n(totalUnidades)}</b> · {formatPEN(totalMonto)}</p>
        </Card>
      </div>
      {descuadres.length > 0 && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          El stock registrado no coincide con la suma de movimientos en {descuadres.map((c) => c.almacen).join(', ')}. Conviene revisarlo con soporte.
        </p>
      )}

      {/* Ventas */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 p-3">
          <div>
            <h3 className="text-sm font-semibold text-corp-900">Ventas ({d.ventas.length})</h3>
            <p className="text-[11px] text-slate-500">Quién vendió, con qué comprobante, cómo se pagó y quién compró. Las anuladas se muestran pero no suman.</p>
          </div>
          <ExportButtons payload={exportVentas} />
        </div>
        {d.ventas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Sin ventas de esta talla en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Venta</TableHead><TableHead>Tienda</TableHead><TableHead>Vendedor</TableHead>
                  <TableHead>Comprobante</TableHead><TableHead>Medio de pago</TableHead>
                  <TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Monto</TableHead><TableHead className="text-right">Total venta</TableHead><TableHead>Cliente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.ventas.map((v, i) => (
                  <TableRow key={`${v.venta}-${i}`} className={v.estado === 'ANULADA' ? 'opacity-50' : ''}>
                    <TableCell className="whitespace-nowrap text-xs">{fechaHora(v.fecha)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {v.venta}
                      {v.estado === 'ANULADA' && <Badge variant="destructive" className="ml-1 text-[9px]">Anulada</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{v.tienda}</TableCell>
                    <TableCell className="text-xs">{v.vendedor}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-[11px]">{v.comprobante}</TableCell>
                    <TableCell className="max-w-[220px] text-[11px]">{v.pago}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{n(v.cantidad)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatPEN(v.precio)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{formatPEN(v.monto)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">{formatPEN(v.total_venta)}</TableCell>
                    <TableCell className="text-xs">{v.cliente}{v.documento && <div className="text-[10px] text-slate-500">{v.documento}</div>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Movimientos */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 p-3">
          <div>
            <h3 className="text-sm font-semibold text-corp-900">Movimientos ({d.movimientos.length})</h3>
            <p className="text-[11px] text-slate-500">Cada entrada y salida, del más reciente al más antiguo, con el saldo que quedó en ese almacén.</p>
          </div>
          <ExportButtons payload={exportMovs} />
        </div>
        {d.movimientos.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Sin movimientos en el período.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Almacén</TableHead><TableHead>Movimiento</TableHead><TableHead>Detalle</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Saldo</TableHead><TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.movimientos.map((m, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-xs">{fechaHora(m.fecha)}</TableCell>
                    <TableCell className="text-xs">{m.almacen}</TableCell>
                    <TableCell className="text-xs font-medium">{m.tipo}</TableCell>
                    <TableCell className="max-w-[340px] text-[11px] text-slate-600">{m.detalle}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${m.cantidad < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{m.cantidad > 0 ? '+' : ''}{n(m.cantidad)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">{n(m.saldo)}</TableCell>
                    <TableCell className="text-xs text-slate-500">{m.usuario || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
