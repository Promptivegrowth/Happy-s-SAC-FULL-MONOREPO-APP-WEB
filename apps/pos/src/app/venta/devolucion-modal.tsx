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

import { useState, useTransition, useMemo } from 'react';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import {
  X, Search, Loader2, ArrowLeft, RotateCcw, Receipt, AlertCircle, ScanBarcode, Plus, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN } from '@happy/lib';
import {
  buscarVentaParaDevolucion,
  registrarDevolucion,
  registrarCambio,
  cargarDatosDevolucionPDF,
  type VentaDevolucionData,
} from '@/server/actions/devoluciones';

type Step = 'buscar' | 'seleccionar' | 'entrega' | 'confirmar';
type TipoDevolucion = 'DEVOLUCION' | 'CAMBIO';
type Metodo = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA' | 'DEPOSITO' | 'CREDITO';

export type VarianteDev = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  talla: string;
  precio: number;
  producto_nombre: string;
  stock: number;
};

type LineaEntrega = {
  variante_id: string;
  sku: string;
  producto_nombre: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
};

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

export function DevolucionModal({
  variantes,
  cajaId,
  sesionId,
  onClose,
  onCompleted,
}: {
  variantes: VarianteDev[];
  cajaId: string;
  sesionId: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
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

  // CAMBIO — productos entregados al cliente
  const [entregaScan, setEntregaScan] = useState('');
  const [entregaLineas, setEntregaLineas] = useState<LineaEntrega[]>([]);

  function agregarVarianteAEntrega(v: VarianteDev) {
    // Validar stock disponible. Si ya hay esa variante en la lista,
    // sumamos +1 sólo si no supera el stock.
    const existe = entregaLineas.find((l) => l.variante_id === v.id);
    const cantActual = existe?.cantidad ?? 0;
    if (cantActual + 1 > v.stock) {
      toast.error(`Sin stock: solo hay ${v.stock} unid. de ${v.producto_nombre} talla ${v.talla.replace('T', '')}`);
      return;
    }
    if (existe) {
      setEntregaLineas(entregaLineas.map((l) =>
        l.variante_id === v.id ? { ...l, cantidad: l.cantidad + 1 } : l,
      ));
    } else {
      setEntregaLineas([
        ...entregaLineas,
        {
          variante_id: v.id,
          sku: v.sku,
          producto_nombre: v.producto_nombre,
          talla: v.talla,
          cantidad: 1,
          precio_unitario: v.precio,
        },
      ]);
    }
    setEntregaScan('');
  }

  function agregarEntregaPorCodigo(input: string) {
    const q = input.trim();
    if (!q) return;
    // 1) Match exacto por código de barras o SKU (típico escaneo)
    const exacto = variantes.find(
      (x) => x.codigo_barras === q || x.sku.toLowerCase() === q.toLowerCase(),
    );
    if (exacto) { agregarVarianteAEntrega(exacto); return; }
    // 2) Si no hubo exacto y la query es texto, intentar primera coincidencia por nombre
    const primero = coincidenciasEntrega[0];
    if (primero) { agregarVarianteAEntrega(primero); return; }
    toast.error('Producto no encontrado');
  }

  // Búsqueda en tiempo real por nombre / SKU / código de barras
  const coincidenciasEntrega = useMemo(() => {
    const q = entregaScan.trim().toLowerCase();
    if (q.length < 2) return [];
    return variantes
      .filter((v) =>
        v.producto_nombre.toLowerCase().includes(q) ||
        v.sku.toLowerCase().includes(q) ||
        (v.codigo_barras ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [entregaScan, variantes]);

  function setEntregaCantidad(varId: string, cant: number) {
    if (cant <= 0) {
      setEntregaLineas(entregaLineas.filter((l) => l.variante_id !== varId));
      return;
    }
    // Validar contra stock disponible
    const v = variantes.find((x) => x.id === varId);
    const stock = v?.stock ?? 0;
    if (cant > stock) {
      toast.error(`Sin stock: solo hay ${stock} unid. disponibles`);
      return;
    }
    setEntregaLineas(entregaLineas.map((l) => l.variante_id === varId ? { ...l, cantidad: cant } : l));
  }
  function quitarEntrega(varId: string) {
    setEntregaLineas(entregaLineas.filter((l) => l.variante_id !== varId));
  }

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

  const totalEntrega = entregaLineas.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
  const diferencia = Math.round((totalEntrega - totalSeleccionado) * 100) / 100;

  function irSiguienteDesdeSeleccionar() {
    if (itemsSeleccionados === 0) {
      toast.error('Seleccioná al menos 1 unidad a devolver');
      return;
    }
    setStep(tipo === 'CAMBIO' ? 'entrega' : 'confirmar');
  }

  function irAConfirmarDesdeEntrega() {
    if (entregaLineas.length === 0) {
      toast.error('Agregá al menos un producto entregado al cliente');
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
      let devolucionId: string | null = null;
      let mensajeExito = '';

      if (tipo === 'DEVOLUCION') {
        const r = await registrarDevolucion({
          venta_id: venta.venta_id,
          almacen_id: venta.almacen_id,
          tipo,
          motivo: motivo.trim(),
          observacion: observacion || null,
          metodo_devolucion: metodo,
          monto_devuelto: totalSeleccionado,
          lineas: lineasDevolver,
        });
        if (!r.ok) { toast.error(r.error ?? 'Error'); return; }
        devolucionId = r.data!.id;
        mensajeExito = `✅ ${r.data!.numero} · ${formatPEN(totalSeleccionado)}`;
      } else {
        // CAMBIO atómico: devolución + venta nueva + diferencia
        if (entregaLineas.length === 0) {
          toast.error('Agregá los productos entregados al cliente');
          return;
        }
        const r = await registrarCambio({
          venta_id: venta.venta_id,
          almacen_id: venta.almacen_id,
          caja_id: cajaId,
          caja_sesion_id: sesionId,
          motivo: motivo.trim(),
          observacion: observacion || null,
          lineas_devueltas: lineasDevolver,
          productos_nuevos: entregaLineas.map((l) => ({
            variante_id: l.variante_id,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
          })),
          metodo_diferencia_cobro: diferencia > 0.01
            ? (metodo === 'CREDITO' ? 'EFECTIVO' : metodo)
            : null,
          metodo_diferencia_devuelta: diferencia < -0.01 ? metodo : null,
        });
        if (!r.ok) { toast.error(r.error ?? 'Error'); return; }
        devolucionId = r.data!.devolucion_id;
        const dif = r.data!.diferencia;
        mensajeExito = `✅ Cambio ${r.data!.devolucion_numero} · ` + (
          dif > 0.01 ? `Cobrado adicional ${formatPEN(dif)}` :
          dif < -0.01 ? `Devuelto ${formatPEN(Math.abs(dif))}` :
          'Sin diferencia'
        );
      }

      toast.success(mensajeExito);

      // Auto-descargar PDF (con sección de entrega si fue cambio)
      try {
        const data = await cargarDatosDevolucionPDF(devolucionId!);
        if (data) {
          const { generarComprobanteDevolucionPDF } = await import('./devolucion-pdf');
          await generarComprobanteDevolucionPDF(data);
        }
      } catch (e) {
        toast.error('Operación OK pero error al generar PDF: ' + (e as Error).message);
      }

      onCompleted();
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
              {step === 'entrega' && 'Productos entregados al cliente'}
              {step === 'confirmar' && (tipo === 'CAMBIO' ? 'Confirmar cambio' : 'Confirmar devolución')}
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

              {/* Selector de tipo MUY arriba para que el cajero sepa qué va a hacer */}
              <div>
                <Label className="text-xs">Tipo de operación *</Label>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipo('DEVOLUCION')}
                    className={`rounded-lg border-2 p-2 text-left transition ${tipo === 'DEVOLUCION' ? 'border-rose-500 bg-rose-50' : 'border-slate-200 hover:border-rose-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-rose-600" />
                      <span className="text-sm font-semibold">Devolución</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Cliente devuelve y recibe dinero</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('CAMBIO')}
                    className={`rounded-lg border-2 p-2 text-left transition ${tipo === 'CAMBIO' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}
                  >
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-semibold">Cambio</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Devuelve y se lleva otro producto</p>
                  </button>
                </div>
              </div>

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

          {/* STEP 3 — ENTREGA (solo cuando tipo=CAMBIO) */}
          {step === 'entrega' && venta && (
            <div className="space-y-4">
              <Card className="bg-indigo-50 p-3">
                <p className="text-xs text-indigo-800">
                  El cliente devolvió <strong>{itemsSeleccionados} unid.</strong> por <strong>{formatPEN(totalSeleccionado)}</strong>.
                  Agregá los productos que se lleva.
                </p>
              </Card>

              <div>
                <Label className="text-xs">Buscar por nombre, SKU o código de barras</Label>
                <div className="relative mt-1">
                  <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <Input
                    value={entregaScan}
                    onChange={(e) => setEntregaScan(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        agregarEntregaPorCodigo(entregaScan);
                      } else if (e.key === 'Escape') {
                        setEntregaScan('');
                      }
                    }}
                    placeholder="Ej. 'pantalon verde', SKU o escanear código…"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {/* Dropdown de coincidencias mientras tipea (≥2 chars) */}
                {coincidenciasEntrega.length > 0 && (
                  <div className="mt-1 max-h-56 overflow-y-auto rounded-md border border-indigo-200 bg-white shadow-lg">
                    {coincidenciasEntrega.map((v) => {
                      const yaAgregado = entregaLineas.find((l) => l.variante_id === v.id)?.cantidad ?? 0;
                      const disponible = Math.max(0, v.stock - yaAgregado);
                      const sinStock = disponible === 0;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => agregarVarianteAEntrega(v)}
                          disabled={sinStock}
                          className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-0 ${
                            sinStock ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'hover:bg-indigo-50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-corp-900">{v.producto_nombre}</p>
                            <p className="text-[10px] text-slate-500">
                              {v.sku} · Talla {v.talla.replace('T', '')}
                              {v.codigo_barras && <> · {v.codigo_barras}</>}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end">
                            <span className="font-mono text-sm font-semibold text-indigo-700">{formatPEN(v.precio)}</span>
                            <span className={`text-[10px] ${sinStock ? 'text-rose-600' : disponible <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {sinStock ? 'Sin stock' : `Stock: ${disponible}`}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {entregaScan.trim().length >= 2 && coincidenciasEntrega.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Sin coincidencias para "{entregaScan}". Probá otro nombre o escaneá el código.
                  </p>
                )}
              </div>

              {entregaLineas.length > 0 && (
                <div className="rounded-md border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cantidad</TableHead>
                        <TableHead className="text-right">P. Unit.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entregaLineas.map((l) => {
                        const stockReal = variantes.find((v) => v.id === l.variante_id)?.stock ?? 0;
                        return (
                        <TableRow key={l.variante_id}>
                          <TableCell>
                            <div className="text-sm font-medium text-corp-900">{l.producto_nombre}</div>
                            <div className="text-[10px] text-slate-500">
                              {l.sku} · Talla {l.talla.replace('T', '')} · Stock: {stockReal}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min={1}
                              max={stockReal}
                              value={l.cantidad}
                              onChange={(e) => setEntregaCantidad(l.variante_id, Math.max(0, parseInt(e.target.value || '0', 10)))}
                              className="h-8 w-20 text-center font-mono"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatPEN(l.precio_unitario)}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">{formatPEN(l.cantidad * l.precio_unitario)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => quitarEntrega(l.variante_id)}>
                              <Trash2 className="h-3 w-3 text-rose-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Comparativa devuelto vs entregado */}
              <Card className="space-y-1 p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total devuelto:</span>
                  <span className="font-mono font-semibold text-rose-700">{formatPEN(totalSeleccionado)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total entregado:</span>
                  <span className="font-mono font-semibold text-indigo-700">{formatPEN(totalEntrega)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold">
                      {diferencia > 0.01 ? 'Cobrar al cliente' : diferencia < -0.01 ? 'Devolver al cliente' : 'Sin diferencia'}
                    </span>
                    <span className={`font-display text-lg font-bold ${diferencia > 0.01 ? 'text-amber-700' : diferencia < -0.01 ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {formatPEN(Math.abs(diferencia))}
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* STEP 4 — CONFIRMAR */}
          {step === 'confirmar' && venta && (
            <div className="space-y-4">
              <Card className={`p-3 ${tipo === 'CAMBIO' ? 'bg-indigo-50' : 'bg-rose-50'}`}>
                <Badge variant="outline" className="text-[10px]">
                  {tipo === 'CAMBIO' ? 'CAMBIO' : 'DEVOLUCIÓN'}
                </Badge>
                <p className="mt-1 text-xs text-slate-600">
                  Venta original: {venta.comprobante?.numero_completo ?? venta.numero_venta}
                </p>
                <p className="text-sm font-medium">{venta.cliente_nombre}</p>
                {tipo === 'CAMBIO' ? (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="block text-slate-500">Devuelve</span>
                      <strong>{itemsSeleccionados} u · {formatPEN(totalSeleccionado)}</strong>
                    </div>
                    <div>
                      <span className="block text-slate-500">Se lleva</span>
                      <strong>{entregaLineas.reduce((s, l) => s + l.cantidad, 0)} u · {formatPEN(totalEntrega)}</strong>
                    </div>
                    <div>
                      <span className="block text-slate-500">{diferencia > 0.01 ? 'Cobrar' : diferencia < -0.01 ? 'Devolver' : 'Diferencia'}</span>
                      <strong className={diferencia > 0.01 ? 'text-amber-700' : diferencia < -0.01 ? 'text-emerald-700' : ''}>
                        {formatPEN(Math.abs(diferencia))}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm">
                    <strong>{itemsSeleccionados}</strong> unidad(es) · Total: <strong>{formatPEN(totalSeleccionado)}</strong>
                  </p>
                )}
              </Card>

              <div>
                <Label className="text-xs">Motivo *</Label>
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. talla incorrecta, defecto, cambió de modelo"
                  className="mt-1"
                />
              </div>

              {/* Método aplica si:
                  - DEVOLUCION (siempre)
                  - CAMBIO con diferencia ≠ 0 (cobro o reembolso) */}
              {(tipo === 'DEVOLUCION' || Math.abs(diferencia) > 0.01) && (
                <div>
                  <Label className="text-xs">
                    Método {tipo === 'DEVOLUCION' ? 'de reembolso' : diferencia > 0 ? 'para cobrar la diferencia' : 'para devolver la diferencia'} *
                  </Label>
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
                  Stock devuelto reintegra al almacén <strong>{venta.almacen_nombre}</strong>.
                  {tipo === 'CAMBIO' && ' Stock entregado sale del mismo almacén.'}
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
              onClick={() => {
                if (step === 'confirmar') setStep(tipo === 'CAMBIO' ? 'entrega' : 'seleccionar');
                else if (step === 'entrega') setStep('seleccionar');
                else setStep('buscar');
              }}
              disabled={confirmando}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Button>
          )}
          <div className="flex-1"></div>
          {step === 'seleccionar' && (
            <Button variant="premium" onClick={irSiguienteDesdeSeleccionar} disabled={itemsSeleccionados === 0}>
              {tipo === 'CAMBIO' ? 'Seleccionar productos a entregar' : 'Continuar'}
            </Button>
          )}
          {step === 'entrega' && (
            <Button variant="premium" onClick={irAConfirmarDesdeEntrega} disabled={entregaLineas.length === 0}>
              Continuar a confirmación
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
