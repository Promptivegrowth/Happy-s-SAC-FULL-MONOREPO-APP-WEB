/**
 * Constantes y tipos sync para pedidos web.
 * Vive aparte de pedidos-web.ts ('use server') para cumplir la regla de
 * Next.js: archivos use server solo pueden exportar async functions.
 */

export const ESTADOS_PEDIDO_WEB = [
  'PENDIENTE_PAGO',
  'PAGO_VERIFICADO',
  'EN_PREPARACION',
  'LISTO_RECOJO',
  'EN_DELIVERY',
  'ENTREGADO',
  'CANCELADO',
  'WHATSAPP_DERIVADO',
] as const;
export type EstadoPedidoWeb = (typeof ESTADOS_PEDIDO_WEB)[number];

export const ESTADO_LABEL: Record<EstadoPedidoWeb, string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGO_VERIFICADO: 'Pago verificado',
  EN_PREPARACION: 'En preparación',
  LISTO_RECOJO: 'Listo para recojo',
  EN_DELIVERY: 'En delivery',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
  WHATSAPP_DERIVADO: 'Derivado a WhatsApp',
};

// Tono visual por estado para badges
export type Tono = 'amber' | 'sky' | 'indigo' | 'violet' | 'cyan' | 'emerald' | 'rose' | 'slate';
export const ESTADO_TONO: Record<EstadoPedidoWeb, Tono> = {
  PENDIENTE_PAGO: 'amber',
  PAGO_VERIFICADO: 'sky',
  EN_PREPARACION: 'indigo',
  LISTO_RECOJO: 'violet',
  EN_DELIVERY: 'cyan',
  ENTREGADO: 'emerald',
  CANCELADO: 'rose',
  WHATSAPP_DERIVADO: 'slate',
};

// Transiciones permitidas
export const TRANSICIONES: Record<EstadoPedidoWeb, EstadoPedidoWeb[]> = {
  PENDIENTE_PAGO: ['PAGO_VERIFICADO', 'CANCELADO', 'WHATSAPP_DERIVADO'],
  PAGO_VERIFICADO: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['LISTO_RECOJO', 'EN_DELIVERY', 'CANCELADO'],
  LISTO_RECOJO: ['ENTREGADO', 'CANCELADO'],
  EN_DELIVERY: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [],
  CANCELADO: [],
  // Un pedido coordinado por WhatsApp se confirma igual que uno con Yape: al
  // llegar la captura del pago (30/09/2026).
  WHATSAPP_DERIVADO: ['PAGO_VERIFICADO', 'CANCELADO'],
};

/*
 * Vistas del listado (pedido de Javier, 12/10/2026).
 *
 * Cada intento de compra en la web queda guardado como pedido: una clienta que
 * prueba con tarjeta, cambia a Plin y después arma otro carrito deja cuatro
 * pedidos "Pendiente de pago", y en un solo listado parecían cuatro despachos.
 * Ahora:
 *  - "Por despachar": solo lo PAGADO (lo que el almacén tiene que mover).
 *  - "Por confirmar pago": lo que espera que alguien vea el Yape/Plin.
 *  - "Sin concretar": intentos que el cliente reemplazó con un pedido
 *    posterior, o que llevan más de 3 días sin pago.
 */
export type VistaPedidosWeb = 'despachar' | 'pago' | 'sin_concretar' | 'entregados' | 'cancelados' | 'todos';
export const VISTA_LABEL: Record<VistaPedidosWeb, string> = {
  despachar: 'Por despachar',
  pago: 'Por confirmar pago',
  sin_concretar: 'Sin concretar',
  entregados: 'Entregados',
  cancelados: 'Cancelados',
  todos: 'Todos',
};
export const ESTADOS_POR_DESPACHAR: EstadoPedidoWeb[] = ['PAGO_VERIFICADO', 'EN_PREPARACION', 'LISTO_RECOJO', 'EN_DELIVERY'];
export const ESTADOS_ESPERA_PAGO: EstadoPedidoWeb[] = ['PENDIENTE_PAGO', 'WHATSAPP_DERIVADO'];
/** Días sin pago tras los que un pedido pasa a "Sin concretar". */
export const DIAS_SIN_PAGO = 3;

/** A qué vista va cada pedido. */
export function vistaDePedido(p: { estado: EstadoPedidoWeb; fecha: string; reemplazado_por: string | null }, ahora = Date.now()): VistaPedidosWeb {
  if (ESTADOS_POR_DESPACHAR.includes(p.estado)) return 'despachar';
  if (p.estado === 'ENTREGADO') return 'entregados';
  if (p.estado === 'CANCELADO') return 'cancelados';
  const viejo = ahora - new Date(p.fecha).getTime() > DIAS_SIN_PAGO * 86_400_000;
  return p.reemplazado_por || viejo ? 'sin_concretar' : 'pago';
}

// Estados en los que el stock YA está descontado (necesitan reintegración al cancelar)
export const STOCK_RESERVADO: EstadoPedidoWeb[] = ['EN_PREPARACION', 'LISTO_RECOJO', 'EN_DELIVERY'];
