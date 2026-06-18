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
  WHATSAPP_DERIVADO: ['CANCELADO'],
};

// Estados en los que el stock YA está descontado (necesitan reintegración al cancelar)
export const STOCK_RESERVADO: EstadoPedidoWeb[] = ['EN_PREPARACION', 'LISTO_RECOJO', 'EN_DELIVERY'];
