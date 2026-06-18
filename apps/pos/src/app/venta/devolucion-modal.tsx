'use client';

/**
 * Modal DEVOLUCIÓN / CAMBIO de mercadería.
 *
 * Flujo:
 *  1. Buscar venta (por número de comprobante o número de venta)
 *  2. Seleccionar líneas + cantidades a devolver
 *  3. Indicar motivo, tipo (DEVOLUCION/CAMBIO), método reembolso si aplica
 *  4. Confirmar → genera devolución + kardex ENTRADA_DEVOLUCION
 */

import { useState, useTransition } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import {
  X, Search, Loader2, ArrowLeft, RotateCcw, Receipt, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  buscarVentaParaDevolucion,
  registrarDevolucion,
  type VentaDevolucionData,
} from '@/server/actions/devoluciones';

type Step = 'buscar' | 'seleccionar' | 'confirmar';
type TipoDevolucion = 'DEVOLUCION' | 'CAMBIO';
type Metodo = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'CREDITO';

const METODOS: { value: Metodo; label: string }[] = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'YAPE', label: 'Yape' },
  { value: 'PLIN', label: 'Plin' },
  { value: 'TARJETA_DEBITO', label: 'Tarjeta débito' },
  { value: 'TARJETA_CREDITO', label: 'Tarjeta crédito' },
  { value: 'TRANSFERENCIA', label: 'Transferencia' },
  { value: 'DEPOSITO', label: 'Depósito' },
  { value: 'CREDITO', label: 'Nota de crédito (saldo)' },
];

export function DevolucionModal({ onClose, onCompleted }: { onClose: () => void; onCompleted: () => void }) {
  const [step, setStep] = useState<Step>('buscar');
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [venta, setVenta] = useState<VentaDevolucionData | null>(null);

  // Cantidades a devolver por venta_linea_id
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  // Datos de devolución
  const [tipo, setTipo] = useState<TipoDevolucion>('DEVOLUCION');
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [observacion, setObservacion] = useState('');
  const [confirmando, startConfirm] = useTransition();

  async function buscar() {
    if (busqueda.trim().length < 3) {
      toast.error('Ingresá al menos 3 caracteres');
      return;
    }
    setBuscando(true);
    try {
      const v = await buscarVentaParaDevolucion(busqueda);
      if (!v) {
        toast.error('Venta no encontrada');
        return;
      }
      setVenta(v);
      // Pre-inicializar cantidades en 0
      const init: Record<string, number> = {};
      for (const l of v.lineas) init[l.venta_linea_id] = 0;
      setCantidades(init);
      setStep('seleccionar');
    } finally {
      setBuscando(false);
    }
  }

  function setCantidad(lineaId: string, cant: number, max: number) {
    const v = Math.max(0, Math.min(cant, max));
    setCantidades({ ...cantidades, [lineaId]: v });
  }

  const totalSeleccionado = venta
    ? venta.lineas.reduce((s, l) => s + (cantidades[l.venta_linea_id] ?? 0) * l.precio_unitario, 0)
    : 0;
  const itemsSeleccionados = Object.values(cantidades).reduce((s, n) => s + n, 0);

  function irAConfirmar() {
    if (itemsSeleccionados === 0) {
      toast.error('Seleccioná al menos 1 unidad a devolver');
      return;
    }
    setStep('confirmar');
  }

  function confirmar() {
    if (!venta) return;
    if (!motivo.trim()) {
      toast.error('Indicá el motivo');
      return;
    }
    if (tipo === 'DEVOLUCION' && !metodo) {
      toast.error('Indicá el método de reembolso');
      return;
    }
    const lineasDevolver = venta.lineas
      .filter((l) => (cantidades[l.venta_linea_id] ?? 0) > 0)
      .map((l) => ({
        venta_linea_id: l.venta_linea_id,
        variante_id: l.variante_id,
        cantidad: cantidades[l.venta_linea_id]!,
        precio_unitario: l.precio_unitario,
        reingresa_stock: true,
      }));
    startConfirm(async () => {
      const r = await registrarDevolucion({
        venta_id: venta.venta_id,
        almacen_id: venta.almacen_id,
        tipo,
        motivo: motivo.trim(),
        observacion: observacion || null,
        metodo_devolucion: tipo === 'DEVOLUCION' ? metodo : null,
        monto_devuelto: tipo === 'DEVOLUCION' ? totalSeleccionado : 0,
        lineas: lineasDevolver,
      });
      if (r.ok) {
        toast.success(`✅ ${r.data?.numero} · ${tipo === 'DEVOLUCION' ? formatPEN(totalSeleccionado) : 'Cambio registrado'}`);
        onCompleted();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/70 backdrop-blur-sm p-4" onClick={onClose}>
      <Card className="flex max-h-[90vh] w-full max-w-3xl flex-col p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            <h2 className="font-display text-lg font-semibold text-corp-900">
              {step === 'buscar' && 'Devolución / Cambio'}
              {step === 'seleccionar' && 'Seleccionar productos a devolver'}
              {step === 'confirmar' && 'Confirmar devolución'}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* STEP 1 — BUSCAR VENTA */}
          {step === 'buscar' && (
            <div className="space-y-3">
              <Label className="text-xs">Número de comprobante o venta</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void buscar()}
                    placeholder="B001-00000123 / NV-2026-000456 / etc."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button variant="premium" onClick={buscar} disabled={buscando}>
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Pegá el número exacto del comprobante (boleta/factura/NV) o el número interno de venta.
              </p>
            </div>
          )}

          {/* STEP 2 — SELECCIONAR LÍNEAS */}
          {step === 'seleccionar' && venta && (
            <div className="space-y-4">
              <Card className="bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <Badge variant="outline" className="text-[10px]">{venta.comprobante?.tipo ?? 'venta'}</Badge>
                    <span className="ml-2 font-mono text-sm font-semibold text-corp-900">
                      {venta.comprobante?.numero_completo ?? venta.numero_venta}
                    </span>
                  </div>
                  <span className="text-slate-500">{new Date(venta.fecha).toLocaleString('es-PE')}</span>
                </div>
                <p className="mt-1 text-sm">{venta.cliente_nombre}{venta.cliente_doc && ` · ${venta.cliente_doc}`}</p>
                <p className="text-xs text-slate-500">Almacén: {venta.almacen_nombre} · Total venta: <strong>{formatPEN(venta.total)}</strong></p>
              </Card>

              <div className="rounded-md border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="text-center">Vendido</TableHead>
                      <TableHead className="text-center">Ya devuelto</TableHead>
                      <TableHead className="text-center">Disponible</TableHead>
                      <TableHead className="text-center">A devolver</TableHead>
                      <TableHead className="text-right">Subtotal dev.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {venta.lineas.map((l) => {
                      const dev = cantidades[l.venta_linea_id] ?? 0;
                      const sub = dev * l.precio_unitario;
                      return (
                        <TableRow key={l.venta_linea_id} className={l.cantidad_disponible === 0 ? 'opacity-50' : ''}>
                          <TableCell>
                            <div className="text-sm font-medium text-corp-900">{l.producto_nombre}</div>
                            <div className="text-[10px] text-slate-500">{l.sku} · Talla {l.talla.replace('T', '')} · {formatPEN(l.precio_unitario)} c/u</div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs">{l.cantidad_vendida}</TableCell>
                          <TableCell className="text-center font-mono text-xs text-amber-600">
                            {l.cantidad_ya_devuelta > 0 ? l.cantidad_ya_devuelta : '—'}
                          </TableCell>
                          <TableCell className="text-center font-mono text-xs text-emerald-700">{l.cantidad_disponible}</TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={0}
                              max={l.cantidad_disponible}
                              value={dev || ''}
                              onChange={(e) => setCantidad(l.venta_linea_id, Number(e.target.value), l.cantidad_disponible)}
                              disabled={l.cantidad_disponible === 0}
                              className="h-8 w-20 text-center font-mono"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {sub > 0 ? formatPEN(sub) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm">
                <span className="text-amber-800">{itemsSeleccionados} unidad(es) seleccionadas</span>
                <span className="font-display font-semibold text-amber-900">{formatPEN(totalSeleccionado)}</span>
              </div>
            </div>
          )}

          {/* STEP 3 — CONFIRMAR */}
          {step === 'confirmar' && venta && (
            <div className="space-y-4">
              <Card className="bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Devolución de venta {venta.comprobante?.numero_completo ?? venta.numero_venta}</p>
                <p className="text-sm font-medium">{venta.cliente_nombre}</p>
                <p className="mt-1 text-sm">
                  <strong>{itemsSeleccionados}</strong> unidad(es) · Total: <strong>{formatPEN(totalSeleccionado)}</strong>
                </p>
              </Card>

              <div>
                <Label className="text-xs">Tipo *</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipo('DEVOLUCION')}
                    className={`rounded-lg border-2 p-3 text-left transition ${tipo === 'DEVOLUCION' ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white hover:border-rose-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-rose-600" />
                      <span className="font-display text-sm font-semibold">Devolución</span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Reembolso al cliente</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('CAMBIO')}
                    className={`rounded-lg border-2 p-3 text-left transition ${tipo === 'CAMBIO' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-indigo-600" />
                      <span className="font-display text-sm font-semibold">Cambio</span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-500">Sin reembolso, solo entra el producto</p>
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs">Motivo *</Label>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. talla incorrecta, defecto de fábrica, cliente arrepentido"
                  className="mt-1"
                />
              </div>

              {tipo === 'DEVOLUCION' && (
                <div>
                  <Label className="text-xs">Método de reembolso *</Label>
                  <select
                    value={metodo}
                    onChange={(e) => setMetodo(e.target.value as Metodo)}
                    className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
                  >
                    {METODOS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label className="text-xs">Observación (opcional)</Label>
                <Input
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-xs text-amber-800">
                  <AlertCircle className="h-3.5 w-3.5" />
                  El stock se reintegra automáticamente al almacén <strong>{venta.almacen_nombre}</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-3">
          {step !== 'buscar' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep(step === 'confirmar' ? 'seleccionar' : 'buscar')}
              disabled={confirmando}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Button>
          )}
          <div className="flex-1"></div>
          {step === 'seleccionar' && (
            <Button variant="premium" onClick={irAConfirmar} disabled={itemsSeleccionados === 0}>
              Continuar
            </Button>
          )}
          {step === 'confirmar' && (
            <Button variant="premium" onClick={confirmar} disabled={confirmando}>
              {confirmando && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar {tipo.toLowerCase()}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
