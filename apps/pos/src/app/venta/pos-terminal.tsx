'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Trash2, Plus, Minus, ScanBarcode, X, Smartphone, CreditCard, Banknote, Building2, MessageCircle, Loader2, LayoutGrid, ShoppingBag, LogOut, Receipt, History, Send, RotateCcw, Coins, Wallet, MapPin, LogIn, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN, ordenTalla } from '@happy/lib';
import { buildPedidoWaMessage, buildWhatsappUrl } from '@happy/lib/whatsapp';
import { registrarVenta } from '@/server/actions/venta';
import { emitirComprobante, obtenerSesionActiva } from '@/server/actions/caja';
import { aplicarAdelantoAVenta } from '@/server/actions/adelantos';
import { cerrarSesionUsuario } from '@/server/actions/auth';
import type { SesionCajaDTO, BalanceCajaDTO } from '@/server/actions/caja-helpers';
import { AbrirCajaModal } from './abrir-caja-modal';
import { CerrarCajaModal } from './cerrar-caja-modal';
import { CobrarModal, type CobrarPayload } from './cobrar-modal';
import { generarTicket, generarA4, abrirPDF } from './comprobante-pdf';
import { HistorialModal } from './historial-modal';
import { GastosModal } from './gastos-modal';
import { AdelantosModal } from './adelantos-modal';
import { StockAlmacenesModal } from './stock-almacenes-modal';
import { DevolucionModal } from './devolucion-modal';
import { construirMensajeWhatsApp, abrirWhatsApp } from './whatsapp-helper';

type Variante = {
  id: string;
  sku: string;
  codigo_barras: string | null;
  talla: string;
  precio_publico: number | null;
  precio_mayorista_a?: number | null;
  precio_industrial?: number | null;
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
type ConfigEscalones = { mayorista_desde: number; industrial_desde: number; activos: boolean };
type EscalonAplicado = 'PUBLICO' | 'MAYORISTA' | 'INDUSTRIAL';

/**
 * Calcula el precio unitario según la cantidad y la configuración de escalones.
 * - Si los escalones están desactivados, siempre devuelve precio_publico.
 * - Si la variante no tiene precio_mayorista_a / precio_industrial cargados,
 *   cae a precio_publico (no se rompe el flujo de venta).
 */
function calcularPrecioPorCantidad(
  v: Variante,
  cantidad: number,
  cfg: ConfigEscalones,
): { precio: number; escalon: EscalonAplicado } {
  const publico = Number(v.precio_publico ?? 0);
  if (!cfg.activos || cantidad < cfg.mayorista_desde) {
    return { precio: publico, escalon: 'PUBLICO' };
  }
  if (cantidad >= cfg.industrial_desde) {
    const industrial = Number(v.precio_industrial ?? 0);
    return industrial > 0
      ? { precio: industrial, escalon: 'INDUSTRIAL' }
      : { precio: Number(v.precio_mayorista_a ?? publico), escalon: 'MAYORISTA' };
  }
  const mayorista = Number(v.precio_mayorista_a ?? 0);
  return mayorista > 0
    ? { precio: mayorista, escalon: 'MAYORISTA' }
    : { precio: publico, escalon: 'PUBLICO' };
}
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
  configEscalones = { mayorista_desde: 3, industrial_desde: 100, activos: true },
}: {
  variantes: Variante[];
  cajas: Caja[];
  categorias?: Categoria[];
  stockPorVariante?: Record<string, number>;
  cajeroNombre: string;
  cajaDefault: { id: string; nombre: string; codigo: string; almacen_id: string; monto_apertura_default: number } | null;
  sesionInicial: { sesion: SesionCajaDTO; balance: BalanceCajaDTO } | null;
  empresaNombre?: string;
  configEscalones?: ConfigEscalones;
}) {
  // --- Sesión de caja ---
  const [sesionActiva, setSesionActiva] = useState<SesionCajaDTO | null>(sesionInicial?.sesion ?? null);
  const [balanceActual, setBalanceActual] = useState<BalanceCajaDTO | null>(sesionInicial?.balance ?? null);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [gastosOpen, setGastosOpen] = useState(false);
  const [adelantosOpen, setAdelantosOpen] = useState(false);
  const [stockAlmacenesVarianteId, setStockAlmacenesVarianteId] = useState<string | null>(null);
  // Modal de apertura de caja — solo se abre cuando el cajero clickea
  // "Abrir caja" (ya NO se dispara automático al cargar sin sesión)
  const [abrirCajaOpen, setAbrirCajaOpen] = useState(false);
  const [devolucionOpen, setDevolucionOpen] = useState(false);
  const [efectivoInput, setEfectivoInput] = useState<string>('');
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

  // Por cada línea, decidir precio según cantidad y escalones
  const lineasConPrecio = useMemo(
    () => carrito.map((l) => {
      const r = calcularPrecioPorCantidad(l.variante, l.cantidad, configEscalones);
      return { ...l, precio_unitario: r.precio, escalon: r.escalon, subtotal: l.cantidad * r.precio };
    }),
    [carrito, configEscalones],
  );

  const total = useMemo(() => lineasConPrecio.reduce((a, l) => a + l.subtotal, 0), [lineasConPrecio]);
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
        items: lineasConPrecio.map((l) => ({
          variante_id: l.variante.id,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          descuento_monto: 0,
        })),
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      // 1.5) Si hay adelanto a aplicar, registrar la APLICACION (consume saldo del cliente)
      if (payload.adelanto_aplicado && payload.cliente.cliente_id) {
        try {
          const ra = await aplicarAdelantoAVenta({
            cliente_id: payload.cliente.cliente_id,
            venta_id: r.venta_id,
            monto: payload.adelanto_aplicado.monto,
          });
          if (ra.ok) {
            toast.success(`Adelanto aplicado · ${ra.numero}`);
          } else {
            // No abortamos la venta — solo avisamos. El cajero puede aplicar manualmente después.
            toast.warning(`Venta OK pero adelanto no se pudo aplicar: ${ra.error ?? '?'}`);
          }
        } catch (e) {
          toast.warning(`Venta OK pero error aplicando adelanto: ${(e as Error).message}`);
        }
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
      setEfectivoInput('');
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
      items: lineasConPrecio.map((l) => ({
        sku: l.variante.sku, nombre: l.variante.productos.nombre, talla: l.variante.talla,
        cantidad: l.cantidad, precioUnit: l.precio_unitario,
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
              variant="ghost"
              size="sm"
              onClick={() => setGastosOpen(true)}
              disabled={!sesionActiva}
              data-pos-no-focus
              className="gap-1 text-xs"
              title="Gastos de caja chica (combustible, comida, etc.)"
            >
              <Coins className="h-3.5 w-3.5" /> Gastos
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdelantosOpen(true)}
              disabled={!sesionActiva}
              data-pos-no-focus
              className="gap-1 text-xs"
              title="Adelantos de cliente (saldo a favor)"
            >
              <Wallet className="h-3.5 w-3.5" /> Adelantos
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (sesionActiva) {
                  if (!confirm('Tenés caja abierta. ¿Cerrar sesión sin cerrar caja? La caja queda abierta para el próximo turno.')) return;
                }
                void cerrarSesionUsuario();
              }}
              data-pos-no-focus
              className="gap-1 text-xs text-slate-500 hover:text-rose-600"
              title="Cerrar sesión del usuario (salir de la cuenta)"
            >
              <UserX className="h-3.5 w-3.5" /> Salir
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
                          <div key={v.id} className="relative">
                            <button
                              onClick={() => agregarVariante(v)}
                              className={`flex w-full flex-col items-center gap-1 rounded-lg border-2 p-3 transition ${
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
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setStockAlmacenesVarianteId(v.id); }}
                              className="absolute right-1 top-1 rounded-full bg-white p-1 text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-happy-50 hover:text-happy-600"
                              title="Ver stock en todos los almacenes"
                            >
                              <MapPin className="h-3 w-3" />
                            </button>
                          </div>
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
              {lineasConPrecio.map((l) => {
                const precioPublico = Number(l.variante.precio_publico ?? 0);
                const tieneDescuento = l.escalon !== 'PUBLICO' && precioPublico > 0 && l.precio_unitario < precioPublico;
                const ahorroPorUnidad = tieneDescuento ? precioPublico - l.precio_unitario : 0;
                return (
                  <li key={l.variante.id}>
                    <Card className="flex items-center gap-3 p-3">
                      <div className="flex-1">
                        <p className="font-medium">{l.variante.productos.nombre}</p>
                        <p className="text-xs text-slate-500">
                          SKU {l.variante.sku} · Talla {l.variante.talla.replace('T','')} ·{' '}
                          {tieneDescuento ? (
                            <>
                              <span className="line-through text-slate-400">{formatPEN(precioPublico)}</span>{' '}
                              <span className="font-semibold text-emerald-700">{formatPEN(l.precio_unitario)}</span>{' '}
                              c/u
                            </>
                          ) : (
                            <>{formatPEN(l.precio_unitario)} c/u</>
                          )}
                        </p>
                        {l.escalon !== 'PUBLICO' && (
                          <Badge
                            variant="secondary"
                            className={`mt-1 text-[10px] ${
                              l.escalon === 'MAYORISTA'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-violet-100 text-violet-700'
                            }`}
                          >
                            {l.escalon === 'MAYORISTA' ? '🏷 Precio mayorista' : '🏭 Precio fábrica'}
                            {ahorroPorUnidad > 0 && ` · ahorra ${formatPEN(ahorroPorUnidad * l.cantidad)}`}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center rounded-md border">
                        <button onClick={() => setQty(l.variante.id, l.cantidad - 1)} className="px-3 py-2 hover:bg-slate-50"><Minus className="h-4 w-4" /></button>
                        <span className="min-w-10 text-center font-semibold">{l.cantidad}</span>
                        <button onClick={() => setQty(l.variante.id, l.cantidad + 1)} className="px-3 py-2 hover:bg-slate-50"><Plus className="h-4 w-4" /></button>
                      </div>
                      <div className="w-24 text-right font-display text-base font-semibold">
                        {formatPEN(l.subtotal)}
                      </div>
                      <button onClick={() => eliminar(l.variante.id)} className="rounded p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                    </Card>
                  </li>
                );
              })}
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

          {/* EFECTIVO con input — para registrar monto real recibido y calcular vuelto */}
          <div className="mb-2 rounded-md border-2 border-emerald-200 bg-emerald-50 p-2">
            <div className="flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-700" />
              <span className="flex-1 text-xs font-semibold text-emerald-700">Efectivo recibido</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.10"
                  min={0}
                  inputMode="decimal"
                  value={efectivoInput}
                  onChange={(e) => setEfectivoInput(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder={(total - pagado).toFixed(2)}
                  className="h-9 w-24 rounded-md border border-emerald-300 bg-white px-2 text-right font-mono text-sm"
                  data-pos-no-focus
                />
                <button
                  onClick={() => {
                    const n = Number(efectivoInput || (total - pagado).toFixed(2));
                    if (n <= 0) return;
                    agregarPago('EFECTIVO', n);
                    setEfectivoInput('');
                  }}
                  className="rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Cobrar
                </button>
              </div>
            </div>
            {efectivoInput && Number(efectivoInput) > total - pagado && (
              <p className="mt-1 text-right text-[11px] text-emerald-700">
                Vuelto a entregar: <strong>{formatPEN(Math.max(0, Number(efectivoInput) - (total - pagado)))}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([
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

      {/* OVERLAY — Cuando no hay sesión: pantalla gris con botón centrado.
          NO auto-spawnea el modal — el cajero debe clickear "Abrir caja". */}
      {!sesionActiva && !abrirCajaOpen && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px]">
          <div className="pointer-events-auto rounded-2xl bg-white p-8 shadow-2xl text-center max-w-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-happy-100">
              <LogIn className="h-7 w-7 text-happy-600" />
            </div>
            <h3 className="font-display text-xl font-semibold text-corp-900">No hay caja abierta</h3>
            <p className="mt-1 text-sm text-slate-500">
              Para vender necesitás abrir tu turno con un monto inicial.
            </p>
            <Button
              onClick={() => setAbrirCajaOpen(true)}
              variant="premium"
              size="lg"
              className="mt-5 w-full"
            >
              <LogIn className="h-4 w-4" /> Abrir caja
            </Button>
            <p className="mt-3 text-[10px] text-slate-400">
              Podés navegar por la app aunque no tengas caja abierta (consultar historial, cerrar sesión).
            </p>
          </div>
        </div>
      )}

      {/* MODAL — Apertura de caja (solo cuando el cajero lo abre manualmente) */}
      {!sesionActiva && abrirCajaOpen && (
        <AbrirCajaModal
          cajeroNombre={cajeroNombre}
          cajaNombre={cajaDefault?.nombre ?? null}
          cajaId={cajaDefault?.id ?? null}
          cajasDisponibles={cajas}
          montoDefault={cajaDefault?.monto_apertura_default ?? 100}
          onAbierta={() => {
            setAbrirCajaOpen(false);
            void refrescarSesion();
          }}
          onClose={() => setAbrirCajaOpen(false)}
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

      {/* MODAL — Gastos / Caja chica */}
      {gastosOpen && sesionActiva && (
        <GastosModal onClose={() => setGastosOpen(false)} />
      )}

      {/* MODAL — Adelantos de cliente */}
      {adelantosOpen && sesionActiva && (
        <AdelantosModal onClose={() => setAdelantosOpen(false)} />
      )}

      {/* MODAL — Stock por almacén (lupita) */}
      {stockAlmacenesVarianteId && (
        <StockAlmacenesModal
          varianteId={stockAlmacenesVarianteId}
          onClose={() => setStockAlmacenesVarianteId(null)}
        />
      )}

      {/* MODAL — Devolución / Cambio de mercadería */}
      {devolucionOpen && sesionActiva && cajaActual && (
        <DevolucionModal
          variantes={variantes.map((v) => ({
            id: v.id,
            sku: v.sku,
            codigo_barras: v.codigo_barras,
            talla: v.talla,
            precio: Number(v.precio_publico ?? 0),
            producto_nombre: v.productos.nombre,
            stock: stockPorVariante[v.id] ?? 0,
          }))}
          cajaId={cajaActual.id}
          sesionId={sesionActiva.id}
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
