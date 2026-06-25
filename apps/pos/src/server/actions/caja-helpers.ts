/**
 * Helpers SÍNCRONOS para caja/comprobantes.
 * Se separa de `caja.ts` ('use server') porque Next.js sólo permite
 * exports async desde server actions.
 */

// ----------------------------------------------------------------------------
// MÉTODOS DE PAGO (igualados a las columnas totales_* de cajas_sesiones)
// ----------------------------------------------------------------------------
export const METODOS_PAGO = [
  'EFECTIVO',
  'YAPE',
  'PLIN',
  'TARJETA_DEBITO',
  'TARJETA_CREDITO',
  'TRANSFERENCIA',
  'DEPOSITO',
  'OTROS',
] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export type TipoComprobantePOS = 'BOLETA' | 'FACTURA' | 'NOTA_VENTA';
export type TipoDocumentoCliente = 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
export type FormatoImpresion = 'TICKET_80MM' | 'A4';

// Fila del historial de transacciones de la sesión (UI POS)
export type TransaccionRow = {
  venta_id: string;
  numero_venta: string;
  fecha: string;
  cliente_nombre: string;
  cliente_doc: string | null;
  cliente_telefono: string | null;
  total: number;
  metodos: string[];
  comprobante: { tipo: string; numero_completo: string } | null;
  estado: string;
};

// ----------------------------------------------------------------------------
// PALETA HAPPY (alineada con apps/erp/src/server/actions/reportes-helpers.ts)
// ----------------------------------------------------------------------------
export const BRAND = {
  naranja: 'FFFF4D0D', // #ff4d0d (ARGB sin #)
  naranjaHex: '#ff4d0d',
  azul: 'FF1E3A5F', // #1E3A5F
  azulHex: '#1E3A5F',
  verde: 'FF10B981',
  verdeHex: '#10B981',
  rojo: 'FFDC2626',
  rojoHex: '#DC2626',
  textoOscuro: 'FF0F172A',
  textoOscuroHex: '#0F172A',
  bgSuave: 'FFF8FAFC',
  bgSuaveHex: '#F8FAFC',
  blanco: 'FFFFFFFF',
} as const;

// ----------------------------------------------------------------------------
// DTOs compartidos client <-> server
// ----------------------------------------------------------------------------
export type SesionCajaDTO = {
  id: string;
  caja_id: string;
  caja_nombre: string;
  caja_codigo: string;
  almacen_id: string;
  abierta_en: string;
  abierta_por: string;
  cajero_nombre: string;
  monto_apertura: number;
  observaciones: string | null;
};

export type BalanceCajaDTO = {
  // Totales por método (suman ventas COMPLETADAs con caja_sesion_id = sesion)
  total_efectivo: number;
  total_yape: number;
  total_plin: number;
  total_tarjeta: number; // TARJETA_DEBITO + TARJETA_CREDITO
  total_transferencia: number;
  total_otros: number;
  // Totales globales
  total_ventas: number;
  cantidad_ventas: number;
  // Cuadre efectivo
  monto_apertura: number;
  total_gastos: number; // egresos de caja chica (en efectivo)
  total_ingresos_extra: number; // ingresos de caja chica no asociados a venta
  esperado_efectivo: number; // apertura + total_efectivo + total_ingresos_extra - total_gastos
};

export type EmpresaPDF = {
  razon_social: string;
  nombre_comercial: string | null;
  ruc: string;
  direccion_fiscal: string | null;
  telefono: string | null;
  email: string | null;
  logo_url: string | null;
  igv_porcentaje: number;
};

export type ClientePDF = {
  tipo_documento: TipoDocumentoCliente | null;
  numero_documento: string | null;
  nombre_o_razon_social: string;
  direccion: string | null;
};

export type ItemPDF = {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  sub_total: number; // cantidad * precio_unitario - descuento (con IGV)
};

export type PagoPDF = { metodo: string; monto: number };

export type ComprobantePDFData = {
  empresa: EmpresaPDF;
  comprobante: {
    tipo: TipoComprobantePOS;
    numero_completo: string;
    fecha: string; // ISO
    igv_porcentaje: number;
  };
  cliente: ClientePDF;
  items: ItemPDF[];
  totales: { sub_total: number; igv: number; total: number };
  pagos: PagoPDF[];
  vendedor: string;
};

// ----------------------------------------------------------------------------
// Etiquetas legibles
// ----------------------------------------------------------------------------
export function metodoLabel(m: string): string {
  switch (m) {
    case 'EFECTIVO': return 'Efectivo';
    case 'YAPE': return 'Yape';
    case 'PLIN': return 'Plin';
    case 'TARJETA_DEBITO': return 'Tarjeta débito';
    case 'TARJETA_CREDITO': return 'Tarjeta crédito';
    case 'TRANSFERENCIA': return 'Transferencia';
    case 'DEPOSITO': return 'Depósito';
    case 'WHATSAPP_PENDIENTE': return 'WhatsApp pendiente';
    case 'CREDITO': return 'Crédito';
    default: return m;
  }
}

export function tipoComprobanteLabel(t: TipoComprobantePOS): string {
  switch (t) {
    case 'BOLETA': return 'BOLETA DE VENTA ELECTRÓNICA';
    case 'FACTURA': return 'FACTURA ELECTRÓNICA';
    case 'NOTA_VENTA': return 'NOTA DE VENTA';
  }
}
