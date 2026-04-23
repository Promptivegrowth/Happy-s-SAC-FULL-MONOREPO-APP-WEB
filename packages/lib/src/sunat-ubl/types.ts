/**
 * Tipos del dominio para emisión de comprobantes electrónicos SUNAT.
 * UBL 2.1 / SUNAT.
 */

export type TipoComprobanteSunat =
  | '01'   // Factura
  | '03'   // Boleta
  | '07'   // Nota de crédito
  | '08';  // Nota de débito

export type TipoDocumentoIdentidad =
  | '0'    // Doc trib. no domic. sin RUC
  | '1'    // DNI
  | '4'    // Carnet extranjería
  | '6'    // RUC
  | '7';   // Pasaporte

export type Item = {
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidadSunat?: string;          // "NIU" por default
  precioUnitarioConIgv: number;  // precio unitario al consumidor (con IGV)
  descuento?: number;             // descuento total de la línea
  afectacionIgv?: '10'|'20'|'21'|'30'|'31'|'32'|'33'|'34'|'35'|'36'|'37';
};

export type Cliente = {
  tipoDoc: TipoDocumentoIdentidad;
  numeroDoc: string;
  razonSocial: string;
  direccion?: string;
  ubigeo?: string;
  email?: string;
};

export type Emisor = {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccionFiscal: string;
  ubigeo?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  codigoPais?: string;     // 'PE'
  codigoEstablecimiento?: string;  // '0000' default
};

export type ComprobanteInput = {
  tipo: TipoComprobanteSunat;
  serie: string;            // 'F001' / 'B001'
  numero: number;           // 1, 2, 3...
  fechaEmision: string;     // ISO 'YYYY-MM-DD'
  horaEmision?: string;     // 'HH:mm:ss'
  moneda: 'PEN' | 'USD';
  emisor: Emisor;
  cliente: Cliente;
  items: Item[];
  totalGravado?: number;    // se calcula si no viene
  totalIgv?: number;
  total?: number;
  totalLetras?: string;
  formaPago?: 'Contado' | 'Credito';
  observaciones?: string;
  // Para notas de crédito/débito:
  documentoReferencia?: { tipo: TipoComprobanteSunat; serieNumero: string; tipoMotivo?: string; descripcionMotivo?: string };
};

export type IGV_PORCENTAJE = 18;
export const IGV_RATE: IGV_PORCENTAJE = 18;

export function calcularTotales(input: ComprobanteInput) {
  let totalGravado = 0;
  let totalIgv = 0;
  let total = 0;
  const items = input.items.map((i) => {
    const lineaTotal = i.cantidad * i.precioUnitarioConIgv - (i.descuento ?? 0);
    const valorVenta = +(lineaTotal / (1 + IGV_RATE / 100)).toFixed(2);
    const igv = +(lineaTotal - valorVenta).toFixed(2);
    totalGravado += valorVenta;
    totalIgv += igv;
    total += lineaTotal;
    return { ...i, lineaTotal, valorVenta, igv };
  });
  return {
    totalGravado: +totalGravado.toFixed(2),
    totalIgv: +totalIgv.toFixed(2),
    total: +total.toFixed(2),
    items,
  };
}
