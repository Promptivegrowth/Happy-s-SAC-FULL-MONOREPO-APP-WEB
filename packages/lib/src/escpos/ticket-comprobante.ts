/**
 * El comprobante impreso en la ticketera, con la estructura que exige SUNAT.
 *
 * Es la "representación impresa" de un comprobante electrónico. Lo que tiene
 * que llevar sale del Reglamento de Comprobantes de Pago (RS 007-99/SUNAT,
 * art. 8) y de la RS 097-2012/SUNAT, que regula los electrónicos:
 *
 *   · del emisor: razón social, nombre comercial, RUC y la dirección del
 *     ESTABLECIMIENTO donde se emite —no la del domicilio fiscal, cuando son
 *     distintos, que es el caso de las dos tiendas;
 *   · la denominación del comprobante y su serie-correlativo;
 *   · fecha y hora de emisión;
 *   · del adquirente: tipo y número de documento y nombre o razón social;
 *   · el detalle: cantidad, descripción, valor unitario e importe;
 *   · el desglose de la operación (gravada, exonerada, inafecta), el IGV con
 *     su tasa, y el importe total;
 *   · el IMPORTE TOTAL EN LETRAS;
 *   · el resumen (hash) del comprobante firmado y el código QR con la cadena
 *     que SUNAT define;
 *   · la leyenda de representación impresa y dónde consultarlo.
 *
 * La nota de venta NO es comprobante de pago: se imprime con la misma plantilla
 * pero sin QR, sin hash y con la leyenda que lo aclara, para que nadie la
 * confunda con una boleta.
 */

import { nombreMetodo, cuentaDePago } from '../pagos/etiqueta-pago';
import { TicketEscPos, COLUMNAS, CORTE_MM_POR_DEFECTO, envolver } from './index';

export type TipoComprobanteTicket =
  | 'FACTURA' | 'BOLETA' | 'NOTA_VENTA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';

export type LineaTicket = {
  descripcion: string;
  cantidad: number;
  /** Unitario CON IGV, que es como lo ve el cliente en la tienda. */
  precio_unitario: number;
  importe: number;
  unidad?: string | null;
  codigo?: string | null;
};

export type PagoTicket = {
  metodo: string;
  monto: number;
  /**
   * La cuenta a la que entró la plata, como la llama el catálogo del cliente:
   * "BCP JAVIER", "CONTINENTAL - PLIN HAPPYS". El POS ya la guardaba; faltaba
   * imprimirla.
   */
  referencia?: string | null;
};

export type DatosTicket = {
  empresa: {
    razon_social: string;
    nombre_comercial?: string | null;
    ruc: string;
    /** Domicilio fiscal, de la tabla empresa. */
    direccion_fiscal?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  /**
   * La tienda donde se emite. SUNAT pide la dirección del establecimiento, y
   * las dos tiendas no están en el domicilio fiscal.
   */
  establecimiento?: { nombre?: string | null; direccion?: string | null } | null;
  comprobante: {
    tipo: TipoComprobanteTicket;
    numero_completo: string;
    /** ISO. Se muestra en hora de Perú. */
    fecha: string;
    igv_porcentaje: number;
    moneda?: string | null;
    /** Resumen del XML firmado; va impreso por exigencia de la RS 097-2012. */
    hash?: string | null;
    /** Para notas de crédito/débito. */
    documento_referencia?: string | null;
    motivo?: string | null;
  };
  cliente: {
    tipo_documento?: string | null;
    numero_documento?: string | null;
    nombre_o_razon_social: string;
    direccion?: string | null;
  };
  items: LineaTicket[];
  totales: {
    /** Base imponible de las operaciones gravadas. */
    gravado: number;
    exonerado?: number;
    inafecto?: number;
    descuento?: number;
    igv: number;
    total: number;
  };
  pagos: PagoTicket[];
  /** Vuelto, cuando pagó en efectivo. */
  vuelto?: number | null;
  vendedor: string;
  caja?: string | null;
  /** Total en letras. Si no viene, se arma con `numeroALetras`. */
  total_letras?: string | null;
  /** Logo ya convertido a puntos en blanco y negro; opcional. */
  logo?: boolean[][] | null;
};

const MONEDA_SIMBOLO: Record<string, string> = { PEN: 'S/', USD: 'US$', EUR: 'EUR' };

function simbolo(moneda?: string | null): string {
  return MONEDA_SIMBOLO[(moneda ?? 'PEN').toUpperCase()] ?? (moneda ?? 'S/');
}

function monto(n: number): string {
  return (Number(n) || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function nombreComprobante(tipo: TipoComprobanteTicket): string {
  switch (tipo) {
    case 'FACTURA': return 'FACTURA ELECTRÓNICA';
    case 'BOLETA': return 'BOLETA DE VENTA ELECTRÓNICA';
    case 'NOTA_CREDITO': return 'NOTA DE CRÉDITO ELECTRÓNICA';
    case 'NOTA_DEBITO': return 'NOTA DE DÉBITO ELECTRÓNICA';
    case 'NOTA_VENTA': return 'NOTA DE VENTA';
  }
}

/** Código de SUNAT para el catálogo 01, que va en la cadena del QR. */
function codigoTipo(tipo: TipoComprobanteTicket): string {
  switch (tipo) {
    case 'FACTURA': return '01';
    case 'BOLETA': return '03';
    case 'NOTA_CREDITO': return '07';
    case 'NOTA_DEBITO': return '08';
    default: return '00';
  }
}

/** Catálogo 06 de SUNAT: tipo de documento del adquirente. */
function codigoDocCliente(t?: string | null): string {
  switch ((t ?? '').toUpperCase()) {
    case 'DNI': return '1';
    case 'CE': return '4';
    case 'RUC': return '6';
    case 'PASAPORTE': return '7';
    default: return '0';
  }
}

/** Perú es UTC-5 todo el año: no hay horario de verano desde 1994. */
const DESFASE_PERU_MS = 5 * 60 * 60 * 1000;

function fechaHoraPeru(iso: string): { fecha: string; hora: string } {
  const d = new Date(new Date(iso).getTime() - DESFASE_PERU_MS);
  const s = d.toISOString();
  return { fecha: `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`, hora: s.slice(11, 16) };
}

function fechaISOPeru(iso: string): string {
  return new Date(new Date(iso).getTime() - DESFASE_PERU_MS).toISOString().slice(0, 10);
}

/**
 * La cadena que SUNAT exige dentro del QR, separada por "|":
 * RUC | tipo | serie | número | IGV | total | fecha | tipo doc cliente | nro doc.
 */
export function cadenaQrSunat(d: DatosTicket): string {
  const [serie = '', numero = ''] = d.comprobante.numero_completo.split('-');
  return [
    d.empresa.ruc,
    codigoTipo(d.comprobante.tipo),
    serie,
    numero,
    d.totales.igv.toFixed(2),
    d.totales.total.toFixed(2),
    fechaISOPeru(d.comprobante.fecha),
    codigoDocCliente(d.cliente.tipo_documento),
    d.cliente.numero_documento ?? '',
  ].join('|');
}

/** Un comprobante electrónico lleva QR y hash; la nota de venta no. */
function esElectronico(tipo: TipoComprobanteTicket): boolean {
  return tipo !== 'NOTA_VENTA';
}

/**
 * Arma el ticket completo.
 *
 * No deja renglones en blanco de relleno: el papel termina donde termina el
 * texto y lo único que avanza después es la distancia hasta la cuchilla.
 */
export function construirTicket(
  d: DatosTicket,
  opciones: { avanceCorteMm?: number; abrirCajon?: boolean } = {},
): TicketEscPos {
  const t = new TicketEscPos();
  const sim = simbolo(d.comprobante.moneda);
  const { fecha, hora } = fechaHoraPeru(d.comprobante.fecha);

  // ─────────────────────────────────────────────── emisor
  t.alinear('centro');
  if (d.logo && d.logo.length > 0) {
    t.imagen(d.logo);
    t.salto();
  }

  t.negrita(true).tamano(1, 2);
  t.linea((d.empresa.nombre_comercial || d.empresa.razon_social).toUpperCase());
  t.tamano(1, 1);
  if (d.empresa.nombre_comercial) t.linea(d.empresa.razon_social.toUpperCase());
  t.negrita(false);
  t.linea(`RUC ${d.empresa.ruc}`);

  // La dirección del ESTABLECIMIENTO, que es lo que pide SUNAT. El domicilio
  // fiscal solo se agrega si es otro, para no repetir la misma línea dos veces.
  const dirEstablecimiento = d.establecimiento?.direccion?.trim();
  const dirFiscal = d.empresa.direccion_fiscal?.trim();
  if (dirEstablecimiento) {
    if (d.establecimiento?.nombre) t.linea(d.establecimiento.nombre);
    t.linea(dirEstablecimiento);
    if (dirFiscal && dirFiscal !== dirEstablecimiento) {
      t.linea(`Domicilio fiscal: ${dirFiscal}`);
    }
  } else if (dirFiscal) {
    t.linea(dirFiscal);
  }
  if (d.empresa.telefono) t.linea(`Tel. ${d.empresa.telefono}`);

  // ─────────────────────────────────────────────── denominación y número
  t.salto();
  t.negrita(true);
  t.linea(nombreComprobante(d.comprobante.tipo));
  t.tamano(2, 2);
  t.linea(d.comprobante.numero_completo);
  t.tamano(1, 1);
  t.negrita(false);

  t.alinear('izq');
  t.separador();
  t.lineaDoble(`Fecha: ${fecha}`, `Hora: ${hora}`);

  if (d.comprobante.documento_referencia) {
    t.linea(`Documento que modifica: ${d.comprobante.documento_referencia}`);
  }
  if (d.comprobante.motivo) t.linea(`Motivo: ${d.comprobante.motivo}`);

  // ─────────────────────────────────────────────── adquirente
  t.separador();
  const tipoDoc = (d.cliente.tipo_documento ?? '').toUpperCase();
  if (tipoDoc && d.cliente.numero_documento) {
    t.linea(`${tipoDoc}: ${d.cliente.numero_documento}`);
  }
  t.linea(`Cliente: ${d.cliente.nombre_o_razon_social || 'CLIENTE VARIOS'}`);
  if (d.cliente.direccion) t.linea(`Dir.: ${d.cliente.direccion}`);

  // ─────────────────────────────────────────────── detalle
  //
  // Dos renglones por ítem en vez de cuatro columnas apretadas: en 42
  // caracteres, meter descripción, cantidad, unitario e importe en una sola
  // línea deja la descripción en seis letras y el ticket ilegible. Arriba el
  // nombre completo, abajo "cant x unitario" y el importe a la derecha; están
  // los cuatro datos que pidió el cliente y se leen.
  t.separador();
  t.negrita(true);
  t.lineaDoble('CANT x P.UNIT', 'IMPORTE');
  t.negrita(false);
  t.separador();

  for (const it of d.items) {
    for (const l of envolver(it.descripcion, COLUMNAS)) t.linea(l);
    const cant = Number.isInteger(it.cantidad) ? String(it.cantidad) : it.cantidad.toFixed(2);
    t.lineaDoble(`  ${cant} x ${monto(it.precio_unitario)}`, `${sim} ${monto(it.importe)}`);
  }

  // ─────────────────────────────────────────────── totales
  t.separador();
  const desc = d.totales.descuento ?? 0;
  if (desc > 0) t.lineaDoble('Descuentos', `${sim} ${monto(desc)}`);
  if (d.totales.gravado > 0) t.lineaDoble('Op. gravada', `${sim} ${monto(d.totales.gravado)}`);
  if ((d.totales.exonerado ?? 0) > 0) t.lineaDoble('Op. exonerada', `${sim} ${monto(d.totales.exonerado!)}`);
  if ((d.totales.inafecto ?? 0) > 0) t.lineaDoble('Op. inafecta', `${sim} ${monto(d.totales.inafecto!)}`);
  t.lineaDoble(`IGV (${d.comprobante.igv_porcentaje}%)`, `${sim} ${monto(d.totales.igv)}`);

  t.negrita(true);
  t.tamano(1, 2);
  t.lineaDoble('TOTAL', `${sim} ${monto(d.totales.total)}`, COLUMNAS);
  t.tamano(1, 1);
  t.negrita(false);

  // El importe en letras es obligatorio en la representación impresa.
  const letras = (d.total_letras ?? '').trim();
  if (letras) {
    t.salto();
    for (const l of envolver(`SON: ${letras.toUpperCase()}`, COLUMNAS)) t.linea(l);
  }

  // ─────────────────────────────────────────────── pagos
  if (d.pagos.length > 0) {
    t.separador();
    /*
     * El método arriba y la cuenta debajo, indentada.
     *
     * En una sola línea no entran: "Transferencia" más "CONTINENTAL - PLIN
     * HAPPYS" más el importe pasan de los 42 caracteres del papel y el nombre
     * de la cuenta —que es justo el dato nuevo— sería lo que se corte.
     *
     * Va en el voucher porque la vendedora lo necesita en la mano: cuando el
     * cliente dice "ya te yapié" hay que poder mirar el papel y decir a qué
     * número entró.
     */
    for (const p of d.pagos) {
      t.lineaDoble(nombreMetodo(p.metodo), `${sim} ${monto(p.monto)}`);
      const cuenta = cuentaDePago(p.metodo, p.referencia);
      if (cuenta) for (const l of envolver(`  ${cuenta}`, COLUMNAS)) t.linea(l);
    }
    if ((d.vuelto ?? 0) > 0) t.lineaDoble('Vuelto', `${sim} ${monto(d.vuelto!)}`);
  }

  // ─────────────────────────────────────────────── QR + hash
  t.separador();
  if (esElectronico(d.comprobante.tipo)) {
    if (d.comprobante.hash) {
      t.alinear('centro');
      t.linea('Resumen del comprobante');
      for (const l of envolver(d.comprobante.hash, COLUMNAS)) t.linea(l);
      t.salto();
    }
    t.alinear('centro');
    t.qr(cadenaQrSunat(d));
    t.salto();
  }

  // ─────────────────────────────────────────────── pie
  t.alinear('centro');
  if (esElectronico(d.comprobante.tipo)) {
    t.linea(`Representación impresa de la ${nombreComprobante(d.comprobante.tipo).toLowerCase()}.`);
    t.linea('Consulte su comprobante en www.sunat.gob.pe');
  } else {
    t.negrita(true);
    t.linea('DOCUMENTO INTERNO');
    t.negrita(false);
    t.linea('No es comprobante de pago. No tiene validez tributaria.');
  }

  t.alinear('izq');
  t.separador();
  t.linea(`Atendido por: ${d.vendedor}`);
  if (d.caja) t.linea(`Caja: ${d.caja}`);

  t.alinear('centro');
  t.salto();
  t.negrita(true);
  t.linea('¡Gracias por su compra!');
  t.negrita(false);

  if (opciones.abrirCajon) t.abrirCajon();
  t.cortar(opciones.avanceCorteMm ?? CORTE_MM_POR_DEFECTO);
  return t;
}
