'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Trash2, Plus, Minus, ScanBarcode, X, Smartphone, CreditCard, Banknote, Building2, MessageCircle, Loader2, LayoutGrid, ShoppingBag, LogOut, Receipt, History, Send, RotateCcw, Coins, Wallet, Search, LogIn, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { formatPEN, ordenTalla, formatTalla } from '@happy/lib';
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
/** Nueva: incluye referencia a la cuenta bancaria elegida (BCP HAPPYS, etc)
 *  para que quede registrado a qué cuenta destino se cobró. */
type PagoLinea = { metodo: MetodoCarrito; monto: number; cuentaNombre?: string };
type CuentaBancariaDTO = { id: string; nombre_corto: string; banco: string | null; metodo_default: string };
type VendedorDTO = { id: string; nombre: string };
type TipoDoc = 'BOLETA' | 'FACTURA' | 'NOTA_VENTA';
type FormatoDoc = 'TICKET_80MM' | 'A4';

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
  cuentasBancarias = [],
  vendedores = [],
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
  /** Cuentas bancarias visibles en el POS (BCP HAPPYS, BCP JAVIER, etc.).
   *  Se administran desde ERP → Configuración → Cuentas bancarias. */
  cuentasBancarias?: CuentaBancariaDTO[];
  /** Vendedores activos para el dropdown del header del panel derecho. */
  vendedores?: VendedorDTO[];
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
  const [nombreCliente, setNombreCliente] = useState('');
  const [docCliente, setDocCliente] = useState('');
  const [direccionCliente, setDireccionCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [clienteIdSeleccionado, setClienteIdSeleccionado] = useState<string | null>(null);
  const [buscandoSunat, setBuscandoSunat] = useState(false);
  // Overrides y descuentos por línea del carrito (indexado por variante_id).
  // Cliente pidió (2026-07-10) poder editar el precio unitario y aplicar
  // descuento sin salir del carrito, como en su sistema anterior.
  const [overridesPrecio, setOverridesPrecio] = useState<Record<string, number>>({});
  const [descuentosLinea, setDescuentosLinea] = useState<Record<string, number>>({});
  const [vista, setVista] = useState<'busqueda' | 'catalogo'>('busqueda');
  const [catFiltro, setCatFiltro] = useState<string>('');
  const [productoTallasOpen, setProductoTallasOpen] = useState<string | null>(null);
  // Header del panel derecho: tipo comprobante, vendedor, formato PDF.
  // Persistidos en localStorage por sesión — el cajero no elige c/venta.
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('NOTA_VENTA');
  const [vendedorId, setVendedorId] = useState<string>('');
  const [formato, setFormato] = useState<FormatoDoc>('TICKET_80MM');
  useEffect(() => {
    // Hidratar desde localStorage al montar (solo cliente-side).
    try {
      const tv = localStorage.getItem('pos-tipo-doc') as TipoDoc | null;
      if (tv === 'BOLETA' || tv === 'FACTURA' || tv === 'NOTA_VENTA') setTipoDoc(tv);
      const vv = localStorage.getItem('pos-vendedor-id');
      if (vv) setVendedorId(vv);
      const fv = localStorage.getItem('pos-formato') as FormatoDoc | null;
      if (fv === 'TICKET_80MM' || fv === 'A4') setFormato(fv);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem('pos-tipo-doc', tipoDoc); } catch { /* ignore */ } }, [tipoDoc]);
  useEffect(() => { try { localStorage.setItem('pos-vendedor-id', vendedorId); } catch { /* ignore */ } }, [vendedorId]);
  useEffect(() => { try { localStorage.setItem('pos-formato', formato); } catch { /* ignore */ } }, [formato]);

  // Autolookup SUNAT/RENIEC al terminar de tipear DNI (8 díg) o RUC (11 díg).
  // Debounce 500ms. Endpoint /api/sunat/{dni|ruc}/{n} devuelve razón social /
  // nombre completo + dirección (para RUC). Sin botón — se dispara solo cuando
  // el largo llega al esperado y hay 500ms sin nuevos cambios.
  useEffect(() => {
    const n = docCliente.trim();
    if (n.length !== 8 && n.length !== 11) return;
    if (clienteIdSeleccionado) return; // ya está cargado
    const timer = setTimeout(async () => {
      const tipo = n.length === 8 ? 'dni' : 'ruc';
      setBuscandoSunat(true);
      try {
        const r = await fetch(`/api/sunat/${tipo}/${n}`);
        if (!r.ok) return;
        const data = await r.json();
        if (tipo === 'dni') {
          if (data.nombreCompleto) setNombreCliente(data.nombreCompleto);
        } else {
          if (data.razonSocial) setNombreCliente(data.razonSocial);
          if (data.direccion) setDireccionCliente(data.direccion);
        }
      } catch { /* silent */ } finally {
        setBuscandoSunat(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [docCliente, clienteIdSeleccionado]);

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

  // Por cada línea, decidir precio según cantidad TOTAL del carrito y
  // escalones. Cliente pidió (reunión post-2026-07-08): el precio mayorista
  // debe aplicarse cuando el carrito total pase de 3 disfraces, no cuando
  // una LÍNEA individual llegue a 3. O sea:
  //   · Cart total 2 items (mezclados) → todo precio_publico
  //   · Cart total 3+ items → todo precio_mayorista
  // Se sigue usando calcularPrecioPorCantidad pero se le pasa el total en
  // vez de la cantidad de la línea — así respeta los umbrales (mayorista_desde,
  // industrial_desde) sin duplicar lógica.
  const totalItemsCarrito = useMemo(
    () => carrito.reduce((s, l) => s + l.cantidad, 0),
    [carrito],
  );
  const lineasConPrecio = useMemo(
    () => carrito.map((l) => {
      const r = calcularPrecioPorCantidad(l.variante, totalItemsCarrito, configEscalones);
      // Prioridad: override manual del cajero > precio calculado por escalón.
      const overrideKey = l.variante.id;
      const precioBase = overridesPrecio[overrideKey] ?? r.precio;
      const descuento = descuentosLinea[overrideKey] ?? 0;
      const precioFinal = Math.max(0, precioBase - descuento);
      const isOverride = overridesPrecio[overrideKey] != null;
      return {
        ...l,
        precio_unitario: precioFinal,
        precio_base_calculado: r.precio,
        precio_override: isOverride ? precioBase : null,
        descuento_unitario: descuento,
        escalon: r.escalon,
        subtotal: l.cantidad * precioFinal,
      };
    }),
    [carrito, configEscalones, totalItemsCarrito, overridesPrecio, descuentosLinea],
  );

  const total = useMemo(() => lineasConPrecio.reduce((a, l) => a + l.subtotal, 0), [lineasConPrecio]);
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);

  // Agrupar variantes por producto para vista de catálogo.
  // El grid del catálogo también filtra por el texto del buscador (search):
  // cliente reportó (2026-07-10) que al escribir "bombero" no aparecía nada,
  // ni en el dropdown ni "abajo" — porque el catálogo mostraba TODOS los
  // productos sin filtrar. Ahora el search también reduce el grid.
  const productosAgrupados = useMemo(() => {
    const map = new Map<string, { producto: Variante['productos']; variantes: Variante[] }>();
    const qCat = search.trim().toLowerCase();
    for (const v of variantes) {
      if (catFiltro && v.productos.categoria_id !== catFiltro) continue;
      if (qCat) {
        const nombre = v.productos.nombre.toLowerCase();
        const sku = v.sku.toLowerCase();
        const cb = v.codigo_barras?.toLowerCase() ?? '';
        if (!nombre.includes(qCat) && !sku.includes(qCat) && !cb.includes(qCat)) continue;
      }
      const cur = map.get(v.productos.id);
      if (cur) cur.variantes.push(v);
      else map.set(v.productos.id, { producto: v.productos, variantes: [v] });
    }
    return Array.from(map.values()).sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  }, [variantes, catFiltro, search]);

  function agregarPorBarcode(input: string) {
    const barcode = input.trim();
    if (!barcode) return;
    // 1) Match exacto por código de barras o SKU — para lectora de pistola.
    const exacto = variantes.find((x) => x.codigo_barras === barcode || x.sku === barcode);
    if (exacto) {
      agregarVariante(exacto);
      setSearch('');
      return;
    }
    // 2) Sin match exacto → buscar por NOMBRE del producto (partial). Cliente
    //    reporto Enter con "bombero" tiraba "Producto no encontrado" porque
    //    "bombero" no es un SKU. Ahora: si hay al menos 1 producto que
    //    matchea el nombre, abrir el modal de tallas del primero para que
    //    el cajero elija talla. Si hay varios, tambien abrimos el primero
    //    (el dropdown de sugerencias ya listaba todos abajo del input).
    const q = barcode.toLowerCase();
    const productoMatch = productosAgrupados.find(({ producto }) =>
      producto.nombre.toLowerCase().includes(q),
    );
    if (productoMatch) {
      setProductoTallasOpen(productoMatch.producto.id);
      // No limpiamos el search — el usuario puede querer refinar
      return;
    }
    toast.error(`Producto no encontrado: ${barcode}`);
  }

  function agregarVariante(v: Variante) {
    const stockDisp = Math.max(0, stockPorVariante[v.id] ?? 0);
    // Política: NO permitir vender sin stock. Validamos en front (UX inmediata)
    // y el server (venta.ts) también valida para evitar bypass.
    if (stockDisp <= 0) {
      toast.error(`${v.productos.nombre} talla ${formatTalla(v.talla)} — sin stock en este almacén`);
      return;
    }
    // Si la línea ya existe, validar que sumar 1 no exceda el stock disponible
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.variante.id === v.id);
      if (idx >= 0) {
        const cantActual = prev[idx]!.cantidad;
        if (cantActual + 1 > stockDisp) {
          toast.error(`Stock máximo de ${stockDisp} unidades para ${v.sku}`);
          return prev;
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx]!, cantidad: cantActual + 1 };
        return copy;
      }
      return [...prev, { variante: v, cantidad: 1 }];
    });
    // NO cerrar el modal de tallas — cliente pidió que se mantenga abierto
    // para poder agregar múltiples tallas del mismo producto sin re-clic.
    // Se cierra manualmente con la X o click fuera.
  }

  function setQty(varianteId: string, qty: number) {
    setCarrito((prev) =>
      prev.map((l) => {
        if (l.variante.id !== varianteId) return l;
        const stockDisp = Math.max(0, stockPorVariante[l.variante.id] ?? 0);
        const nueva = Math.max(1, qty);
        if (nueva > stockDisp) {
          toast.error(`Stock máximo de ${stockDisp} unidades para ${l.variante.sku}`);
          return { ...l, cantidad: stockDisp };  // cap al máximo disponible
        }
        return { ...l, cantidad: nueva };
      }),
    );
  }

  function eliminar(varianteId: string) {
    setCarrito((prev) => prev.filter((l) => l.variante.id !== varianteId));
  }

  function agregarPago(metodo: MetodoCarrito, monto: number, cuentaNombre?: string) {
    if (monto <= 0) return;
    setPagos((p) => [...p, { metodo, monto, cuentaNombre }]);
  }

  /** Toggle: si ya hay un pago con esa cuenta/método, lo quita; si no, lo
   *  agrega con el saldo restante. Esto es lo que se dispara al clicar los
   *  botones de medio de pago — permite deseleccionar sin buscar la X. */
  function togglePago(metodo: MetodoCarrito, cuentaNombre: string | undefined) {
    const yaExisteIdx = pagos.findIndex((p) =>
      cuentaNombre
        ? p.cuentaNombre === cuentaNombre
        : p.metodo === metodo && !p.cuentaNombre,
    );
    if (yaExisteIdx >= 0) {
      setPagos((prev) => prev.filter((_, i) => i !== yaExisteIdx));
      return;
    }
    const restante = Math.max(0, total - pagado);
    if (restante <= 0) return;
    setPagos((prev) => [...prev, { metodo, monto: restante, cuentaNombre }]);
  }

  function quitarPago(idx: number) {
    setPagos((p) => p.filter((_, i) => i !== idx));
  }

  /** Suma los pagos que matchean una cuenta específica. Para el badge del
   *  botón. */
  function montoPagadoPorCuenta(cuentaNombre: string): number {
    return pagos
      .filter((p) => p.cuentaNombre === cuentaNombre)
      .reduce((s, p) => s + p.monto, 0);
  }

  function montoPagadoPorMetodoSinCuenta(metodo: MetodoCarrito): number {
    return pagos
      .filter((p) => p.metodo === metodo && !p.cuentaNombre)
      .reduce((s, p) => s + p.monto, 0);
  }

  const [cobrando, setCobrando] = useState(false);

  function abrirModalCobrar() {
    if (!sesionActiva) return toast.error('Abre la caja primero');
    if (carrito.length === 0) return toast.error('Carrito vacío');
    if (pagado < total) return toast.error(`Falta cobrar ${formatPEN(total - pagado)}`);
    if (!cajaActual) return toast.error('No hay caja activa');
    setCobrarOpen(true);
  }

  /**
   * Flujo DIRECTO de cobro sin modal wizard. Cliente pidió (2026-07-10):
   * click PAGAR → registra venta + emite comprobante + genera PDF + abre
   * print + reset. Sin steps intermedios. Toda la data ya está en el panel
   * derecho (tipo doc, cliente, vendedor, formato).
   *
   * Fallback: si validación falla (ej. FACTURA sin RUC), muestra toast
   * bloqueante en vez de abrir modal.
   */
  async function pagarEImprimir() {
    if (!sesionActiva || !cajaActual) return toast.error('Abre la caja primero');
    if (carrito.length === 0) return toast.error('Carrito vacío');
    if (pagado < total) return toast.error(`Falta cobrar ${formatPEN(total - pagado)}`);
    // Validación por tipo de comprobante
    if (tipoDoc === 'FACTURA') {
      if (docCliente.length !== 11) return toast.error('FACTURA requiere RUC de 11 dígitos');
      if (!nombreCliente.trim()) return toast.error('FACTURA requiere razón social');
      if (!direccionCliente.trim()) return toast.error('FACTURA requiere dirección fiscal');
    }
    if (tipoDoc === 'BOLETA' && docCliente && docCliente.length !== 8 && docCliente.length !== 11) {
      return toast.error('DNI debe tener 8 dígitos (o dejalo vacío para cliente anónimo)');
    }

    // Armar payload compatible con ejecutarCobro (mismo pipeline). El "cliente"
    // se compone inline con los datos que hay en el panel — no hay lookup en
    // BD acá (el server usa el nombre libre si no hay cliente_id).
    const tipoDocumentoCliente: 'DNI' | 'RUC' | null =
      docCliente.length === 8 ? 'DNI' : docCliente.length === 11 ? 'RUC' : null;
    await ejecutarCobro({
      tipo: tipoDoc,
      formato,
      cliente: {
        cliente_id: clienteIdSeleccionado,
        numero_documento: docCliente || null,
        tipo_documento: tipoDocumentoCliente,
        razon_social: tipoDocumentoCliente === 'RUC' ? (nombreCliente || null) : null,
        nombres: tipoDocumentoCliente === 'DNI' ? (nombreCliente || null) : (tipoDocumentoCliente === null ? (nombreCliente || null) : null),
        apellidos: null,
        direccion: direccionCliente || null,
        telefono: telefonoCliente || null,
        email: null,
      },
      vendedor_usuario_id: vendedorId || null,
    });
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
        pagos: pagos.map((p) => ({ metodo: p.metodo, monto: p.monto, referencia: p.cuentaNombre })),
        vendedor_usuario_id: payload.vendedor_usuario_id ?? null,
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
      // Reset COMPLETO — deja la caja lista para la siguiente venta.
      // Incluye overrides de precio, descuentos y campos nuevos del cliente.
      setCarrito([]);
      setPagos([]);
      setNombreCliente('');
      setDocCliente('');
      setDireccionCliente('');
      setTelefonoCliente('');
      setClienteIdSeleccionado(null);
      setOverridesPrecio({});
      setDescuentosLinea({});
      setEfectivoInput('');
      setCobrarOpen(false);
      setCobrarKey((k) => k + 1);
      // NO reseteamos vendedorId / tipoDoc / formato — persisten por sesión.
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
    // Buscar y colapsar por PRODUCTO (no por variante) — cliente pidió
    // (post-2026-07-08) reducir la lista larga de sugerencias mostrando
    // 1 fila por producto. Al hacer click se abre el selector de tallas
    // lateral (no tapa el carrito).
    const matches = variantes.filter((v) =>
      v.sku.toLowerCase().includes(q) ||
      v.codigo_barras?.toLowerCase().includes(q) ||
      v.productos.nombre.toLowerCase().includes(q),
    );
    const porProducto = new Map<string, { producto: Variante['productos']; tallasCount: number; precioMin: number }>();
    for (const v of matches) {
      const cur = porProducto.get(v.productos.id);
      const precio = Number(v.precio_publico ?? 0);
      if (cur) {
        cur.tallasCount += 1;
        cur.precioMin = Math.min(cur.precioMin, precio);
      } else {
        porProducto.set(v.productos.id, { producto: v.productos, tallasCount: 1, precioMin: precio });
      }
    }
    return Array.from(porProducto.values()).slice(0, 20);
  }, [search, variantes]);

  const tallasDelProductoOpen = useMemo(() => {
    if (!productoTallasOpen) return [];
    return [...variantes.filter((v) => v.productos.id === productoTallasOpen)].sort(
      (a, b) => ordenTalla(a.talla) - ordenTalla(b.talla),
    );
  }, [productoTallasOpen, variantes]);

  return (
    <div className="grid h-screen grid-cols-1 lg:grid-cols-[1fr_720px]">
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
            <div className="mt-2 max-h-96 overflow-auto rounded-md border bg-white shadow-sm" data-pos-no-focus>
              {sugerencias.map(({ producto, tallasCount, precioMin }) => (
                <button
                  key={producto.id}
                  onClick={() => setProductoTallasOpen(producto.id)}
                  className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left text-sm hover:bg-happy-50 last:border-0"
                >
                  <div className="flex-1 font-medium text-corp-900 truncate">{producto.nombre}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {tallasCount} {tallasCount === 1 ? 'talla' : 'tallas'}
                  </Badge>
                  <div className="font-semibold text-happy-600">
                    desde {formatPEN(precioMin)}
                  </div>
                </button>
              ))}
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
                    // Si alguna variante tiene stock > 0 hay stock disponible.
                    // (NO usar suma porque variantes con stock negativo —dato
                    // corrupto de pruebas— harían que stockTotal sea -1 y la
                    // comparación stockTotal === 0 fallaba.)
                    const stockTotal = vars.reduce((a, v) => a + Math.max(0, stockPorVariante[v.id] ?? 0), 0);
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

              {/* Modal de tallas movido FUERA del ternario vista===catálogo
                  (2026-07-10): el cliente reportó que al buscar "bombero" en
                  vista Búsqueda el dropdown listaba el producto pero al hacer
                  click no pasaba nada — porque el modal estaba dentro del
                  bloque de la vista Catálogo y no se montaba en la de
                  Búsqueda. Ahora vive al final del render principal, disponible
                  en ambas vistas. Ver <ModalTallas /> más abajo. */}
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
                          SKU {l.variante.sku} · Talla {formatTalla(l.variante.talla)} ·{' '}
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

        {/* Mini flotante "Ver carrito" removido: el carrito ahora está SIEMPRE
            visible en el panel derecho (arriba de los medios de pago). Ya no
            hace falta cambiar de vista para verlo. */}
      </section>

      {/* DERECHA — Header (tipo doc + vendedor) + Cliente + Carrito + Pago.
          Cliente pidió (2026-07-10, referencia de su POS anterior): todo el
          flujo de venta en ESTE panel, sin modal wizard. Tipo comprobante y
          vendedor persisten en localStorage — se eligen 1 vez por sesión, no
          cada venta. */}
      <aside className="flex h-screen flex-col border-l bg-slate-50" data-pos-no-focus>
        {/* HEADER: Tipo comprobante · Vendedor · Formato */}
        <div className="shrink-0 border-b bg-white px-3 py-2">
          <div className="mb-2 grid grid-cols-3 gap-1">
            {(['BOLETA', 'FACTURA', 'NOTA_VENTA'] as TipoDoc[]).map((t) => {
              const activo = tipoDoc === t;
              const label = t === 'NOTA_VENTA' ? 'NOTA' : t;
              return (
                <button
                  key={t}
                  onClick={() => setTipoDoc(t)}
                  className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
                    activo
                      ? 'border-happy-500 bg-happy-500 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-happy-300 hover:text-happy-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <select
              value={vendedorId}
              onChange={(e) => setVendedorId(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium"
              title="Vendedor de esta venta (se persiste por sesión)"
            >
              <option value="">— sin vendedor —</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-[10px]">
              {(['TICKET_80MM', 'A4'] as FormatoDoc[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormato(f)}
                  className={`rounded px-1.5 py-1 font-semibold transition ${
                    formato === f ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  title={f === 'TICKET_80MM' ? 'Ticket térmico 80mm' : 'PDF A4'}
                >
                  {f === 'TICKET_80MM' ? '80mm' : 'A4'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CLIENTE INLINE: DNI/RUC con autolookup SUNAT/RENIEC + razón social + dirección (si FACTURA) */}
        <div className="shrink-0 border-b bg-white px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Cliente</span>
            {buscandoSunat && (
              <span className="flex items-center gap-1 text-happy-600">
                <Loader2 className="h-3 w-3 animate-spin" /> Consultando…
              </span>
            )}
            {clienteIdSeleccionado && !buscandoSunat && (
              <span className="text-emerald-600">✓ Guardado en BD</span>
            )}
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-1.5">
            <Input
              value={docCliente}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 11);
                setDocCliente(v);
                // Reset cliente seleccionado al editar DNI/RUC
                if (clienteIdSeleccionado) setClienteIdSeleccionado(null);
              }}
              placeholder="DNI/RUC"
              className="h-8 font-mono text-xs"
              inputMode="numeric"
              maxLength={11}
              data-pos-no-focus
            />
            <Input
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              placeholder={tipoDoc === 'FACTURA' ? 'Razón social *' : 'Nombre (opcional)'}
              className="h-8 text-xs"
              data-pos-no-focus
            />
          </div>
          {(tipoDoc === 'FACTURA' || direccionCliente) && (
            <Input
              value={direccionCliente}
              onChange={(e) => setDireccionCliente(e.target.value)}
              placeholder={tipoDoc === 'FACTURA' ? 'Dirección fiscal *' : 'Dirección'}
              className="mt-1 h-8 text-xs"
              data-pos-no-focus
            />
          )}
        </div>

        {/* CARRITO SIEMPRE VISIBLE — cliente pidió (reunión post-2026-07-08)
            que al seleccionar productos aparezcan aquí al costado, arriba de
            los medios de pago, sin tener que abrir "Ver carrito". Así el
            cajero mantiene siempre la vista de lo que está vendiendo. */}
        <div className="flex min-h-0 flex-1 flex-col border-b bg-white" data-pos-no-focus>
          <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <ShoppingBag className="h-3.5 w-3.5 text-happy-600" />
              Venta actual
            </span>
            {carrito.length > 0 && (
              <span className="rounded-full bg-happy-100 px-2 py-0.5 text-[10px] font-bold text-happy-700">
                {carrito.length} {carrito.length === 1 ? 'ítem' : 'ítems'} · {formatPEN(total)}
              </span>
            )}
          </div>
          {carrito.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-4 text-center">
              <ShoppingBag className="h-8 w-8 text-slate-300" />
              <p className="text-xs text-slate-400">Selecciona productos del catálogo</p>
            </div>
          ) : (
            <ul className="flex-1 overflow-auto p-2">
              {/* Cliente pidió (reunión post-2026-07-08) que el ÚLTIMO producto
                  seleccionado aparezca ARRIBA de la lista — cuando cargan 20
                  ítems y sigue apareciendo abajo el último, no lo ven y
                  cometen errores de conteo. reverse() para invertir el orden. */}
              {[...lineasConPrecio].reverse().map((l, idx) => {
                const precioPublico = Number(l.variante.precio_publico ?? 0);
                const enOferta = l.escalon !== 'PUBLICO' && precioPublico > 0 && l.precio_unitario < precioPublico;
                const esUltimo = idx === 0;
                const imagen = l.variante.productos.imagen_principal_url;
                return (
                  <li
                    key={l.variante.id}
                    className={`mb-1.5 rounded-md border p-2 last:mb-0 ${
                      esUltimo ? 'border-happy-300 bg-happy-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Foto miniatura — cliente pidió que se vea la imagen del
                          producto en el carrito para reconocimiento visual rápido. */}
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-slate-100">
                        {imagen ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={imagen}
                            alt={l.variante.productos.nombre}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-lg">🎭</div>
                        )}
                        {esUltimo && (
                          <span className="absolute -right-1 -top-1 rounded-full bg-happy-500 px-1 text-[8px] font-bold text-white shadow">
                            NUEVO
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-corp-900">{l.variante.productos.nombre}</p>
                        <p className="text-[10px] text-slate-500">
                          T{formatTalla(l.variante.talla)} · {l.variante.sku}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1">
                          <PrecioEditable
                            valor={l.precio_override ?? l.precio_base_calculado}
                            onChange={(v) => {
                              setOverridesPrecio((prev) => {
                                const next = { ...prev };
                                if (v === l.precio_base_calculado) delete next[l.variante.id];
                                else next[l.variante.id] = v;
                                return next;
                              });
                            }}
                            isOverride={l.precio_override != null}
                          />
                          {enOferta && !l.precio_override && (
                            <span className="text-[9px] text-slate-400 line-through">{formatPEN(precioPublico)}</span>
                          )}
                          <DescuentoLineaChip
                            valor={l.descuento_unitario ?? 0}
                            precioBase={l.precio_override ?? l.precio_base_calculado}
                            onChange={(v) => {
                              setDescuentosLinea((prev) => {
                                const next = { ...prev };
                                if (v <= 0) delete next[l.variante.id];
                                else next[l.variante.id] = v;
                                return next;
                              });
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-display text-sm font-semibold text-corp-900">{formatPEN(l.subtotal)}</span>
                        <div className="flex items-center rounded border bg-white">
                          <button
                            onClick={() => setQty(l.variante.id, l.cantidad - 1)}
                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-50"
                            aria-label="Restar"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-6 text-center text-xs font-semibold">{l.cantidad}</span>
                          <button
                            onClick={() => setQty(l.variante.id, l.cantidad + 1)}
                            className="px-1.5 py-0.5 text-slate-600 hover:bg-slate-50"
                            aria-label="Sumar"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => eliminar(l.variante.id)}
                            className="border-l px-1.5 py-0.5 text-red-500 hover:bg-red-50"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Bloque medios de pago compactado (2026-07-10) — el cliente pidió
            reducir el alto para que el carrito de productos tenga más espacio
            visible. Antes: p-4 + botones p-3 + gap-2 (~340px). Ahora: p-2.5 +
            botones py-1.5 + gap-1 + max-h-1/2 con scroll interno.
            Toda la sección se limita a 45% del alto del panel derecho. */}
        <div className="shrink-0 overflow-auto p-2.5" style={{ maxHeight: '45vh' }}>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Métodos de pago</p>

          {/* EFECTIVO con input — para registrar monto real recibido y calcular vuelto */}
          <div className="mb-1.5 rounded-md border-2 border-emerald-200 bg-emerald-50 p-1.5">
            <div className="flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span className="flex-1 text-[11px] font-semibold text-emerald-700">Efectivo recibido</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.10"
                  min={0}
                  inputMode="decimal"
                  value={efectivoInput}
                  onChange={(e) => setEfectivoInput(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder={(total - pagado).toFixed(2)}
                  className="h-8 w-20 rounded-md border border-emerald-300 bg-white px-2 text-right font-mono text-xs"
                  data-pos-no-focus
                />
                <button
                  onClick={() => {
                    const n = Number(efectivoInput || (total - pagado).toFixed(2));
                    if (n <= 0) return;
                    agregarPago('EFECTIVO', n);
                    setEfectivoInput('');
                  }}
                  className="rounded-md bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700"
                >
                  Cobrar
                </button>
              </div>
            </div>
            {efectivoInput && Number(efectivoInput) > total - pagado && (
              <p className="mt-1 text-right text-[10px] text-emerald-700">
                Vuelto: <strong>{formatPEN(Math.max(0, Number(efectivoInput) - (total - pagado)))}</strong>
              </p>
            )}
          </div>

          {/* Cuentas bancarias dinámicas — vienen de BD (mig 62, editables
              en ERP → Configuración → Cuentas bancarias). Un botón "activo"
              (con pago registrado) se ve con borde grueso + checkmark + monto.
              Clickear un botón activo lo deselecciona (toggle). */}
          {cuentasBancarias.length > 0 && (
            <div className="mb-1.5 grid grid-cols-2 gap-1">
              {cuentasBancarias.map((c) => {
                const banco = (c.banco ?? '').toUpperCase();
                const activo = montoPagadoPorCuenta(c.nombre_corto) > 0;
                const montoActivo = montoPagadoPorCuenta(c.nombre_corto);
                const base =
                  banco === 'BCP' ? { off: 'bg-blue-50 text-blue-800 border-blue-200', on: 'bg-blue-100 text-blue-900 border-blue-600 ring-2 ring-blue-200' } :
                  banco === 'INTERBANK' ? { off: 'bg-emerald-50 text-emerald-800 border-emerald-200', on: 'bg-emerald-100 text-emerald-900 border-emerald-600 ring-2 ring-emerald-200' } :
                  banco === 'BBVA' ? { off: 'bg-indigo-50 text-indigo-800 border-indigo-200', on: 'bg-indigo-100 text-indigo-900 border-indigo-600 ring-2 ring-indigo-200' } :
                  banco === 'YAPE/PLIN' ? { off: 'bg-purple-50 text-purple-800 border-purple-200', on: 'bg-purple-100 text-purple-900 border-purple-600 ring-2 ring-purple-200' } :
                  { off: 'bg-slate-50 text-slate-800 border-slate-200', on: 'bg-slate-100 text-slate-900 border-slate-600 ring-2 ring-slate-200' };
                const color = activo ? base.on : base.off;
                const restante = total - pagado;
                const disabled = !activo && restante <= 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => togglePago(c.metodo_default as MetodoCarrito, c.nombre_corto)}
                    disabled={disabled}
                    className={`relative flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold ${color} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-95'}`}
                    title={activo
                      ? `Click para deseleccionar ${c.nombre_corto} (${formatPEN(montoActivo)})`
                      : disabled
                        ? 'Ya se cubrió el total — quitá algún pago para agregar otro'
                        : `Cobrar ${formatPEN(Math.max(0, restante))} por ${c.nombre_corto}`}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-left leading-tight truncate flex-1">{c.nombre_corto}</span>
                    {activo && (
                      <span className="flex items-center gap-0.5 rounded-sm bg-white/70 px-1 text-[9px] font-mono font-bold shrink-0">
                        ✓ {formatPEN(montoActivo).replace('S/', '').trim()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Métodos genéricos (sin cuenta asociada). Toggle idéntico. */}
          <div className="grid grid-cols-4 gap-1">
            {([
              { m: 'YAPE', label: 'Yape', icon: <Smartphone className="h-3.5 w-3.5" />, off: 'bg-purple-50 text-purple-700 border-purple-100', on: 'bg-purple-100 text-purple-900 border-purple-600 ring-2 ring-purple-200' },
              { m: 'PLIN', label: 'Plin', icon: <Smartphone className="h-3.5 w-3.5" />, off: 'bg-blue-50 text-blue-700 border-blue-100', on: 'bg-blue-100 text-blue-900 border-blue-600 ring-2 ring-blue-200' },
              { m: 'TARJETA_CREDITO', label: 'Tarjeta', icon: <CreditCard className="h-3.5 w-3.5" />, off: 'bg-slate-100 text-slate-700 border-slate-200', on: 'bg-slate-200 text-slate-900 border-slate-600 ring-2 ring-slate-300' },
              { m: 'TRANSFERENCIA', label: 'Otro', icon: <Building2 className="h-3.5 w-3.5" />, off: 'bg-slate-100 text-slate-700 border-slate-200', on: 'bg-slate-200 text-slate-900 border-slate-600 ring-2 ring-slate-300' },
            ] as const).map((p) => {
              const activo = montoPagadoPorMetodoSinCuenta(p.m as MetodoCarrito) > 0;
              const monto = montoPagadoPorMetodoSinCuenta(p.m as MetodoCarrito);
              const restante = total - pagado;
              const disabled = !activo && restante <= 0;
              return (
                <button
                  key={p.m}
                  onClick={() => togglePago(p.m as MetodoCarrito, undefined)}
                  disabled={disabled}
                  className={`relative flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] font-medium ${activo ? p.on : p.off} ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-95'}`}
                  title={activo
                    ? `Click para deseleccionar ${p.label} (${formatPEN(monto)})`
                    : disabled
                      ? 'Ya se cubrió el total'
                      : `Cobrar ${formatPEN(Math.max(0, restante))} por ${p.label}`}
                >
                  {p.icon}
                  <span className="leading-tight">{p.label}</span>
                  {activo && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-white shadow-sm">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Barra de progreso del total pagado. Cuando pagado >= total,
              cambia a verde con "COMPLETO" — feedback visual claro de que
              se puede cobrar. */}
          {total > 0 && (
            <div className="mt-2 rounded-md border bg-white px-2 py-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">
                  Pagado <span className="font-mono font-semibold text-corp-900">{formatPEN(pagado)}</span> de <span className="font-mono">{formatPEN(total)}</span>
                </span>
                {pagado >= total ? (
                  <Badge className="bg-emerald-500 text-[9px]">✓ COMPLETO</Badge>
                ) : (
                  <span className="font-mono font-semibold text-amber-600">Faltan {formatPEN(total - pagado)}</span>
                )}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full transition-all ${pagado >= total ? 'bg-emerald-500' : 'bg-happy-500'}`}
                  style={{ width: `${Math.min(100, (pagado / total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {pagos.length > 0 && (
            <ul className="mt-2 space-y-1">
              {pagos.map((p, i) => (
                <li key={i} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs shadow-sm">
                  <Badge variant="secondary" className="text-[9px]">{p.metodo.replace('_', ' ')}</Badge>
                  {p.cuentaNombre && (
                    <span className="text-[10px] font-medium text-slate-600 truncate">{p.cuentaNombre}</span>
                  )}
                  <span className="ml-auto font-semibold">{formatPEN(p.monto)}</span>
                  <button onClick={() => quitarPago(i)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100"><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t bg-white p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">Total</span>
            <span className="font-display text-2xl font-bold text-corp-900">{formatPEN(total)}</span>
          </div>
          {pagado !== total && (
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="text-slate-500">{pagado < total ? 'Falta' : 'Vuelto'}</span>
              <span className={`font-mono font-semibold ${pagado < total ? 'text-danger' : 'text-emerald-600'}`}>
                {formatPEN(Math.abs(total - pagado))}
              </span>
            </div>
          )}
          <div className="flex gap-1.5">
            <Button
              onClick={pedirPorWhatsapp}
              variant="outline"
              disabled={carrito.length === 0}
              className="flex-1 gap-1 px-2"
              title="Enviar cotización por WhatsApp (no cobra ni imprime)"
            >
              <MessageCircle className="h-4 w-4" /> WA
            </Button>
            <Button
              onClick={pagarEImprimir}
              variant="premium"
              size="lg"
              disabled={cobrando || carrito.length === 0 || pagado < total || !sesionActiva}
              className="flex-[3] gap-1 whitespace-nowrap"
              title="Registra venta + emite comprobante + imprime automático"
            >
              {cobrando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
              PAGAR E IMPRIMIR
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-slate-400">
            Al pagar se emite {tipoDoc === 'NOTA_VENTA' ? 'nota interna' : tipoDoc.toLowerCase()} en {formato === 'TICKET_80MM' ? 'ticket 80mm' : 'A4'} y se imprime automático.
          </p>
        </div>
      </aside>

      {/* Modal selector de talla — nivel top del componente para que funcione
          tanto en vista Búsqueda como Catálogo. Antes vivía dentro del bloque
          catálogo y por eso los clicks desde el dropdown de sugerencias no
          abrían nada. Popover lateral: fullscreen en < lg, ancla a la izq
          dejando 720px libre del carrito en lg+. Se mantiene abierto tras
          agregar tallas para permitir seleccionar varias del mismo producto. */}
      {productoTallasOpen && (
        <div
          className="fixed inset-0 z-50 flex h-screen items-center justify-center bg-black/30 p-4 lg:left-0 lg:right-[720px] lg:w-auto"
          onClick={() => setProductoTallasOpen(null)}
          data-pos-no-focus
        >
          <Card
            className="w-full max-w-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl font-semibold text-corp-900">
                  {tallasDelProductoOpen[0]?.productos.nombre}
                </h3>
                <p className="mt-0.5 text-sm text-slate-500">
                  Toca una talla para agregarla. Podés agregar varias sin cerrar este panel.
                </p>
              </div>
              <button onClick={() => setProductoTallasOpen(null)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {tallasDelProductoOpen.map((v) => {
                const stock = stockPorVariante[v.id] ?? 0;
                const sinStock = stock <= 0;
                const enCarrito = carrito.find((l) => l.variante.id === v.id)?.cantidad ?? 0;
                return (
                  <div key={v.id} className="relative">
                    <button
                      onClick={() => agregarVariante(v)}
                      disabled={sinStock}
                      className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition ${
                        sinStock
                          ? 'border-dashed border-red-200 bg-red-50/40 text-red-400 cursor-not-allowed opacity-60'
                          : enCarrito > 0
                            ? 'border-emerald-400 bg-emerald-50 text-corp-900 hover:border-emerald-500 hover:bg-emerald-100'
                            : 'border-slate-200 bg-white text-corp-900 hover:border-happy-400 hover:bg-happy-50'
                      }`}
                      title={sinStock ? 'Sin stock — no se puede vender' : enCarrito > 0 ? `${enCarrito} en carrito. Click para agregar 1 más` : ''}
                    >
                      <span className="font-display text-2xl font-bold">{formatTalla(v.talla)}</span>
                      <span className="text-xs font-mono text-slate-500">{v.sku}</span>
                      <span className="text-sm font-semibold text-happy-600">{formatPEN(Number(v.precio_publico ?? 0))}</span>
                      <span className={`text-[11px] ${sinStock ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                        {sinStock ? 'Sin stock' : `Stock: ${stock}`}
                      </span>
                    </button>
                    {enCarrito > 0 && (
                      <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow-md ring-2 ring-white">
                        {enCarrito}
                      </span>
                    )}
                    {/* Botón "ver stock en otros almacenes" — cliente pidió
                        (2026-07-10) que sea más grande y con ícono de lupa
                        (antes MapPin h-3 casi invisible). */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setStockAlmacenesVarianteId(v.id); }}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-happy-50 hover:text-happy-600 hover:ring-happy-300"
                      title="Ver stock en todos los almacenes"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

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

/**
 * Precio unitario editable inline. Click sobre el número → input. Enter/blur
 * guarda. Si el nuevo valor coincide con el precio calculado por escalón, se
 * limpia el override (vuelve al automático).
 */
function PrecioEditable({
  valor,
  onChange,
  isOverride,
}: {
  valor: number;
  onChange: (v: number) => void;
  isOverride: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [temp, setTemp] = useState(valor.toFixed(2));
  useEffect(() => { setTemp(valor.toFixed(2)); }, [valor]);
  if (editando) {
    return (
      <input
        type="number"
        step="0.01"
        min={0}
        value={temp}
        autoFocus
        onChange={(e) => setTemp(e.target.value)}
        onBlur={() => {
          const n = Number(temp);
          if (Number.isFinite(n) && n >= 0) onChange(n);
          setEditando(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setTemp(valor.toFixed(2)); setEditando(false); }
        }}
        className="h-5 w-16 rounded border border-happy-400 bg-white px-1 text-right font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-happy-200"
        data-pos-no-focus
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className={`rounded px-1 text-[11px] font-semibold hover:bg-slate-100 ${
        isOverride ? 'text-amber-600 underline decoration-dotted' : 'text-happy-600'
      }`}
      title={isOverride ? 'Precio editado manualmente (click para cambiar)' : 'Click para editar precio'}
      data-pos-no-focus
    >
      S/ {valor.toFixed(2)}
    </button>
  );
}

/**
 * Chip de descuento por línea. Estado colapsado: si no hay descuento muestra
 * un botón "%" pequeño; si hay, muestra el monto restado. Click → popover con
 * input S/ (monto fijo) y % (calcula sobre precio base).
 */
function DescuentoLineaChip({
  valor,
  precioBase,
  onChange,
}: {
  valor: number;
  precioBase: number;
  onChange: (v: number) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<'monto' | 'porcentaje'>('monto');
  const [temp, setTemp] = useState(valor > 0 ? valor.toFixed(2) : '');

  function aplicar() {
    const n = Number(temp);
    if (!Number.isFinite(n) || n < 0) return;
    const descFinal = modo === 'porcentaje' ? +(precioBase * n / 100).toFixed(2) : n;
    onChange(Math.min(descFinal, precioBase));
    setAbierto(false);
  }

  return (
    <div className="relative" data-pos-no-focus>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`rounded px-1 text-[10px] font-medium ${
          valor > 0
            ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
            : 'text-slate-400 hover:bg-slate-100'
        }`}
        title={valor > 0 ? `Descuento −S/ ${valor.toFixed(2)}` : 'Aplicar descuento'}
      >
        {valor > 0 ? `− ${valor.toFixed(2)}` : '%'}
      </button>
      {abierto && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-40 rounded-md border bg-white p-2 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex gap-1 text-[9px]">
            <button
              onClick={() => setModo('monto')}
              className={`flex-1 rounded px-1 py-0.5 ${modo === 'monto' ? 'bg-happy-500 text-white' : 'bg-slate-100 text-slate-600'}`}
            >S/</button>
            <button
              onClick={() => setModo('porcentaje')}
              className={`flex-1 rounded px-1 py-0.5 ${modo === 'porcentaje' ? 'bg-happy-500 text-white' : 'bg-slate-100 text-slate-600'}`}
            >%</button>
          </div>
          <input
            type="number"
            step="0.01"
            min={0}
            max={modo === 'porcentaje' ? 100 : precioBase}
            value={temp}
            autoFocus
            onChange={(e) => setTemp(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') aplicar(); if (e.key === 'Escape') setAbierto(false); }}
            className="mb-1 h-7 w-full rounded border border-slate-300 px-1.5 text-right font-mono text-xs"
            placeholder={modo === 'monto' ? 'S/ 5.00' : '10%'}
          />
          <div className="flex gap-1">
            <button
              onClick={() => { setTemp(''); onChange(0); setAbierto(false); }}
              className="flex-1 rounded bg-slate-100 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200"
            >Quitar</button>
            <button
              onClick={aplicar}
              className="flex-1 rounded bg-happy-500 py-0.5 text-[10px] font-semibold text-white hover:bg-happy-600"
            >Aplicar</button>
          </div>
        </div>
      )}
    </div>
  );
}
