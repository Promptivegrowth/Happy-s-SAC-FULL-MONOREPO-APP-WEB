// Helpers sin 'use server' para módulo de pagos a proveedores.

export const METODOS_PAGO_PROVEEDOR = [
  'EFECTIVO',
  'YAPE',
  'PLIN',
  'TARJETA_DEBITO',
  'TARJETA_CREDITO',
  'TRANSFERENCIA',
  'DEPOSITO',
  'CREDITO',
] as const;
export type MetodoPago = (typeof METODOS_PAGO_PROVEEDOR)[number];

export const METODO_PAGO_PROVEEDOR_LABEL: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  YAPE: 'Yape',
  PLIN: 'Plin',
  TARJETA_DEBITO: 'Tarjeta de débito',
  TARJETA_CREDITO: 'Tarjeta de crédito',
  TRANSFERENCIA: 'Transferencia bancaria',
  DEPOSITO: 'Depósito en cuenta',
  CREDITO: 'Crédito (sin egreso)',
};
