/**
 * Tipos del historial de cuadres de caja.
 *
 * Viven acá y no en `cuadres-caja.ts` porque un archivo 'use server' sólo puede
 * exportar funciones async.
 */

import type { TotalPorCuenta } from '@happy/lib/pagos/etiqueta';

/** Una fila del historial: un turno de caja, abierto o cerrado. */
export type CuadreRow = {
  id: string;
  caja_nombre: string;
  almacen_nombre: string;
  abierta_en: string;
  cerrada_en: string | null;
  abierta_por: string;
  cerrada_por: string | null;
  monto_apertura: number;
  /** Ventas del turno (sin anuladas). */
  cantidad_ventas: number;
  total_vendido: number;
  /** Sólo lo cobrado en efectivo; es lo único que se cuenta a mano. */
  total_efectivo: number;
  total_gastos: number;
  efectivo_esperado: number;
  /** Lo que el cajero declaró haber contado. Null mientras el turno siga abierto. */
  efectivo_contado: number | null;
  diferencia: number | null;
  observaciones: string | null;
  abierta: boolean;
};

/** Un gasto o ingreso de caja chica dentro del turno. */
export type MovimientoCaja = {
  fecha: string;
  tipo: string;
  concepto: string;
  metodo: string | null;
  monto: number;
  registrado_por: string;
};

/** Una venta del turno, como se lista en el detalle del cuadre. */
export type VentaDelCuadre = {
  venta_id: string;
  fecha: string;
  numero: string;
  documento: string;
  tipo_documento: string;
  cliente: string;
  vendedor: string;
  total: number;
  /** "Efectivo · S/ 40.00 + Yape (BCP HAPPYS) · S/ 20.00" */
  pagos: string;
  anulada: boolean;
};

/** Un cambio de turno registrado sin cerrar la sesión. */
export type CierreParcialRow = {
  fecha: string;
  cajero_saliente: string;
  cajero_entrante: string;
  total_ventas: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  observaciones: string | null;
};

/** Todo lo que hace falta para imprimir el cuadre de un turno. */
export type CuadreDetalle = {
  cabecera: CuadreRow;
  /**
   * El arqueo con los mismos renglones que los botones de cobro del POS.
   *
   * Es el desglose que pidió el cliente: no alcanza con "Transferencia S/ 810",
   * hace falta saber a cuál de los dos bancos entró.
   */
  arqueo: TotalPorCuenta[];
  movimientos: MovimientoCaja[];
  ventas: VentaDelCuadre[];
  cierres_parciales: CierreParcialRow[];
};
