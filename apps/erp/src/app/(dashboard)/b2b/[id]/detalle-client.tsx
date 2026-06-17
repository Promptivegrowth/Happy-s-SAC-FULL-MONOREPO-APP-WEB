'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@happy/ui/dialog';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Textarea } from '@happy/ui/textarea';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  actualizarLineaPedido,
  actualizarPedidoCabecera,
  agregarLineaPedido,
  cambiarEstadoB2B,
  eliminarLineaPedido,
  registrarDespacho,
  type PedidoB2BDespachoRow,
  type PedidoB2BDetalle,
  type PedidoB2BLineaDetalle,
  type VarianteB2BItem,
} from '@/server/actions/b2b';
import {
  CONDICIONES_PAGO,
  IGV_RATE,
  siguientesEstadosB2B,
  type CondicionPago,
  type EstadoB2B,
} from '@/server/actions/b2b-helpers';
import { generarProformaPdf } from './proforma-pdf';

type Almacen = { id: string; codigo: string; nombre: string };

export function DetallePedidoB2BClient({
  pedido,
  lineas,
  despachos,
  variantes,
  almacenes,
}: {
  pedido: PedidoB2BDetalle;
  lineas: PedidoB2BLineaDetalle[];
  despachos: PedidoB2BDespachoRow[];
  variantes: VarianteB2BItem[];
  almacenes: Almacen[];
}) {
  // Totales en vivo a partir de las líneas (lo que persiste recalcula el server).
  const totalLineas = lineas.reduce((s, l) => s + l.sub_total, 0);
  const descMonto = Math.round(((totalLineas * pedido.descuento_porcentaje) / 100) * 100) / 100;
  const base = Math.max(0, totalLineas - descMonto);
  const igvCalc = Math.round(base * IGV_RATE * 100) / 100;
  const totalCalc = Math.round((base + igvCalc) * 100) / 100;

  const totalPedido = lineas.reduce((s, l) => s + l.cantidad_pedida, 0);
  const totalEntregado = lineas.reduce((s, l) => s + l.cantidad_entregada, 0);
  const totalPendiente = Math.max(0, totalPedido - totalEntregado);

  return (
    <div className="space-y-4">
      {/* Cabecera (cards arriba) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Cliente</p>
          <p className="font-display text-sm font-semibold text-corp-900 truncate">
            {pedido.cliente_razon_social}
          </p>
          <p className="text-[10px] text-slate-500 truncate">{pedido.cliente_documento ?? '—'}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Subtotal</p>
          <p className="font-display text-lg font-semibold text-corp-900">
            S/{' '}
            {totalLineas.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          {pedido.descuento_porcentaje > 0 && (
            <p className="text-[10px] text-slate-500">
              − S/{' '}
              {descMonto.toLocaleString('es-PE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              ({pedido.descuento_porcentaje}%)
            </p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">IGV 18%</p>
          <p className="font-display text-lg font-semibold text-corp-900">
            S/{' '}
            {igvCalc.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Total</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">
            S/{' '}
            {totalCalc.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          {pedido.adelanto > 0 && (
            <p className="text-[10px] text-slate-500">
              Adelanto: S/{' '}
              {pedido.adelanto.toLocaleString('es-PE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          )}
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Cantidades</p>
          <p className="font-display text-lg font-semibold text-corp-900">
            {totalEntregado} / {totalPedido}
          </p>
          <p className="text-[10px] text-slate-500">
            {totalPendiente} pendiente{totalPendiente === 1 ? '' : 's'} · {lineas.length} línea(s)
          </p>
        </Card>
      </div>

      {/* Aviso de totales no sincronizados */}
      {Math.abs(totalCalc - pedido.total) > 0.01 && pedido.estado !== 'BORRADOR' && (
        <Card className="border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Los totales en vivo difieren del valor persistido (S/ {pedido.total.toFixed(2)}). Esto
          suele resolverse al avanzar de estado.
        </Card>
      )}

      {/* Cabecera editable solo en BORRADOR/PROFORMA */}
      {(pedido.estado === 'BORRADOR' || pedido.estado === 'PROFORMA') && (
        <CabeceraEditable pedido={pedido} />
      )}

      {/* Líneas: editables en BORRADOR, lectura en el resto */}
      {pedido.estado === 'BORRADOR' ? (
        <LineasEditor pedidoId={pedido.id} lineas={lineas} variantes={variantes} />
      ) : (
        <LineasLectura
          lineas={lineas}
          mostrarEntregadas={pedido.estado !== 'PROFORMA' && pedido.estado !== 'CANCELADO'}
        />
      )}

      {/* Despachos previos */}
      {despachos.length > 0 && <DespachosList despachos={despachos} />}

      {/* Acciones (transición de estado + despacho + PDF) */}
      <AccionesPedido
        pedido={pedido}
        lineas={lineas}
        almacenes={almacenes}
        puedeRegistrarDespacho={['APROBADO', 'EN_PRODUCCION', 'PARCIAL'].includes(pedido.estado)}
      />
    </div>
  );
}

// ============================================================================
// Cabecera editable
// ============================================================================

function CabeceraEditable({ pedido }: { pedido: PedidoB2BDetalle }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fechaEntrega, setFechaEntrega] = useState(pedido.fecha_entrega_estimada ?? '');
  const [descuento, setDescuento] = useState(String(pedido.descuento_porcentaje));
  const [adelanto, setAdelanto] = useState(String(pedido.adelanto));
  const [condicion, setCondicion] = useState(pedido.condicion_pago ?? '');
  const [observacion, setObservacion] = useState(pedido.observacion ?? '');

  function guardar() {
    const descNum = Number(descuento) || 0;
    const adelNum = Number(adelanto) || 0;
    if (descNum < 0 || descNum > 100) return toast.error('Descuento debe estar entre 0 y 100');
    if (adelNum < 0) return toast.error('Adelanto no puede ser negativo');

    start(async () => {
      const r = await actualizarPedidoCabecera(pedido.id, {
        fecha_entrega_estimada: fechaEntrega || undefined,
        descuento_porcentaje: descNum,
        adelanto: adelNum,
        condicion_pago: (condicion as CondicionPago | '') || undefined,
        observacion: observacion || undefined,
      });
      if (r.ok) {
        toast.success('Cabecera actualizada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo actualizar');
      }
    });
  }

  return (
    <FormSection title="Cabecera" description="Términos comerciales editables.">
      <FormGrid cols={3}>
        <FormRow label="Fecha entrega estimada">
          <Input
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            disabled={pending}
          />
        </FormRow>
        <FormRow label="Descuento global %">
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={descuento}
            onChange={(e) => setDescuento(e.target.value)}
            disabled={pending}
          />
        </FormRow>
        <FormRow label="Adelanto (S/)">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={adelanto}
            onChange={(e) => setAdelanto(e.target.value)}
            disabled={pending}
          />
        </FormRow>
        <FormRow label="Condición de pago">
          <select
            value={condicion}
            onChange={(e) => setCondicion(e.target.value)}
            disabled={pending}
            className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
          >
            <option value="">—</option>
            {CONDICIONES_PAGO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label="Observación" className="sm:col-span-2">
          <Textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            disabled={pending}
          />
        </FormRow>
      </FormGrid>
      <div className="flex justify-end">
        <Button onClick={guardar} variant="premium" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cabecera
        </Button>
      </div>
    </FormSection>
  );
}

// ============================================================================
// Editor de líneas (BORRADOR)
// ============================================================================

function LineasEditor({
  pedidoId,
  lineas,
  variantes,
}: {
  pedidoId: string;
  lineas: PedidoB2BLineaDetalle[];
  variantes: VarianteB2BItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [variantePick, setVariantePick] = useState<VarianteB2BItem | null>(null);
  const [varQuery, setVarQuery] = useState('');
  const [varOpen, setVarOpen] = useState(false);
  const [cantidad, setCantidad] = useState('1');
  const [descLinea, setDescLinea] = useState('0');

  const filtradas = useMemo(() => {
    const q = varQuery.trim().toLowerCase();
    if (!q) return variantes.slice(0, 12);
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const qn = norm(q);
    return variantes
      .filter(
        (v) =>
          norm(v.sku).includes(qn) ||
          norm(v.producto_nombre).includes(qn) ||
          norm(v.talla).includes(qn),
      )
      .slice(0, 25);
  }, [varQuery, variantes]);

  function agregar() {
    if (!variantePick) return toast.error('Selecciona una variante');
    const cant = parseInt(cantidad, 10);
    if (!cant || cant <= 0) return toast.error('Cantidad debe ser entero > 0');
    const desc = Number(descLinea) || 0;
    if (desc < 0 || desc > 100) return toast.error('Descuento debe estar entre 0 y 100');

    start(async () => {
      const r = await agregarLineaPedido(pedidoId, {
        variante_id: variantePick.id,
        cantidad_pedida: cant,
        descuento: desc,
      });
      if (r.ok && r.data) {
        if (r.data.uso_fallback) {
          toast.warning(
            `Línea agregada con precio público (la variante no tiene precio en la lista del pedido).`,
          );
        } else {
          toast.success('Línea agregada');
        }
        setVariantePick(null);
        setVarQuery('');
        setCantidad('1');
        setDescLinea('0');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo agregar línea');
      }
    });
  }

  return (
    <Card className="p-0">
      <div className="border-b bg-slate-50 p-4">
        <h3 className="font-display text-sm font-semibold text-corp-900">Agregar línea</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6">
            {variantePick ? (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-white px-2 py-1.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-corp-900">
                    {variantePick.sku} · {variantePick.producto_nombre}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">
                    T{variantePick.talla.replace('T', '')}
                    {variantePick.color && ` · ${variantePick.color}`} · S/{' '}
                    {variantePick.precio_aplicable.toFixed(2)}
                    {variantePick.uso_fallback_precio && (
                      <span className="ml-1 text-amber-600">(fallback público)</span>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-[11px]"
                  onClick={() => setVariantePick(null)}
                  disabled={pending}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  value={varQuery}
                  onChange={(e) => {
                    setVarQuery(e.target.value);
                    setVarOpen(true);
                  }}
                  onFocus={() => setVarOpen(true)}
                  onBlur={() => setTimeout(() => setVarOpen(false), 150)}
                  disabled={pending}
                  className="h-9 pl-7"
                  placeholder="Buscar SKU, producto, talla…"
                />
                {varOpen && filtradas.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border bg-white shadow-lg">
                    {filtradas.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setVariantePick(v);
                          setVarOpen(false);
                          setVarQuery('');
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b px-3 py-1.5 text-left text-xs last:border-0 hover:bg-happy-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-corp-900">
                            {v.sku} · {v.producto_nombre}
                          </div>
                          <div className="truncate text-[10px] text-slate-500">
                            T{v.talla.replace('T', '')}
                            {v.color && ` · ${v.color}`}
                            {v.uso_fallback_precio && (
                              <span className="ml-1 text-amber-600">(precio público)</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right font-mono text-[11px] text-slate-700">
                          S/ {v.precio_aplicable.toFixed(2)}
                          <div className="text-[9px] text-slate-400">stock {v.stock_actual}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <Input
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              disabled={pending}
              placeholder="Cantidad"
              className="h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={descLinea}
              onChange={(e) => setDescLinea(e.target.value)}
              disabled={pending}
              placeholder="Desc. %"
              className="h-9"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="premium"
              size="sm"
              onClick={agregar}
              disabled={pending || !variantePick}
              className="h-9 w-full"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Agregar
            </Button>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-24 text-right">Cantidad</TableHead>
              <TableHead className="w-28 text-right">P. Unit (S/)</TableHead>
              <TableHead className="w-20 text-right">Desc. %</TableHead>
              <TableHead className="w-28 text-right">Sub-total</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">
                  Aún no hay líneas. Usa el buscador de arriba para agregar productos.
                </TableCell>
              </TableRow>
            ) : (
              lineas.map((l) => (
                <LineaEditable key={l.id} linea={l} />
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function LineaEditable({ linea }: { linea: PedidoB2BLineaDetalle }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cantidad, setCantidad] = useState(String(linea.cantidad_pedida));
  const [precio, setPrecio] = useState(String(linea.precio_unitario));
  const [descuento, setDescuento] = useState(String(linea.descuento));

  const subTotal =
    Math.round(Number(cantidad) * Number(precio) * (1 - Number(descuento) / 100) * 100) / 100;

  function guardarSiCambio() {
    const c = parseInt(cantidad, 10);
    const p = Number(precio);
    const d = Number(descuento) || 0;
    if (
      c === linea.cantidad_pedida &&
      Math.abs(p - linea.precio_unitario) < 0.001 &&
      Math.abs(d - linea.descuento) < 0.001
    ) {
      return;
    }
    if (!c || c <= 0) {
      setCantidad(String(linea.cantidad_pedida));
      return toast.error('Cantidad inválida');
    }
    if (p < 0) {
      setPrecio(String(linea.precio_unitario));
      return toast.error('Precio inválido');
    }
    if (d < 0 || d > 100) {
      setDescuento(String(linea.descuento));
      return toast.error('Descuento entre 0 y 100');
    }
    start(async () => {
      const r = await actualizarLineaPedido(linea.id, {
        cantidad_pedida: c,
        precio_unitario: p,
        descuento: d,
      });
      if (r.ok) {
        toast.success('Línea actualizada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo actualizar');
      }
    });
  }

  function eliminar() {
    if (!confirm(`Eliminar línea ${linea.sku}?`)) return;
    start(async () => {
      const r = await eliminarLineaPedido(linea.id);
      if (r.ok) {
        toast.success('Línea eliminada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs font-semibold text-corp-900">{linea.sku}</TableCell>
      <TableCell>
        <div className="text-sm text-corp-900">{linea.producto_nombre}</div>
        <div className="text-[10px] text-slate-500">
          T{linea.talla.replace('T', '')}
          {linea.color && ` · ${linea.color}`}
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="1"
          step="1"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          onBlur={guardarSiCambio}
          disabled={pending}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          onBlur={guardarSiCambio}
          disabled={pending}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
          onBlur={guardarSiCambio}
          disabled={pending}
          className="h-8 text-right"
        />
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
        S/ {subTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </TableCell>
      <TableCell>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={eliminar}
          disabled={pending}
          aria-label="Eliminar línea"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <Trash2 className="h-4 w-4 text-rose-500" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ============================================================================
// Lectura de líneas
// ============================================================================

function LineasLectura({
  lineas,
  mostrarEntregadas,
}: {
  lineas: PedidoB2BLineaDetalle[];
  mostrarEntregadas: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cant. pedida</TableHead>
              {mostrarEntregadas && <TableHead className="text-right">Entregada</TableHead>}
              {mostrarEntregadas && <TableHead className="text-right">Avance</TableHead>}
              <TableHead className="text-right">P. Unit</TableHead>
              <TableHead className="text-right">Desc.</TableHead>
              <TableHead className="text-right">Sub-total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={mostrarEntregadas ? 8 : 6}
                  className="py-8 text-center text-sm text-slate-500"
                >
                  Pedido sin líneas.
                </TableCell>
              </TableRow>
            ) : (
              lineas.map((l) => {
                const pct =
                  l.cantidad_pedida > 0
                    ? Math.round((l.cantidad_entregada * 100) / l.cantidad_pedida)
                    : 0;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs font-semibold text-corp-900">
                      {l.sku}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-corp-900">{l.producto_nombre}</div>
                      <div className="text-[10px] text-slate-500">
                        T{l.talla.replace('T', '')}
                        {l.color && ` · ${l.color}`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{l.cantidad_pedida}</TableCell>
                    {mostrarEntregadas && (
                      <TableCell className="text-right font-mono text-sm">
                        {l.cantidad_entregada}
                      </TableCell>
                    )}
                    {mostrarEntregadas && (
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            pct >= 100
                              ? 'success'
                              : pct > 0
                                ? 'warning'
                                : 'secondary'
                          }
                          className="text-[10px]"
                        >
                          {pct}%
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right font-mono text-sm">
                      S/ {l.precio_unitario.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-600">
                      {l.descuento > 0 ? `${l.descuento}%` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      S/{' '}
                      {l.sub_total.toLocaleString('es-PE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Lista de despachos previos
// ============================================================================

function DespachosList({ despachos }: { despachos: PedidoB2BDespachoRow[] }) {
  return (
    <Card>
      <div className="border-b bg-slate-50 px-4 py-2">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
          <Truck className="h-4 w-4" /> Despachos ({despachos.length})
        </h3>
      </div>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Almacén</TableHead>
              <TableHead className="text-right">Líneas</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Observación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {despachos.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.numero}</TableCell>
                <TableCell className="font-mono text-[11px] text-slate-600">
                  {new Date(d.fecha).toLocaleString('es-PE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </TableCell>
                <TableCell className="text-xs text-slate-700">
                  {d.almacen_codigo ? `${d.almacen_codigo} — ${d.almacen_nombre ?? ''}` : '—'}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">{d.total_lineas}</TableCell>
                <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                  {d.total_cantidad}
                </TableCell>
                <TableCell
                  className="max-w-[260px] truncate text-xs text-slate-500"
                  title={d.observacion ?? ''}
                >
                  {d.observacion ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Acciones (transición de estado + despacho + PDF)
// ============================================================================

function AccionesPedido({
  pedido,
  lineas,
  almacenes,
  puedeRegistrarDespacho,
}: {
  pedido: PedidoB2BDetalle;
  lineas: PedidoB2BLineaDetalle[];
  almacenes: Almacen[];
  puedeRegistrarDespacho: boolean;
}) {
  const transiciones = siguientesEstadosB2B(pedido.estado);
  const lineasPendientes = lineas.filter((l) => l.cantidad_pendiente > 0);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-white p-4 shadow-soft">
      {(pedido.estado === 'PROFORMA' ||
        pedido.estado === 'APROBADO' ||
        pedido.estado === 'EN_PRODUCCION' ||
        pedido.estado === 'PARCIAL') && (
        <DescargarProformaButton pedido={pedido} lineas={lineas} />
      )}

      {puedeRegistrarDespacho && lineasPendientes.length > 0 && almacenes.length > 0 && (
        <RegistrarDespachoButton
          pedidoId={pedido.id}
          numero={pedido.numero}
          almacenes={almacenes}
          lineasPendientes={lineasPendientes}
        />
      )}

      {transiciones.map((nuevo) => (
        <CambiarEstadoButton
          key={nuevo}
          pedidoId={pedido.id}
          numero={pedido.numero}
          actual={pedido.estado}
          objetivo={nuevo}
        />
      ))}
    </div>
  );
}

function CambiarEstadoButton({
  pedidoId,
  numero,
  actual,
  objetivo,
}: {
  pedidoId: string;
  numero: string;
  actual: EstadoB2B;
  objetivo: EstadoB2B;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function ejecutar() {
    let confirma = true;
    if (objetivo === 'CANCELADO') {
      confirma = confirm(`Cancelar el pedido ${numero}? Esta acción no se puede deshacer.`);
    } else if (objetivo === 'APROBADO') {
      confirma = confirm(
        `Aprobar pedido ${numero}? Después de aprobado solo se podrá despachar o cancelar.`,
      );
    } else if (objetivo === 'ENTREGADO') {
      confirma = confirm(`Marcar pedido ${numero} como ENTREGADO?`);
    }
    if (!confirma) return;
    start(async () => {
      const r = await cambiarEstadoB2B(pedidoId, objetivo);
      if (r.ok) {
        toast.success(`Pedido ${numero}: ${actual} → ${objetivo}`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo cambiar el estado');
      }
    });
  }

  const isDanger = objetivo === 'CANCELADO';
  const isPremium =
    objetivo === 'PROFORMA' ||
    objetivo === 'APROBADO' ||
    objetivo === 'EN_PRODUCCION' ||
    objetivo === 'ENTREGADO';
  const variant = isDanger ? 'destructive' : isPremium ? 'premium' : 'outline';

  const labels: Record<EstadoB2B, string> = {
    BORRADOR: 'Volver a borrador',
    PROFORMA: 'Generar proforma',
    APROBADO: 'Aprobar pedido',
    EN_PRODUCCION: 'Mandar a producción',
    PARCIAL: 'Marcar parcial',
    ENTREGADO: 'Marcar entregado',
    CANCELADO: 'Cancelar',
  };

  const Icon = isDanger ? Ban : isPremium ? Send : CheckCircle2;

  return (
    <Button onClick={ejecutar} variant={variant} size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {labels[objetivo]}
    </Button>
  );
}

function DescargarProformaButton({
  pedido,
  lineas,
}: {
  pedido: PedidoB2BDetalle;
  lineas: PedidoB2BLineaDetalle[];
}) {
  const [pending, setPending] = useState(false);
  async function generar() {
    try {
      setPending(true);
      await generarProformaPdf(pedido, lineas);
    } catch (e) {
      toast.error(`No se pudo generar PDF: ${(e as Error).message}`);
    } finally {
      setPending(false);
    }
  }
  return (
    <Button onClick={generar} variant="outline" size="sm" disabled={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Descargar PDF
    </Button>
  );
}

function RegistrarDespachoButton({
  pedidoId,
  numero,
  almacenes,
  lineasPendientes,
}: {
  pedidoId: string;
  numero: string;
  almacenes: Almacen[];
  lineasPendientes: PedidoB2BLineaDetalle[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [almacenId, setAlmacenId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [cantidades, setCantidades] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const l of lineasPendientes) m[l.id] = String(l.cantidad_pendiente);
    return m;
  });

  function actualizar(lineaId: string, valor: string) {
    setCantidades((prev) => ({ ...prev, [lineaId]: valor }));
  }

  function enviar() {
    if (!almacenId) return toast.error('Selecciona almacén de salida');
    const lineasInput: Array<{ linea_id: string; cantidad: number }> = [];
    for (const l of lineasPendientes) {
      const v = parseInt(cantidades[l.id] ?? '0', 10);
      if (Number.isNaN(v) || v < 0) {
        return toast.error(`Cantidad inválida en ${l.sku}`);
      }
      if (v > l.cantidad_pendiente) {
        return toast.error(
          `Línea ${l.sku}: cantidad (${v}) excede pendiente (${l.cantidad_pendiente})`,
        );
      }
      if (v > 0) lineasInput.push({ linea_id: l.id, cantidad: v });
    }
    if (lineasInput.length === 0) {
      return toast.error('Debes despachar al menos una línea');
    }

    start(async () => {
      const r = await registrarDespacho(pedidoId, {
        almacen_id: almacenId,
        lineas: lineasInput,
        observacion: observacion || undefined,
      });
      if (r.ok && r.data) {
        toast.success(`Despacho ${r.data.numero} registrado (estado: ${r.data.estado})`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo registrar despacho');
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="premium" size="sm">
        <Truck className="h-4 w-4" /> Registrar despacho
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Despachar pedido {numero}</DialogTitle>
            <DialogDescription>
              Ajusta lo que sale en este despacho. Sólo las líneas con pendiente aparecen. La salida
              genera movimientos en kardex (SALIDA_VENTA).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <FormRow label="Almacén de salida" required>
              <select
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                disabled={pending}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              >
                <option value="">— Selecciona almacén —</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </select>
            </FormRow>

            <div className="max-h-[40vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Pendiente</TableHead>
                    <TableHead className="w-32 text-right">A despachar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineasPendientes.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs font-semibold text-corp-900">
                        {l.sku}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-corp-900">{l.producto_nombre}</div>
                        <div className="text-[10px] text-slate-500">
                          T{l.talla.replace('T', '')}
                          {l.color && ` · ${l.color}`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {l.cantidad_pendiente}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={l.cantidad_pendiente}
                          step="1"
                          value={cantidades[l.id] ?? ''}
                          onChange={(e) => actualizar(l.id, e.target.value)}
                          disabled={pending}
                          className="h-8 text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <FormRow label="Observación">
              <Textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                disabled={pending}
                placeholder="Guía de remisión / referencia / nota"
              />
            </FormRow>

            <div className="flex items-center gap-2 text-[11px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Esta acción descuenta stock del almacén
              seleccionado al confirmar.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" variant="premium" onClick={enviar} disabled={pending}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Truck className="h-4 w-4" />
              )}
              Confirmar despacho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
