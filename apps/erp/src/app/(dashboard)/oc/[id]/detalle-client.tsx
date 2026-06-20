'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Loader2, CheckCircle2, Send, XCircle, Truck, Trash2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { cambiarEstadoOC, eliminarOC, type OCDetalle } from '@/server/actions/oc';
import { ESTADO_LABEL, ESTADO_TONO, TIPO_LABEL, TRANSICIONES_OC, type EstadoOC } from '@/server/actions/oc-helpers';
import { eliminarPagoOC, type PagoOCRow } from '@/server/actions/pagos-proveedores';
import { RegistrarPagoBtn } from '../../compras/cxp/registrar-pago-btn';

const TONE_CLS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
};

export function DetalleClient({ oc, pagos }: { oc: OCDetalle; pagos: PagoOCRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const transiciones = TRANSICIONES_OC[oc.estado];
  const tono = ESTADO_TONO[oc.estado];
  const symbol = oc.moneda === 'PEN' ? 'S/' : oc.moneda === 'USD' ? 'US$' : '€';

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const saldoVivo = Math.max(0, oc.total - totalPagado);
  const pagable = saldoVivo > 0.01 && oc.estado !== 'CANCELADA' && oc.estado !== 'BORRADOR';

  function borrarPago(pagoId: string, numero: string) {
    if (!confirm(`¿Eliminar pago ${numero}? El saldo de la OC se restaurará.`)) return;
    startTransition(async () => {
      const r = await eliminarPagoOC(pagoId);
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo eliminar');
        return;
      }
      toast.success('Pago eliminado');
      router.refresh();
    });
  }

  function cambiar(nuevo: EstadoOC, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    startTransition(async () => {
      const r = await cambiarEstadoOC({ id: oc.id, estado: nuevo });
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo cambiar el estado');
        return;
      }
      toast.success(`OC ${ESTADO_LABEL[nuevo].toLowerCase()}`);
      router.refresh();
    });
  }

  function eliminar() {
    if (!confirm('¿Eliminar esta OC? Solo se puede eliminar en BORRADOR.')) return;
    startTransition(async () => {
      const r = await eliminarOC(oc.id);
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo eliminar');
        return;
      }
      toast.success('OC eliminada');
      router.push('/oc');
    });
  }

  return (
    <div className="space-y-6">
      {/* Header con estado + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${TONE_CLS[tono]}`}>
            {ESTADO_LABEL[oc.estado]}
          </span>
          <Badge variant="secondary">{TIPO_LABEL[oc.tipo]}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {transiciones.includes('APROBADA') && (
            <Button size="sm" onClick={() => cambiar('APROBADA', '¿Aprobar esta OC?')} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprobar
            </Button>
          )}
          {transiciones.includes('ENVIADA') && (
            <Button size="sm" variant="secondary" onClick={() => cambiar('ENVIADA', '¿Marcar como enviada al proveedor?')} disabled={isPending}>
              <Send className="h-4 w-4" /> Marcar enviada
            </Button>
          )}
          {transiciones.includes('RECIBIDA') && (
            <Button size="sm" variant="secondary" onClick={() => cambiar('RECIBIDA', '¿Marcar como recibida (sin registrar recepción en kardex)?')} disabled={isPending}>
              <Truck className="h-4 w-4" /> Recibida
            </Button>
          )}
          {transiciones.includes('CANCELADA') && (
            <Button size="sm" variant="ghost" onClick={() => cambiar('CANCELADA', '¿Cancelar esta OC?')} disabled={isPending} className="text-rose-600 hover:bg-rose-50">
              <XCircle className="h-4 w-4" /> Cancelar
            </Button>
          )}
          {oc.estado === 'BORRADOR' && (
            <Button size="sm" variant="ghost" onClick={eliminar} disabled={isPending} className="text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
        </div>
      </div>

      {/* Recepción si aplica */}
      {(oc.estado === 'APROBADA' || oc.estado === 'ENVIADA' || oc.estado === 'PARCIAL') && (
        <Card className="border-sky-200 bg-sky-50/50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="text-sm text-sky-900">
              Cuando llegue la mercadería, registre la recepción en el módulo de Recepciones para descontar del pendiente y sumar al kardex.
            </div>
            <Button size="sm" variant="secondary" asChild>
              <a href={`/recepciones/nueva?oc=${oc.id}`}>Registrar recepción</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Datos cabecera */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">Proveedor</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-medium text-slate-900">{oc.proveedor_razon_social}</div>
            {oc.proveedor_ruc && <div className="text-xs text-slate-500">RUC {oc.proveedor_ruc}</div>}
            <div className="text-xs text-slate-500">
              Condición: {oc.condicion_pago ?? '—'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Entrega</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>Almacén: <span className="font-medium">{oc.almacen_nombre ?? '— Sin asignar —'}</span></div>
            <div>Fecha entrega esperada: <span className="font-medium">{oc.fecha_entrega_esperada ? new Date(oc.fecha_entrega_esperada).toLocaleDateString('es-PE') : '—'}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Totales</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Subtotal</span><span className="font-mono">{symbol} {oc.sub_total.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">IGV</span><span className="font-mono">{symbol} {oc.igv.toFixed(2)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Total</span><span className="font-mono">{symbol} {oc.total.toFixed(2)}</span></div>
            {oc.adelanto > 0 && (
              <>
                <div className="flex justify-between text-slate-500"><span>Adelanto</span><span className="font-mono">{symbol} {oc.adelanto.toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold text-amber-700"><span>Saldo</span><span className="font-mono">{symbol} {oc.saldo.toFixed(2)}</span></div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Líneas */}
      <Card>
        <CardHeader><CardTitle>Líneas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Material</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-left">Unidad</th>
                  <th className="px-3 py-2 text-right">P. unit.</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                  <th className="px-3 py-2 text-right">Recibido</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {oc.lineas.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="px-3 py-2">
                      {l.material_codigo ? (
                        <div>
                          <div className="font-medium text-slate-900">{l.material_nombre}</div>
                          <div className="text-xs text-slate-500">{l.material_codigo}{l.descripcion_libre ? ` · ${l.descripcion_libre}` : ''}</div>
                        </div>
                      ) : (
                        <div className="italic text-slate-700">{l.descripcion_libre ?? '—'}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{l.cantidad}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{l.unidad_codigo}</td>
                    <td className="px-3 py-2 text-right font-mono">{symbol} {l.precio_unitario.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{symbol} {l.sub_total.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{l.cantidad_recibida}</td>
                    <td className={`px-3 py-2 text-right font-medium ${l.cantidad_pendiente > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{l.cantidad_pendiente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagos a proveedor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-violet-600" />
            Pagos a proveedor
            {pagos.length > 0 && (
              <span className="text-xs font-normal text-slate-500">({pagos.length})</span>
            )}
          </CardTitle>
          {pagable && (
            <RegistrarPagoBtn
              ocId={oc.id}
              ocNumero={oc.numero}
              saldo={saldoVivo}
              proveedor={oc.proveedor_razon_social}
            />
          )}
        </CardHeader>
        <CardContent className="p-0">
          {pagos.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              {pagable
                ? 'Sin pagos registrados. Use el botón "Pagar" para registrar el primero.'
                : 'Sin pagos registrados.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-3 py-2 text-left">N° Pago</th>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Método</th>
                    <th className="px-3 py-2 text-left">Referencia</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{p.numero}</td>
                      <td className="px-3 py-2 text-sm">{new Date(p.fecha).toLocaleDateString('es-PE')}</td>
                      <td className="px-3 py-2 text-xs"><Badge variant="secondary">{p.metodo}</Badge></td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {p.referencia_bancaria ? p.referencia_bancaria : '—'}
                        {p.comprobante_proveedor && <div className="text-[10px] text-slate-400">F: {p.comprobante_proveedor}</div>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-emerald-700">
                        {symbol} {p.monto.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                          onClick={() => borrarPago(p.id, p.numero)}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-50">
                    <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                      Total pagado
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                      {symbol} {totalPagado.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                  {saldoVivo > 0.01 && (
                    <tr className="bg-rose-50">
                      <td colSpan={4} className="px-3 py-2 text-right text-xs font-semibold text-slate-700">
                        Saldo pendiente
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-rose-700">
                        {symbol} {saldoVivo.toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {oc.observacion && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Observación</CardTitle></CardHeader>
          <CardContent className="text-sm text-slate-700 whitespace-pre-wrap">{oc.observacion}</CardContent>
        </Card>
      )}
    </div>
  );
}
