/**
 * Enums centralizados (espejos de los enums de Postgres).
 * Mantener sincronizados con `supabase/migrations/01_enums.sql`.
 */

export const ROLES = [
  'gerente',
  'jefe_produccion',
  'operario',
  'almacenero',
  'cajero',
  'vendedor_b2b',
  'contador',
  'cliente',
] as const;
export type Rol = (typeof ROLES)[number];

export const TIPOS_DOCUMENTO_IDENTIDAD = ['DNI', 'RUC', 'CE', 'PASAPORTE'] as const;
export type TipoDocumentoIdentidad = (typeof TIPOS_DOCUMENTO_IDENTIDAD)[number];

export const TIPOS_COMPROBANTE = ['NOTA_VENTA', 'BOLETA', 'FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'GUIA_REMISION'] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];

export const ESTADOS_COMPROBANTE = ['BORRADOR', 'EMITIDO', 'ACEPTADO', 'OBSERVADO', 'RECHAZADO', 'ANULADO'] as const;
export type EstadoComprobante = (typeof ESTADOS_COMPROBANTE)[number];

export const TIPOS_CLIENTE = ['PUBLICO_FINAL', 'MAYORISTA_A', 'MAYORISTA_B', 'MAYORISTA_C', 'INDUSTRIAL'] as const;
export type TipoCliente = (typeof TIPOS_CLIENTE)[number];

export const TIPOS_ALMACEN = ['MATERIA_PRIMA', 'PRODUCTO_TERMINADO', 'TIENDA', 'PRODUCCION', 'TALLER_EXTERNO', 'MERMA'] as const;
export type TipoAlmacen = (typeof TIPOS_ALMACEN)[number];

export const CATEGORIAS_MATERIAL = ['TELA', 'AVIO', 'INSUMO', 'EMPAQUE'] as const;
export type CategoriaMaterial = (typeof CATEGORIAS_MATERIAL)[number];

export const ESTADOS_OT = [
  'BORRADOR',
  'PLANIFICADA',
  'EN_CORTE',
  'EN_HABILITADO',
  'EN_SERVICIO',
  'EN_DECORADO',
  'EN_CONTROL_CALIDAD',
  'COMPLETADA',
  'CANCELADA',
] as const;
export type EstadoOT = (typeof ESTADOS_OT)[number];

export const TIPOS_PROCESO_PRODUCCION = [
  'TRAZADO',
  'TENDIDO',
  'CORTE',
  'HABILITADO',
  'COSTURA',
  'BORDADO',
  'ESTAMPADO',
  'SUBLIMADO',
  'PLISADO',
  'ACABADO',
  'PLANCHADO',
  'OJAL_BOTON',
  'CONTROL_CALIDAD',
  'EMBALAJE',
  'DECORADO',
] as const;
export type TipoProcesoProduccion = (typeof TIPOS_PROCESO_PRODUCCION)[number];

export const TIPOS_MOVIMIENTO_KARDEX = [
  'ENTRADA_COMPRA',
  'ENTRADA_PRODUCCION',
  'ENTRADA_DEVOLUCION_CLIENTE',
  'ENTRADA_DEVOLUCION_TALLER',
  'ENTRADA_TRASLADO',
  'ENTRADA_AJUSTE',
  'SALIDA_VENTA',
  'SALIDA_PRODUCCION',
  'SALIDA_TRASLADO',
  'SALIDA_TALLER_SERVICIO',
  'SALIDA_AJUSTE',
  'SALIDA_MERMA',
] as const;
export type TipoMovimientoKardex = (typeof TIPOS_MOVIMIENTO_KARDEX)[number];

export const METODOS_PAGO = [
  'EFECTIVO',
  'YAPE',
  'PLIN',
  'TARJETA_DEBITO',
  'TARJETA_CREDITO',
  'TRANSFERENCIA',
  'DEPOSITO',
  'CREDITO',
  'WHATSAPP_PENDIENTE',
] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

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

export const TIPOS_OC = ['NACIONAL', 'IMPORTACION', 'SERVICIO_TALLER'] as const;
export type TipoOC = (typeof TIPOS_OC)[number];

export const ESTADOS_OC = ['BORRADOR', 'APROBADA', 'ENVIADA', 'PARCIAL', 'RECIBIDA', 'PAGADA', 'CANCELADA'] as const;
export type EstadoOC = (typeof ESTADOS_OC)[number];

export const TIPOS_RECLAMO = ['RECLAMO', 'QUEJA'] as const;
export type TipoReclamo = (typeof TIPOS_RECLAMO)[number];

export const ESTADOS_RECLAMO = ['NUEVO', 'EN_REVISION', 'RESUELTO', 'DESESTIMADO'] as const;
export type EstadoReclamo = (typeof ESTADOS_RECLAMO)[number];

export const TALLAS = ['T0', 'T2', 'T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'TS', 'TAD'] as const;
export type Talla = (typeof TALLAS)[number];

export const ETIQUETAS_TALLA: Record<Talla, string> = {
  T0: '0', T2: '2', T4: '4', T6: '6', T8: '8',
  T10: '10', T12: '12', T14: '14', T16: '16',
  TS: 'Small', TAD: 'Adulto',
};
