import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { esGerente } from '@/server/actions/_helpers';
import { lineasPrevistasOS, aviosPrevistosOS, precioPorLinea } from '@/server/os-preview';
import { formatDateTime, formatPEN, formatTallaChip, formatDate } from '@happy/lib';
import { AprobarRechazarSolicitud } from '../client';

export const metadata = { title: 'Detalle de solicitud de OS' };
export const dynamic = 'force-dynamic';

const PROCESO: Record<string, string> = { COSTURA: 'Confección', OJAL_BOTON: 'Ojal y botón' };
const COLOR: Record<string, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  PENDIENTE: 'warning', APROBADA: 'success', RECHAZADA: 'destructive', ANULADA: 'secondary',
};

type Payload = {
  ot_id?: string; corte_id?: string | null; taller_id?: string; proceso?: string; monto_base?: number;
  tallas_seleccionadas?: string[]; fecha_envio?: string | null; fecha_entrega_esperada?: string | null;
  observaciones?: string | null; cuidados?: string | null; consideraciones?: string | null;
};

/**
 * Lo que va a salir en la OS, antes de aprobarla (pedido de Javier,
 * 13/10/2026: sin esto gerencia aprobaba sin saber a qué se refería). Se arma
 * con el mismo código que crea la OS (os-preview): prendas por talla, tarifa,
 * avíos y montos.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const gerente = await esGerente();

  const { data: s } = await sbAny.from('solicitudes_os')
    .select('id, estado, created_at, resuelto_en, proceso, monto_base, movilidad_por_unidad, campana_por_unidad, es_campana, motivo_solicitud, motivo_rechazo, solicitante_id, ot_id, taller_id, os_generada_id, payload')
    .eq('id', id).maybeSingle();
  if (!s) notFound();
  const p = (s.payload ?? {}) as Payload;
  const proceso = (s.proceso ?? p.proceso ?? 'COSTURA') as string;

  const [{ data: ot }, { data: taller }, { data: solicitante }] = await Promise.all([
    s.ot_id ? sbAny.from('ot').select('numero, estado').eq('id', s.ot_id).maybeSingle() : Promise.resolve({ data: null }),
    s.taller_id ? sbAny.from('talleres').select('nombre, telefono, contacto_nombre').eq('id', s.taller_id).maybeSingle() : Promise.resolve({ data: null }),
    s.solicitante_id ? sbAny.from('perfiles').select('nombre_completo').eq('id', s.solicitante_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // Prendas y avíos: el mismo cálculo que hace la OS al crearse.
  const lineas = await lineasPrevistasOS(sbAny, { corteId: p.corte_id, otId: s.ot_id ?? p.ot_id, tallas: p.tallas_seleccionadas ?? [] });
  const prodIds = [...new Set(lineas.map((l) => l.producto_id))];
  const { data: prods } = prodIds.length ? await sbAny.from('productos').select('id, nombre, codigo').in('id', prodIds) : { data: [] };
  const prodDe = new Map(((prods ?? []) as { id: string; nombre: string; codigo: string }[]).map((x) => [x.id, x]));
  const montoBase = Number(s.monto_base ?? p.monto_base ?? 0);
  const precios = await precioPorLinea(sbAny, s.taller_id, proceso, lineas, montoBase);
  const unidades = lineas.reduce((x, l) => x + l.cantidad, 0);

  const aviosTot = new Map<string, number>();
  for (const pid of prodIds) {
    const m = new Map<string, number>();
    for (const l of lineas.filter((x) => x.producto_id === pid)) m.set(l.talla, (m.get(l.talla) ?? 0) + l.cantidad);
    for (const [mat, c] of await aviosPrevistosOS(sbAny, pid, m, proceso)) aviosTot.set(mat, (aviosTot.get(mat) ?? 0) + c);
  }
  const matIds = [...aviosTot.keys()];
  const { data: mats } = matIds.length ? await sbAny.from('materiales').select('id, nombre, codigo, categoria, unidad_consumo_id').in('id', matIds) : { data: [] };
  const udIds = [...new Set(((mats ?? []) as { unidad_consumo_id: string | null }[]).map((m) => m.unidad_consumo_id).filter(Boolean))];
  const { data: uds } = udIds.length ? await sbAny.from('unidades_medida').select('id, codigo').in('id', udIds) : { data: [] };
  const udDe = new Map(((uds ?? []) as { id: string; codigo: string }[]).map((u) => [u.id, u.codigo]));
  const avios = ((mats ?? []) as { id: string; nombre: string; codigo: string; categoria: string | null; unidad_consumo_id: string | null }[])
    .map((m) => ({ ...m, cantidad: aviosTot.get(m.id) ?? 0, unidad: m.unidad_consumo_id ? udDe.get(m.unidad_consumo_id) ?? '—' : '—' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const esConfeccion = proceso === 'COSTURA';
  const movUnit = esConfeccion ? Number(s.movilidad_por_unidad ?? 0) : 0;
  const campUnit = esConfeccion && s.es_campana ? Number(s.campana_por_unidad ?? 0) : 0;
  const movilidad = Math.round(movUnit * unidades * 100) / 100;
  const campana = Math.round(campUnit * unidades * 100) / 100;
  const total = Math.round((montoBase + movilidad + campana) * 100) / 100;
  const tarifario = precios.porLinea.reduce((x, l) => x + (l.subtotal ?? 0), 0);

  return (
    <PageShell
      title={`Solicitud de OS · ${ot?.numero ?? 'OT'}`}
      description={`${PROCESO[proceso] ?? proceso} · ${taller?.nombre ?? 'Taller'} · solicitada por ${solicitante?.nombre_completo ?? '—'} el ${formatDateTime(s.created_at)}`}
      actions={
        <Link href="/servicios/solicitudes"><Button variant="outline" className="gap-1"><ArrowLeft className="h-4 w-4" /> Volver</Button></Link>
      }
    >
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Badge variant={COLOR[s.estado] ?? 'secondary'}>{s.estado}</Badge>
          {s.estado === 'APROBADA' && s.os_generada_id && (
            <Link href={`/servicios/${s.os_generada_id}`} className="text-sm text-happy-700 hover:underline">Ver la OS emitida →</Link>
          )}
          {s.estado === 'RECHAZADA' && s.motivo_rechazo && <span className="text-sm text-rose-700">Motivo: {s.motivo_rechazo}</span>}
        </div>
        {gerente && s.estado === 'PENDIENTE' && (
          <AprobarRechazarSolicitud solicitudId={s.id} esCampana={Boolean(s.es_campana)}
            campanaUnit={Number(s.campana_por_unidad ?? 0)} movilidadUnit={Number(s.movilidad_por_unidad ?? 0)} />
        )}
      </Card>
      {s.estado !== 'PENDIENTE' && (
        <p className="-mt-2 text-xs text-slate-500">Vista armada con los datos de hoy. Lo que quedó registrado es la OS emitida.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-slate-500">OT</p><p className="font-mono text-lg font-semibold text-corp-900">{ot?.numero ?? '—'}</p><p className="text-[11px] text-slate-500">{ot?.estado?.replace(/_/g, ' ').toLowerCase()}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Taller</p><p className="text-sm font-semibold text-corp-900">{taller?.nombre ?? '—'}</p><p className="text-[11px] text-slate-500">{[taller?.contacto_nombre, taller?.telefono].filter(Boolean).join(' · ')}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Envío · entrega esperada</p><p className="text-sm font-semibold text-corp-900">{p.fecha_envio ? formatDate(p.fecha_envio) : '—'} · {p.fecha_entrega_esperada ? formatDate(p.fecha_entrega_esperada) : '—'}</p></Card>
        <Card className="p-4"><p className="text-xs text-slate-500">Total a pagar al taller</p><p className="font-display text-xl font-semibold text-happy-600">{formatPEN(total)}</p><p className="text-[11px] text-slate-500">{unidades} prendas</p></Card>
      </div>

      {/* Prendas con tarifa por talla */}
      <Card>
        <div className="border-b bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-corp-900">Prendas que se envían al taller</h3>
          <p className="text-[11px] text-slate-500">{esConfeccion ? 'Con la tarifa de confección de cada talla.' : 'Con el precio por unidad del servicio.'}</p>
        </div>
        {lineas.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No hay prendas cortadas para las tallas elegidas.</p>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Modelo</TableHead><TableHead>Código</TableHead><TableHead>Talla</TableHead>
              <TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Tarifa</TableHead><TableHead className="text-right">Subtotal</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lineas.map((l, i) => (
                <TableRow key={`${l.producto_id}-${l.talla}`}>
                  <TableCell className="text-sm">{prodDe.get(l.producto_id)?.nombre ?? '—'}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{prodDe.get(l.producto_id)?.codigo ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{formatTallaChip(l.talla)}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{l.cantidad}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{precios.porLinea[i]?.tarifa != null ? formatPEN(precios.porLinea[i]!.tarifa!) : <span className="text-rose-600">sin tarifa</span>}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{precios.porLinea[i]?.subtotal != null ? formatPEN(precios.porLinea[i]!.subtotal!) : '—'}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-slate-50">
                <TableCell colSpan={3} className="text-right font-semibold">Total</TableCell>
                <TableCell className="text-right font-mono font-semibold">{unidades}</TableCell>
                <TableCell />
                <TableCell className="text-right font-mono font-semibold">{formatPEN(tarifario)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Avíos */}
        <Card>
          <div className="border-b bg-slate-50 p-3"><h3 className="text-sm font-semibold text-corp-900">Avíos que se envían ({avios.length})</h3></div>
          {avios.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Sin avíos para este servicio.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Unidad</TableHead></TableRow></TableHeader>
              <TableBody>
                {avios.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{a.nombre}<div className="font-mono text-[10px] text-slate-400">{a.codigo}</div></TableCell>
                    <TableCell className="text-right font-mono text-sm">{a.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}</TableCell>
                    <TableCell className="text-xs">{a.unidad}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Pago */}
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-corp-900">Pago al taller</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Monto base</span><span className="font-mono font-medium">{formatPEN(montoBase)}</span></div>
            {esConfeccion && <div className="flex justify-between"><span className="text-slate-600">Movilidad ({formatPEN(movUnit)} × {unidades})</span><span className="font-mono">{formatPEN(movilidad)}</span></div>}
            {esConfeccion && <div className="flex justify-between"><span className="text-slate-600">Campaña ({formatPEN(campUnit)} × {unidades})</span><span className="font-mono">{formatPEN(campana)}</span></div>}
            <hr />
            <div className="flex justify-between font-semibold"><span>Total a pagar</span><span className="font-mono text-happy-600">{formatPEN(total)}</span></div>
          </div>
          {esConfeccion && Math.abs(precios.ajuste) > 0.009 && (
            <p className="mt-3 flex items-start gap-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              El monto base ({formatPEN(montoBase)}) es distinto al tarifario ({formatPEN(tarifario)}): se paga {formatPEN(Math.abs(precios.ajuste))} {precios.ajuste > 0 ? 'más' : 'menos'} que la tarifa.
            </p>
          )}
          {precios.sinTarifa.length > 0 && (
            <p className="mt-2 text-xs text-rose-700">Tallas sin tarifa cargada: {precios.sinTarifa.map(formatTallaChip).join(', ')}.</p>
          )}
          {(p.cuidados || p.consideraciones || p.observaciones || s.motivo_solicitud) && (
            <div className="mt-3 space-y-1 border-t pt-2 text-xs text-slate-600">
              {s.motivo_solicitud && <p><b>Motivo:</b> {s.motivo_solicitud}</p>}
              {p.cuidados && <p><b>Cuidados:</b> {p.cuidados}</p>}
              {p.consideraciones && <p><b>Consideraciones:</b> {p.consideraciones}</p>}
              {p.observaciones && <p><b>Observaciones:</b> {p.observaciones}</p>}
            </div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
