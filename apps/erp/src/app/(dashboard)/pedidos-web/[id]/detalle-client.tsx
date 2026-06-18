'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import {
  Truck, Store, User, Phone, Mail, MapPin, CreditCard, Receipt, FileText, AlertTriangle,
  CheckCircle2, Package, X as XIcon, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  confirmarPagoPedidoWeb,
  prepararPedidoWeb,
  cambiarEstadoPedidoWeb,
  cancelarPedidoWeb,
  type PedidoWebDetalle,
} from '@/server/actions/pedidos-web';
import {
  ESTADO_LABEL, ESTADO_TONO, TRANSICIONES, type EstadoPedidoWeb, type Tono,
} from '@/server/actions/pedidos-web-helpers';

const TONO_CLASES: Record<Tono, string> = {
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  cyan: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
};

export function DetalleClient({
  data,
  almacenes,
}: {
  data: PedidoWebDetalle;
  almacenes: { id: string; codigo: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [almacenSel, setAlmacenSel] = useState<string>(almacenes[0]?.id ?? '');
  const [notasPrep, setNotasPrep] = useState('');

  const { pedido, cliente, lineas, venta_numero, comprobante_numero } = data;
  const tono = ESTADO_TONO[pedido.estado];
  const transiciones = TRANSICIONES[pedido.estado] ?? [];

  function refresh() { router.refresh(); }

  function confirmarPago() {
    if (!confirm('¿Confirmar que el pago fue recibido?')) return;
    start(async () => {
      const r = await confirmarPagoPedidoWeb(pedido.id);
      if (r.ok) { toast.success('Pago confirmado'); refresh(); }
      else toast.error(r.error ?? 'Error');
    });
  }

  function preparar() {
    if (!almacenSel) { toast.error('Seleccioná el almacén desde donde se prepara'); return; }
    if (!confirm('¿Preparar pedido? Se descontará el stock y se generará la venta + comprobante.')) return;
    start(async () => {
      const r = await prepararPedidoWeb(pedido.id, { almacen_id: almacenSel, notas_internas: notasPrep || '' });
      if (r.ok) {
        toast.success(`Pedido en preparación · Venta ${r.data?.venta_numero}`);
        refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  function avanzarA(nuevo: EstadoPedidoWeb) {
    if (!confirm(`¿Cambiar estado a "${ESTADO_LABEL[nuevo]}"?`)) return;
    start(async () => {
      const r = await cambiarEstadoPedidoWeb(pedido.id, { nuevo });
      if (r.ok) { toast.success(`Pedido ${ESTADO_LABEL[nuevo].toLowerCase()}`); refresh(); }
      else toast.error(r.error ?? 'Error');
    });
  }

  function cancelar() {
    const motivo = prompt('Motivo de la cancelación:');
    if (!motivo || !motivo.trim()) return;
    start(async () => {
      const r = await cancelarPedidoWeb(pedido.id, motivo.trim());
      if (r.ok) {
        toast.success('Pedido cancelado' + (pedido.venta_id ? ' (stock reintegrado)' : ''));
        refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="space-y-4">
      {/* Header con estado + acciones primarias */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={`inline-flex rounded-full border-2 px-3 py-1 text-xs font-semibold ${TONO_CLASES[tono]}`}>
              {ESTADO_LABEL[pedido.estado]}
            </span>
            {venta_numero && (
              <Link href="/ventas" className="text-xs text-emerald-700 underline">
                Venta {venta_numero}
              </Link>
            )}
            {comprobante_numero && (
              <span className="text-xs text-slate-500">Comprobante {comprobante_numero}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pedido.estado === 'PENDIENTE_PAGO' && (
              <Button variant="premium" size="sm" onClick={confirmarPago} disabled={pending}>
                <CheckCircle2 className="h-4 w-4" /> Confirmar pago
              </Button>
            )}
            {pedido.estado === 'PAGO_VERIFICADO' && (
              <p className="text-xs text-slate-500">↓ Prepará el pedido abajo (descuenta stock)</p>
            )}
            {transiciones
              .filter((t) => t !== 'EN_PREPARACION' && t !== 'CANCELADO' && t !== 'PAGO_VERIFICADO' && t !== 'WHATSAPP_DERIVADO')
              .map((t) => (
                <Button key={t} variant="outline" size="sm" onClick={() => avanzarA(t)} disabled={pending}>
                  <Package className="h-4 w-4" /> {ESTADO_LABEL[t]}
                </Button>
              ))}
            {transiciones.includes('CANCELADO') && (
              <Button variant="outline" size="sm" onClick={cancelar} disabled={pending}>
                <XIcon className="h-4 w-4 text-rose-500" /> Cancelar
              </Button>
            )}
            {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
        </div>
      </Card>

      {/* Acción especial: PREPARAR (con selector almacén) */}
      {pedido.estado === 'PAGO_VERIFICADO' && (
        <Card className="border-indigo-300 bg-indigo-50/30 p-4">
          <h3 className="mb-3 font-display text-sm font-semibold text-corp-900">
            <Package className="mr-1 inline h-4 w-4 text-indigo-600" /> Preparar pedido
          </h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">Almacén desde donde se prepara</Label>
              <select
                value={almacenSel}
                onChange={(e) => setAlmacenSel(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Notas internas (opcional)</Label>
              <Input
                value={notasPrep}
                onChange={(e) => setNotasPrep(e.target.value)}
                placeholder="Para el courier, notas para el armado…"
                className="mt-1"
              />
            </div>
            <Button variant="premium" onClick={preparar} disabled={pending || !almacenSel}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Preparar
            </Button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Descontará el stock del almacén seleccionado. Si no hay stock suficiente, no se procesa.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cliente + entrega */}
        <Card className="space-y-3 p-4 lg:col-span-2">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-corp-900">Cliente y entrega</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-medium text-corp-900">
                <User className="h-3.5 w-3.5 text-slate-400" /> {cliente.nombre}
              </p>
              {cliente.documento && (
                <p className="text-[11px] text-slate-500">{cliente.documento}</p>
              )}
              {cliente.telefono && (
                <p className="flex items-center gap-1 text-xs text-slate-600">
                  <Phone className="h-3 w-3" /> {cliente.telefono}
                </p>
              )}
              {cliente.email && (
                <p className="flex items-center gap-1 text-xs text-slate-600">
                  <Mail className="h-3 w-3" /> {cliente.email}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Método de entrega</p>
              <Badge variant="outline" className="gap-1 text-[10px]">
                {pedido.metodo_entrega === 'DELIVERY'
                  ? <><Truck className="h-3 w-3" /> Delivery</>
                  : <><Store className="h-3 w-3" /> Recojo en tienda</>}
              </Badge>
              {pedido.metodo_entrega === 'DELIVERY' && pedido.direccion_entrega && (
                <p className="mt-1 flex items-start gap-1 text-xs text-slate-700">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    {pedido.direccion_entrega}
                    {pedido.referencia_entrega && <><br /><span className="text-slate-500">Ref: {pedido.referencia_entrega}</span></>}
                    {pedido.ubigeo_entrega && <><br /><span className="text-slate-500">Ubigeo: {pedido.ubigeo_entrega}</span></>}
                  </span>
                </p>
              )}
              {pedido.necesita_factura && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2">
                  <p className="text-[10px] font-semibold text-amber-700">REQUIERE FACTURA</p>
                  {pedido.ruc_facturacion && <p className="text-xs">RUC: {pedido.ruc_facturacion}</p>}
                  {pedido.razon_social_facturacion && <p className="text-xs">{pedido.razon_social_facturacion}</p>}
                </div>
              )}
            </div>
          </div>
          {pedido.notas_cliente && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Notas del cliente</p>
              <p className="text-sm">{pedido.notas_cliente}</p>
            </div>
          )}
          {pedido.notas_internas && (
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2">
              <p className="text-[10px] font-semibold uppercase text-amber-700">Notas internas</p>
              <p className="whitespace-pre-line text-sm">{pedido.notas_internas}</p>
            </div>
          )}
        </Card>

        {/* Totales */}
        <Card className="p-4">
          <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-corp-900">Totales</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-mono">{formatPEN(pedido.sub_total)}</dd></div>
            {pedido.descuento > 0 && (
              <div className="flex justify-between text-rose-700"><dt>Descuento</dt><dd className="font-mono">-{formatPEN(pedido.descuento)}</dd></div>
            )}
            {pedido.costo_envio > 0 && (
              <div className="flex justify-between"><dt className="text-slate-500">Envío</dt><dd className="font-mono">{formatPEN(pedido.costo_envio)}</dd></div>
            )}
            {pedido.igv > 0 && (
              <div className="flex justify-between"><dt className="text-slate-500">IGV</dt><dd className="font-mono">{formatPEN(pedido.igv)}</dd></div>
            )}
            <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <dt>Total</dt><dd className="font-mono text-corp-900">{formatPEN(pedido.total)}</dd>
            </div>
          </dl>
          {pedido.metodo_pago && (
            <p className="mt-3 flex items-center gap-1 text-xs">
              <CreditCard className="h-3 w-3 text-slate-400" />
              Método: <span className="font-medium uppercase">{pedido.metodo_pago}</span>
            </p>
          )}
        </Card>
      </div>

      {/* Líneas */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">Talla</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-right">Precio unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.producto_nombre}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{l.sku}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="text-[10px]">{l.talla.replace('T', '')}</Badge>
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">{l.cantidad}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPEN(l.precio_unitario)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">{formatPEN(l.sub_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info técnica */}
      {(pedido.venta_id || pedido.comprobante_id) && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
            {pedido.venta_id && (
              <span className="flex items-center gap-1">
                <Receipt className="h-3 w-3" /> Venta vinculada: <strong className="text-corp-900">{venta_numero ?? pedido.venta_id.slice(0, 8)}</strong>
              </span>
            )}
            {pedido.comprobante_id && (
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" /> Comprobante: <strong className="text-corp-900">{comprobante_numero ?? pedido.comprobante_id.slice(0, 8)}</strong>
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
