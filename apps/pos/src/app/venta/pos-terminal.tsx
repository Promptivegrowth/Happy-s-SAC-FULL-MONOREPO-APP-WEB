'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Trash2, Plus, Minus, ScanBarcode, X, Smartphone, CreditCard, Banknote, Building2, MessageCircle, Loader2, LayoutGrid, ShoppingBag, LogOut, Receipt, History, Send, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN, ordenTalla } from '@happy/lib';
import { buildPedidoWaMessage, buildWhatsappUrl } from '@happy/lib/whatsapp';
import { registrarVenta } from '@/server/actions/venta';
import { emitirComprobante, obtenerSesionActiva } from '@/server/actions/caja';
import type { SesionCajaDTO, BalanceCajaDTO } from '@/server/actions/caja-helpers';
import { AbrirCajaModal } from './abrir-caja-modal';
import { CerrarCajaModal } from './cerrar-caja-modal';
import { CobrarModal, type CobrarPayload } from './cobrar-modal';
import { generarTicket, generarA4, abrirPDF } from './comprobante-pdf';
import { HistorialModal } from './historial-modal';
import { DevolucionModal } from './devolucion-modal';
import { construirMensajeWhatsApp, abrirWhatsApp } from './whatsapp-helper';

type Variante = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  talla: string;
  precio_publico: number | null;
  productos: {
    id: string;
    nombre: string;
    codigo: string;
    imagen_principal_url: string | null;
    categoria_id: string | null;
    categorias?: { id: string; nombre: string; activo: boolean } | null;
  };
};
type Caja = { id: string; codigo: string; nombre: string; almacen_id: string };
type Categoria = { id: string; nombre: string; activo: boolean };
type LineaCarrito = { variante: Variante; cantidad: number };
type MetodoCarrito = 'EFECTIVO' | 'YAPE' | 'PLIN' | 'TARJETA_DEBITO' | 'TARJETA_CREDITO' | 'TRANSFERENCIA' | 'WHATSAPP_PENDIENTE';
type PagoLinea = { metodo: MetodoCarrito; monto: number };

export function PosTerminal({
  variantes,
  cajas,
  categorias = [],
  stockPorVariante = {},
  cajeroNombre,
  cajaDefault,
  sesionInicial,
  empresaNombre = 'HAPPY SAC',
}: {
  variantes: Variante[];
  cajas: Caja[];
  categorias?: Categoria[];
  stockPorVariante?: Record<string, number>;
  cajeroNombre: string;
  cajaDefault: { id: string; nombre: string; codigo: string; almacen_id: string; monto_apertura_default: number } | null;
  sesionInicial: { sesion: SesionCajaDTO; balance: BalanceCajaDTO } | null;
  empresaNombre?: string;
}) {
  // --- Sesión de caja ---
  const [sesionActiva, setSesionActiva] = useState<SesionCajaDTO | null>(sesionInicial?.sesion ?? null);
  const [balanceActual, setBalanceActual] = useState<BalanceCajaDTO | null>(sesionInicial?.balance ?? null);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [devolucionOpen, setDevolucionOpen] = useState(false);
  const [cobrarOpen, setCobrarOpen] = useState(false);
  // Counter para forzar REMOUNT del CobrarModal después de cada venta.
  // Cuando incrementa, React re-monta el modal con state limpio
  // garantizando que NO queden datos del cliente anterior.
  const [cobrarKey, setCobrarKey] = useState(0);

  // --- Venta en curso ---
  const [search, setSearch] = useState('');
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [pagos, setPagos] = useState<PagoLinea[]>([]);
  const [tipoCliente, setTipoCliente] = useState<'rapido' | 'completo'>('rapido');
  const [nombreCliente, setNombreCliente] = useState('');
  const [docCliente, setDocCliente] = useState('');
  const [vista, setVista] = useState<'busqueda' | 'catalogo'>('busqueda');
  const [catFiltro, setCatFiltro] = useState<string>('');
  const [productoTallasOpen, setProductoTallasOpen] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cuando hay sesión activa, fijamos la caja del terminal a la sesión actual.
  // (la sesión define a qué caja vendemos: no permitimos cambiar mid-session)
  const cajaId = sesionActiva?.caja_id ?? cajas[0]?.id ?? '';
  const cajaActual = sesionActiva
    ? { id: sesionActiva.caja_id, codigo: sesionActiva.caja_codigo, nombre: sesionActiva.caja_nombre, almacen_id: sesionActiva.almacen_id }
    : cajas.find((c) => c.id === cajaId) ?? null;

  async function refrescarSesion() {
    const r = await obtenerSesionActiva();
    setSesionActiva(r?.sesion ?? null);
    setBalanceActual(r?.balance ?? null);
  }

  // Auto-focus en input para pistola de barras. Solo activo cuando:
  //  - estamos en modo búsqueda
  //  - no hay modal de talla, cobrar, cerrar caja, ni overlay de apertura
  // De lo contrario el handler captura clicks de los modales y "desfoca"
  // sus inputs constantemente (bug típico: usuario no puede escribir).
  useEffect(() => {
    if (vista !== 'busqueda' || productoTallasOpen || !sesionActiva || cerrarOpen || cobrarOpen) return;
    inputRef.current?.focus();
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // No quitar focus al hacer click en botones del catálogo / talla / inputs editables
      if (t.closest('[data-pos-no-focus]')) return;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (t.isContentEditable) return;
      inputRef.current?.focus();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [vista, productoTallasOpen, sesionActiva, cerrarOpen, cobrarOpen]);

  const total = useMemo(() => carrito.reduce((a, l) => a + l.cantidad * Number(l.variante.precio_publico ?? 0), 0), [carrito]);
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);

  // Agrupar variantes por producto para vista de catálogo
  const productosAgrupados = useMemo(() => {
    const map = new Map<string, { producto: Variante['productos']; variantes: Variante[] }>();
    for (const v of variantes) {
      if (catFiltro && v.productos.categoria_id !== catFiltro) continue;
      const cur = map.get(v.productos.id);
      if (cur) cur.variantes.push(v);
      else map.set(v.productos.id, { producto: v.productos, variantes: [v] });
    }
    return Array.from(map.values()).sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  }, [variantes, catFiltro]);

  function agregarPorBarcode(input: string) {
    const barcode = input.trim();
    if (!barcode) return;
    const v = variantes.find((x) => x.codigo_barras === barcode || x.sku === barcode);
    if (!v) {
      toast.error(`Producto no encontrado: ${barcode}`);
      return;
    }
    agregarVariante(v);
    setSearch('');
  }

  function agregarVariante(v: Variante) {
    const stock = stockPorVariante[v.id] ?? 0;
    if (stock <= 0) {
      // Permitir vender igual pero avisar
      toast.warning(`Talla ${v.talla.replace('T', '')} sin stock — se venderá igual`);
    }
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.variante.id === v.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx]!, cantidad: copy[idx]!.cantidad + 1 };
        return copy;
      }
      return [...prev, { variante: v, cantidad: 1 }];
    });
    setProductoTallasOpen(null);
  }

  function setQty(varianteId: string, qty: number) {
    setCarrito((prev) => prev.map((l) => l.variante.id === varianteId ? { ...l, cantidad: Math.max(1, qty) } : l));
  }

  function eliminar(varianteId: string) {
    setCarrito((prev) => prev.filter((l) => l.variante.id !== varianteId));
  }

  function agregarPago(metodo: MetodoCarrito, monto: number) {
    if (monto <= 0) return;
    setPagos((p) => [...p, { metodo, monto }]);
  }

  function quitarPago(idx: number) {
    setPagos((p) => p.filter((_, i) => i !== idx));
  }

  const [cobrando, setCobrando] = useState(false);

  function abrirModalCobrar() {
    if (!sesionActiva) return toast.error('Abre la caja primero');
    if (carrito.length === 0) return toast.error('Carrito vacío');
    if (pagado < total) return toast.error(`Falta cobrar ${formatPEN(total - pagado)}`);
    if (!cajaActual) return toast.error('No hay caja activa');
    setCobrarOpen(true);
  }

  async function ejecutarCobro(payload: CobrarPayload) {
    if (!sesionActiva || !cajaActual) {
      toast.error('No hay sesión de caja activa');
      return;
    }
    setCobrando(true);
    try {
      // 1) Registrar venta (sin emitir comprobante — lo hacemos abajo con el flujo nuevo)
      const r = await registrarVenta({
        caja_id: cajaActual.id,
        almacen_id: cajaActual.almacen_id,
        cliente_id: payload.cliente.cliente_id,
        documento_cliente: payload.cliente.numero_documento,
        tipo_documento_cliente: payload.cliente.tipo_documento,
        nombre_cliente_rapido: payload.cliente.razon_social
          ?? [payload.cliente.nombres, payload.cliente.apellidos].filter(Boolean).join(' ').trim()
          ?? null,
        // Forzamos NOTA_VENTA en `registrarVenta` para que NO cree el comprobante ahí —
        // la emisión real (con el cliente que vino del modal) la hace `emitirComprobante`.
        tipo_comprobante: 'NOTA_VENTA',
        items: carrito.map((l) => ({
          variante_id: l.variante.id,
          cantidad: l.cantidad,
          precio_unitario: Number(l.variante.precio_publico ?? 0),
          descuento_monto: 0,
        })),
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      // 2) Emitir comprobante real (BOLETA, FACTURA o NOTA_VENTA)
      let numeroComprobante = '';
      try {
        const emitido = await emitirComprobante({
          venta_id: r.venta_id,
          tipo: payload.tipo,
          cliente_data: {
            razon_social: payload.cliente.razon_social,
            nombres: payload.cliente.nombres,
            apellidos: payload.cliente.apellidos,
            tipo_documento: payload.cliente.tipo_documento,
            numero_documento: payload.cliente.numero_documento,
            direccion: payload.cliente.direccion,
          },
        });
        numeroComprobante = emitido.numero_completo;

        // 3) Generar PDF según formato (ahora async: carga logo + QR)
        const blob = payload.formato === 'TICKET_80MM'
          ? await generarTicket(emitido.pdf_data)
          : await generarA4(emitido.pdf_data);
        const filename = `${payload.tipo.toLowerCase()}_${numeroComprobante.replace(/[^A-Za-z0-9_-]/g, '_')}.pdf`;
        abrirPDF(blob, filename);

        // 4) Si el cliente tiene teléfono, ofrecer envío por WhatsApp
        if (payload.cliente.telefono && payload.tipo !== 'NOTA_VENTA') {
          const telefono = payload.cliente.telefono;
          const nombreCli =
            payload.cliente.razon_social ??
            [payload.cliente.nombres, payload.cliente.apellidos].filter(Boolean).join(' ').trim() ??
            'cliente';
          toast(`📲 Enviar comprobante a ${telefono} por WhatsApp?`, {
            duration: 12_000,
            action: {
              label: 'Enviar',
              onClick: () => {
                const msg = construirMensajeWhatsApp({
                  nombre_cliente: nombreCli,
                  numero_comprobante: numeroComprobante,
                  tipo_comprobante: payload.tipo,
                  total,
                  fecha: new Date(),
                  empresa_nombre: empresaNombre,
                });
                abrirWhatsApp(telefono, msg);
              },
            },
          });
        }
      } catch (e) {
        toast.error(`Venta OK pero error al emitir comprobante: ${(e as Error).message}`);
      }

      toast.success(
        `✅ ${r.numero}${numeroComprobante ? ` · ${numeroComprobante}` : ''} · ${formatPEN(total)}`,
      );
      // Reset COMPLETO — el contador cobrarKey fuerza un remount fresco
      // del CobrarModal en la próxima apertura, así NO queda info del cliente anterior.
      setCarrito([]);
      setPagos([]);
      setNombreCliente('');
      setDocCliente('');
      setTipoCliente('rapido');
      setCobrarOpen(false);
      setCobrarKey((k) => k + 1);
      // Refrescar balance para que el cierre vea la venta
      void refrescarSesion();
    } finally {
      setCobrando(false);
    }
  }

  function pedirPorWhatsapp() {
    if (carrito.length === 0) return;
    const msg = buildPedidoWaMessage({
      cliente: { nombre: nombreCliente, documento: docCliente },
      items: carrito.map((l) => ({
        sku: l.variante.sku, nombre: l.variante.productos.nombre, talla: l.variante.talla,
        cantidad: l.cantidad, precioUnit: Number(l.variante.precio_publico ?? 0),
      })),
      canal: 'POS',
    });
    window.open(buildWhatsappUrl(msg), '_blank');
  }

  const sugerencias = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return variantes
      .filter((v) => v.sku.toLowerCase().includes(q)
        || v.codigo_barras?.toLowerCase().includes(q)
        || v.productos.nombre.toLowerCase().includes(q))
      .slice(0, 12);
  }, [search, variantes]);

  const tallasDelProductoOpen = useMemo(() => {
    if (!productoTallasOpen) return [];
    return [...variantes.filter((v) => v.productos.id === productoTallasOpen)].sort(
      (a, b) => ordenTalla(a.talla) - ordenTalla(b.talla),
    );
  }, [productoTallasOpen, variantes]);

  return (
    <div className="grid h-screen grid-cols-1 lg:grid-cols-[1fr_420px]">
      {/* IZQUIERDA — Búsqueda + carrito */}
      <section className="flex h-screen flex-col bg-white">
        <header className="border-b p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 items-center rounded-md border bg-slate-50 px-2 text-sm">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="font-medium text-corp-900">{sesionActiva?.caja_nombre ?? cajaActual?.nombre ?? '—'}</span>
              <span className="ml-1.5 text-xs text-slate-500">· {cajeroNombre}</span>
            </div>
            {sesionActiva && (
              <Badge variant="success" className="gap-1">Caja abierta</Badge>
            )}

            {/* Toggle vista búsqueda / catálogo */}
            <div className="ml-auto flex rounded-md border bg-slate-50 p-0.5" data-pos-no-focus>
              <button
                onClick={() => setVista('busqueda')}
                className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition ${
                  vista === 'busqueda' ? 'bg-white shadow-sm text-corp-900' : 'text-slate-500'
                }`}
              >
                <ScanBarcode className="h-3.5 w-3.5" /> Búsqueda
              </button>
              <button
                onClick={() => setVista('catalogo')}
                className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition ${
                  vista === 'catalogo' ? 'bg-white shadow-sm text-corp-900' : 'text-slate-500'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Catálogo
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistorialOpen(true)}
              disabled={!sesionActiva}
              data-pos-no-focus
              className="gap-1 text-xs"
              title="Historial de transacciones de la sesión"
            >
              <History className="h-3.5 w-3.5" /> Historial
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDevolucionOpen(true)}
              disabled={!sesionActiva}
              data-pos-no-focus
              className="gap-1 text-xs"
              title="Devolución o cambio de mercadería"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Devolución
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCerrarOpen(true)}
              disabled={!sesionActiva}
              data-pos-no-focus
              className="gap-1 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" /> Cerrar caja
            </Button>
          </div>
          <div className="relative">
            <ScanBarcode className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-happy-500" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && agregarPorBarcode(search)}
              placeholder="Escanea código de barras o busca por SKU/nombre…"
              className="h-12 pl-11 text-base"
              autoFocus
            />
          </div>
          {sugerencias.length > 0 && (
            <div className="mt-2 max-h-60 overflow-auto rounded-md border bg-white shadow-sm" data-pos-no-focus>
              {sugerencias.map((v) => {
                const stock = stockPorVariante[v.id] ?? 0;
                return (
                  <button
                    key={v.id}
                    onClick={() => agregarPorBarcode(v.sku)}
                    className="flex w-full items-center gap-3 border-b p-2 text-left text-sm hover:bg-slate-50 last:border-0"
                  >
                    <div className="font-mono text-xs text-slate-400">{v.sku}</div>
                    <div className="flex-1">{v.productos.nombre}</div>
                    <Badge
                      variant={stock <= 0 ? 'destructive' : 'outline'}
                      className={`text-[10px] ${stock <= 0 ? 'line-through' : ''}`}
                    >
                      {v.talla.replace('T', '')}
                    </Badge>
                    <div className="font-semibold text-happy-600">{formatPEN(Number(v.precio_publico ?? 0))}</div>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-auto p-4">
          {vista === 'catalogo' ? (
            <div data-pos-no-focus>
              {/* Filtros de categoría */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500">Categoría:</span>
                <button
                  onClick={() => setCatFiltro('')}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    !catFiltro ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Todas ({productosAgrupados.length})
                </button>
                {categorias.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCatFiltro(c.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      catFiltro === c.id ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>

              {/* Grid de productos */}
              {productosAgrupados.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-400">
                  Sin productos en esta categoría
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {productosAgrupados.map(({ producto, variantes: vars }) => {
                    const precioMin = Math.min(
                      ...vars.map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0),
                    );
                    const stockTotal = vars.reduce((a, v) => a + (stockPorVariante[v.id] ?? 0), 0);
                    return (
                      <button
                        key={producto.id}
                        onClick={() => setProductoTallasOpen(producto.id)}
                        className="group flex flex-col overflow-hidden rounded-lg border bg-white text-left transition hover:-translate-y-0.5 hover:border-happy-400 hover:shadow-md"
                      >
                        <div className="relative aspect-square bg-slate-50">
                          {producto.imagen_principal_url ? (
                            <Image
                              src={producto.imagen_principal_url}
                              alt={producto.nombre}
                              fill
                              className="object-cover transition group-hover:scale-105"
                              sizes="200px"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-3xl">🎭</div>
                          )}
                          {stockTotal === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40">
                              <span className="rounded bg-slate-900/90 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                                Sin stock
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="line-clamp-2 text-xs font-medium leading-tight text-corp-900">{producto.nombre}</p>
                          <p className="mt-1 font-display text-sm font-semibold text-happy-600">
                            {Number.isFinite(precioMin) ? formatPEN(precioMin) : 'S/—'}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Modal/popover selector de talla */}
              {productoTallasOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
                  onClick={() => setProductoTallasOpen(null)}
                >
                  <Card
                    className="w-full max-w-md p-5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h3 className="font-display text-base font-semibold text-corp-900">
                          {tallasDelProductoOpen[0]?.productos.nombre}
                        </h3>
                        <p className="text-xs text-slate-500">Selecciona una talla</p>
                      </div>
                      <button onClick={() => setProductoTallasOpen(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {tallasDelProductoOpen.map((v) => {
                        const stock = stockPorVariante[v.id] ?? 0;
                        const sinStock = stock <= 0;
                        return (
                          <button
                            key={v.id}
                            onClick={() => agregarVariante(v)}
                            className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition ${
                              sinStock
                                ? 'border-dashed border-red-200 bg-red-50/40 text-red-600'
                                : 'border-slate-200 bg-white text-corp-900 hover:border-happy-400 hover:bg-happy-50'
                            }`}
                          >
                            <span className="font-display text-lg font-bold">{v.talla.replace('T', '')}</span>
                            <span className="text-[10px] font-mono text-slate-500">{v.sku}</span>
                            <span className="text-xs font-semibold text-happy-600">{formatPEN(Number(v.precio_publico ?? 0))}</span>
                            <span className={`text-[9px] ${sinStock ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                              {sinStock ? 'Sin stock' : `Stock: ${stock}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                </div>
              )}
            </div>
          ) : carrito.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              <div className="text-center">
                <ScanBarcode className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                <p className="mb-3">Escanea o busca un producto para empezar</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVista('catalogo')}
                  data-pos-no-focus
                >
                  <LayoutGrid className="h-4 w-4" /> Ver catálogo completo
                </Button>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {carrito.map((l) => (
                <li key={l.variante.id}>
                  <Card className="flex items-center gap-3 p-3">
                    <div className="flex-1">
                      <p className="font-medium">{l.variante.productos.nombre}</p>
                      <p className="text-xs text-slate-500">SKU {l.variante.sku} · Talla {l.variante.talla.replace('T','')} · {formatPEN(Number(l.variante.precio_publico ?? 0))} c/u</p>
                    </div>
                    <div className="flex items-center rounded-md border">
                      <button onClick={() => setQty(l.variante.id, l.cantidad - 1)} className="px-3 py-2 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                      <span className="min-w-10 text-center font-semibold">{l.cantidad}</span>
                      <button onClick={() => setQty(l.variante.id, l.cantidad + 1)} className="px-3 py-2 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
                    </div>
                    <div className="w-24 text-right font-display text-base font-semibold">
                      {formatPEN(l.cantidad * Number(l.variante.precio_publico ?? 0))}
                    </div>
                    <button onClick={() => eliminar(l.variante.id)} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Mini carrito flotante (visible solo en vista catálogo cuando hay items) */}
        {vista === 'catalogo' && carrito.length > 0 && (
          <div className="border-t bg-happy-50/60 p-3" data-pos-no-focus>
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-5 w-5 text-happy-600" />
              <span className="text-sm font-medium">
                {carrito.length} ítem{carrito.length === 1 ? '' : 's'} · {formatPEN(total)}
              </span>
              <Button variant="outline" size="sm" onClick={() => setVista('busqueda')} className="ml-auto">
                Ver carrito
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* DERECHA — Cliente + Pago */}
      <aside className="flex h-screen flex-col border-l bg-slate-50">
        <div className="border-b bg-white p-4">
          <div className="mb-3 flex gap-2 text-xs">
            <button onClick={() => setTipoCliente('rapido')} className={`flex-1 rounded-md px-3 py-2 ${tipoCliente === 'rapido' ? 'bg-happy-100 font-medium text-happy-700' : 'text-slate-500'}`}>Cliente rápido</button>
            <button onClick={() => setTipoCliente('completo')} className={`flex-1 rounded-md px-3 py-2 ${tipoCliente === 'completo' ? 'bg-happy-100 font-medium text-happy-700' : 'text-slate-500'}`}>Con DNI/RUC</button>
          </div>
          {tipoCliente === 'rapido' ? (
            <Input value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Nombre (opcional)" />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input value={docCliente} onChange={(e) => setDocCliente(e.target.value)} placeholder="DNI/RUC" />
              <Input value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Razón social/Nombre" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Métodos de pago</p>
          <div className="grid grid-cols-2 gap-2">
            {([
              { m: 'EFECTIVO', label: 'Efectivo', icon: <Banknote className="h-4 w-4" />, color: 'bg-emerald-50 text-emerald-700' },
              { m: 'YAPE', label: 'Yape', icon: <Smartphone className="h-4 w-4" />, color: 'bg-purple-50 text-purple-700' },
              { m: 'PLIN', label: 'Plin', icon: <Smartphone className="h-4 w-4" />, color: 'bg-blue-50 text-blue-700' },
              { m: 'TARJETA_CREDITO', label: 'Tarjeta', icon: <CreditCard className="h-4 w-4" />, color: 'bg-slate-100 text-slate-700' },
              { m: 'TRANSFERENCIA', label: 'Transfer.', icon: <Building2 className="h-4 w-4" />, color: 'bg-slate-100 text-slate-700' },
            ] as const).map((p) => (
              <button
                key={p.m}
                onClick={() => agregarPago(p.m as MetodoCarrito, Math.max(0, total - pagado))}
                className={`flex items-center gap-2 rounded-md p-3 text-sm font-medium ${p.color} hover:brightness-95`}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          {pagos.length > 0 && (
            <ul className="mt-4 space-y-1">
              {pagos.map((p, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md bg-white p-2 text-sm shadow-sm">
                  <Badge variant="secondary" className="text-[10px]">{p.metodo.replace('_', ' ')}</Badge>
                  <span className="ml-auto font-semibold">{formatPEN(p.monto)}</span>
                  <button onClick={() => quitarPago(i)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-wider text-slate-500">Total</span>
            <span className="font-display text-3xl font-bold text-corp-900">{formatPEN(total)}</span>
          </div>
          {pagado !== total && (
            <div className="mb-3 flex items-baseline justify-between text-sm">
              <span className="text-slate-500">{pagado < total ? 'Falta' : 'Vuelto'}</span>
              <span className={`font-mono font-semibold ${pagado < total ? 'text-danger' : 'text-emerald-600'}`}>
                {formatPEN(Math.abs(total - pagado))}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={pedirPorWhatsapp} variant="outline" disabled={carrito.length === 0} className="flex-1">
              <MessageCircle className="h-4 w-4" /> WA
            </Button>
            <Button
              onClick={abrirModalCobrar}
              variant="premium"
              size="lg"
              disabled={cobrando || carrito.length === 0 || pagado < total || !sesionActiva}
              className="flex-[2]"
            >
              {cobrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              Cobrar {formatPEN(total)}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Eliges tipo de comprobante (boleta/factura/interno) y formato (ticket/A4) en el siguiente paso.
          </p>
        </div>
      </aside>

      {/* MODAL — Apertura de caja (bloquea el terminal cuando no hay sesión) */}
      {!sesionActiva && (
        <AbrirCajaModal
          cajeroNombre={cajeroNombre}
          cajaNombre={cajaDefault?.nombre ?? null}
          cajaId={cajaDefault?.id ?? null}
          cajasDisponibles={cajas}
          montoDefault={cajaDefault?.monto_apertura_default ?? 100}
          onAbierta={() => void refrescarSesion()}
        />
      )}

      {/* MODAL — Cierre de caja */}
      {cerrarOpen && sesionActiva && balanceActual && (
        <CerrarCajaModal
          sesion={sesionActiva}
          balanceInicial={balanceActual}
          onClose={() => setCerrarOpen(false)}
          onCerrada={() => {
            setCerrarOpen(false);
            void refrescarSesion();
          }}
        />
      )}

      {/* MODAL — Cobro (selector de tipo + cliente + formato).
          `key` cambia tras cada venta exitosa para forzar remount fresco
          y evitar que datos del cliente anterior queden persistentes. */}
      {cobrarOpen && sesionActiva && (
        <CobrarModal
          key={`cobrar-${cobrarKey}`}
          total={total}
          pagado={pagado}
          defaultCliente={{ nombre: nombreCliente, documento: docCliente }}
          onCancel={() => setCobrarOpen(false)}
          onConfirmar={ejecutarCobro}
        />
      )}

      {/* MODAL — Historial de transacciones de la sesión */}
      {historialOpen && sesionActiva && (
        <HistorialModal
          onClose={() => setHistorialOpen(false)}
          empresaNombre={empresaNombre}
        />
      )}

      {/* MODAL — Devolución / Cambio de mercadería */}
      {devolucionOpen && sesionActiva && (
        <DevolucionModal
          onClose={() => setDevolucionOpen(false)}
          onCompleted={() => {
            setDevolucionOpen(false);
            void refrescarSesion();
          }}
        />
      )}
    </div>
  );
}
