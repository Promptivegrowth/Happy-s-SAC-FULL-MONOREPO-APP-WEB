-- ===========================================================================
-- HAPPY SAC — Tipos enumerados
-- Mantener sincronizados con packages/db/src/enums.ts
-- ===========================================================================

create type rol_sistema as enum (
  'gerente',
  'jefe_produccion',
  'operario',
  'almacenero',
  'cajero',
  'vendedor_b2b',
  'contador',
  'cliente'
);

create type tipo_documento_identidad as enum ('DNI','RUC','CE','PASAPORTE');

create type tipo_cliente as enum (
  'PUBLICO_FINAL','MAYORISTA_A','MAYORISTA_B','MAYORISTA_C','INDUSTRIAL'
);

create type categoria_material as enum ('TELA','AVIO','INSUMO','EMPAQUE');

create type tipo_almacen as enum (
  'MATERIA_PRIMA','PRODUCTO_TERMINADO','TIENDA','PRODUCCION','TALLER_EXTERNO','MERMA'
);

create type talla_prenda as enum (
  'T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'
);

create type estado_ot as enum (
  'BORRADOR',
  'PLANIFICADA',
  'EN_CORTE',
  'EN_HABILITADO',
  'EN_SERVICIO',
  'EN_DECORADO',
  'EN_CONTROL_CALIDAD',
  'COMPLETADA',
  'CANCELADA'
);

create type tipo_proceso_produccion as enum (
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO'
);

create type tipo_movimiento_kardex as enum (
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
  'SALIDA_MERMA'
);

create type metodo_pago as enum (
  'EFECTIVO','YAPE','PLIN','TARJETA_DEBITO','TARJETA_CREDITO',
  'TRANSFERENCIA','DEPOSITO','CREDITO','WHATSAPP_PENDIENTE'
);

create type tipo_comprobante as enum (
  'NOTA_VENTA','BOLETA','FACTURA','NOTA_CREDITO','NOTA_DEBITO','GUIA_REMISION'
);

create type estado_comprobante as enum (
  'BORRADOR','EMITIDO','ACEPTADO','OBSERVADO','RECHAZADO','ANULADO'
);

create type estado_pedido_web as enum (
  'PENDIENTE_PAGO',
  'PAGO_VERIFICADO',
  'EN_PREPARACION',
  'LISTO_RECOJO',
  'EN_DELIVERY',
  'ENTREGADO',
  'CANCELADO',
  'WHATSAPP_DERIVADO'
);

create type tipo_oc as enum ('NACIONAL','IMPORTACION','SERVICIO_TALLER');
create type estado_oc as enum (
  'BORRADOR','APROBADA','ENVIADA','PARCIAL','RECIBIDA','PAGADA','CANCELADA'
);

create type tipo_reclamo as enum ('RECLAMO','QUEJA');
create type estado_reclamo as enum ('NUEVO','EN_REVISION','RESUELTO','DESESTIMADO');

create type canal_venta as enum ('POS','WEB','B2B','WHATSAPP','REDES');
