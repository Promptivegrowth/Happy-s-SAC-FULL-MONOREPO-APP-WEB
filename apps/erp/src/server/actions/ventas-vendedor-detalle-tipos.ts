/** Tipos del detalle de ventas por vendedor. Aparte porque el otro es 'use server'. */

export type FiltrosVendedorDetalle = {
  desde: string;
  hasta: string;
  canal?: string;
  almacen_id?: string;
  vendedor_id?: string;
};

/** Un día de un vendedor. */
export type DiaVendedor = {
  fecha: string;
  vendedor_id: string;
  vendedor_nombre: string;
  cantidad_ventas: number;
  total_vendido: number;
  ticket_promedio: number;
};

/** Una venta, con todo lo que hace falta para auditarla. */
export type VentaDetalleRow = {
  venta_id: string;
  fecha: string;
  dia: string;
  numero: string;
  documento: string;
  tipo_documento: string;
  canal: string;
  cliente: string;
  vendedor_id: string;
  vendedor_nombre: string;
  total: number;
  pagos: string;
};

export type VentasVendedorDetalle = {
  por_dia: DiaVendedor[];
  detalle: VentaDetalleRow[];
  total_general: number;
  cantidad_ventas: number;
};
