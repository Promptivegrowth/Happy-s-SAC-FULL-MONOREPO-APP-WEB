/**
 * Tickets de caja: movimientos de caja chica y cierre de turno.
 *
 * No son comprobantes de pago: no van a SUNAT y no llevan QR ni código de
 * barras. Son el papel que la cajera guarda en la caja y firma, y lo que se
 * compara contra el efectivo al entregar el turno.
 *
 * Salen por la ticketera igual que las boletas, con su corte al final. Antes
 * se imprimían abriendo una ventana del navegador y dándole a imprimir, y eso
 * pasa por el controlador de Windows: como el papel de la ticketera es un
 * rollo continuo, el controlador no sabe dónde termina la hoja y la máquina
 * sigue sacando papel hasta que alguien la para a mano. Pasó en tienda el
 * 16/09/2026.
 */

import { TicketEscPos, COLUMNAS, CORTE_MM_POR_DEFECTO, envolver } from './index';

/**
 * Cuántas columnas entran con letra de ancho doble.
 *
 * La mitad, porque cada carácter ocupa el doble. Sin pasar este ancho, un
 * nombre de empresa largo se sale del papel y nadie se entera hasta ver el
 * ticket cortado a la mitad.
 */
const COLUMNAS_LETRA_DOBLE = Math.floor(COLUMNAS / 2);

export type EncabezadoCaja = {
  empresa: string;
  ruc: string;
  establecimiento?: string | null;
  caja: string;
  cajero: string;
};

export type MovimientoCaja = {
  fecha: string;
  tipo: 'INGRESO' | 'EGRESO';
  concepto: string;
  categoria?: string | null;
  referencia?: string | null;
  monto: number;
};

export type OpcionesTicketCaja = {
  avanceCorteMm?: number;
};

const soles = (n: number) => `S/ ${Number(n ?? 0).toFixed(2)}`;

function horaCorta(fecha: string): string {
  const d = new Date(fecha);
  return Number.isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fechaLarga(fecha: Date | string = new Date()): string {
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-PE');
}

/** Cabecera común: quién, dónde y cuándo. Sin esto el papel no sirve de nada. */
function encabezado(t: TicketEscPos, cab: EncabezadoCaja, titulo: string) {
  t.alinear('centro').negrita(true).tamano(2, 2);
  t.linea(cab.empresa, COLUMNAS_LETRA_DOBLE);
  t.tamano(1, 1);
  t.linea(`RUC ${cab.ruc}`);
  t.negrita(false);
  if (cab.establecimiento) t.linea(cab.establecimiento);
  t.salto();
  t.negrita(true).linea(titulo).negrita(false);
  t.separador('=');
  t.alinear('izq');
  t.lineaDoble('Caja:', cab.caja);
  t.lineaDoble('Cajero:', cab.cajero);
  t.lineaDoble('Impreso:', fechaLarga());
  t.separador();
}

/**
 * Cierre de la hoja: dos firmas.
 *
 * El papel existe para que alguien se haga responsable del efectivo que
 * entrega y alguien más de lo que recibe. Sin las líneas, no hay dónde firmar.
 */
function firmas(t: TicketEscPos) {
  t.salto(3);
  t.alinear('centro');
  t.linea('____________________');
  t.linea('Entrega');
  t.salto(2);
  t.linea('____________________');
  t.linea('Recibe');
}

/**
 * Ticket de movimientos de caja chica del turno.
 */
export function construirTicketGastos(
  cab: EncabezadoCaja,
  movimientos: MovimientoCaja[],
  opciones: OpcionesTicketCaja = {},
): TicketEscPos {
  const t = new TicketEscPos();
  encabezado(t, cab, 'CAJA CHICA - MOVIMIENTOS');

  const ingresos = movimientos.filter((m) => m.tipo === 'INGRESO');
  const egresos = movimientos.filter((m) => m.tipo === 'EGRESO');
  const sumar = (lista: MovimientoCaja[]) => lista.reduce((s, m) => s + Number(m.monto ?? 0), 0);
  const totalIngresos = sumar(ingresos);
  const totalEgresos = sumar(egresos);

  if (movimientos.length === 0) {
    t.salto();
    t.alinear('centro').linea('Sin movimientos en el turno');
    t.alinear('izq').salto();
  } else {
    for (const m of movimientos) {
      const signo = m.tipo === 'EGRESO' ? '-' : '+';
      t.negrita(true);
      t.lineaDoble(`${horaCorta(m.fecha)} ${m.concepto}`, `${signo}${soles(m.monto)}`);
      t.negrita(false);
      // La categoría y el número de comprobante van debajo y con sangría: son
      // para cuadrar después, no para leer de un vistazo.
      if (m.categoria) t.linea(`   ${m.categoria}`);
      if (m.referencia) t.linea(`   Ref: ${m.referencia}`);
    }
    t.separador();
  }

  t.lineaDoble('Ingresos', `+${soles(totalIngresos)}`);
  t.lineaDoble('Egresos', `-${soles(totalEgresos)}`);
  t.lineaDoble('Movimientos', String(movimientos.length));
  t.separador('=');
  t.negrita(true).tamano(1, 2);
  t.lineaDoble('NETO', soles(totalIngresos - totalEgresos));
  t.tamano(1, 1).negrita(false);

  firmas(t);
  t.cortar(opciones.avanceCorteMm ?? CORTE_MM_POR_DEFECTO);
  return t;
}

export type DatosCierre = {
  aperturaEn: string;
  montoApertura: number;
  totalEfectivo: number;
  totalYape: number;
  totalPlin: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalOtros: number;
  totalVentas: number;
  cantidadVentas: number;
  totalGastos: number;
  totalIngresosExtra: number;
  esperadoEfectivo: number;
  contadoEfectivo: number;
  observaciones?: string | null;
  /*
   * El mismo dinero abierto por cuenta destino.
   *
   * Los totales de arriba son por medio de pago; esto dice a qué cuenta entró
   * cada peso. Sin esto el arqueo decía "Transferencia S/ 1165" y quien cuadra
   * el banco al día siguiente no sabía cuál de los dos bancos abrir.
   *
   * Opcional a propósito: un ticket viejo reimpreso no tiene el dato y debe
   * seguir saliendo igual que antes en vez de romperse.
   */
  porCuenta?: Array<{ etiqueta: string; monto: number; cantidad: number }>;
  /** Cierre de fin de día o cambio de turno. */
  parcial?: boolean;
  /** A quién se le entrega la caja, en un cierre parcial. */
  cajeroEntrante?: string | null;
};

/**
 * Ticket del cierre de caja.
 *
 * Lleva el desglose por medio de pago porque el cuadre solo se puede discutir
 * con el detalle delante: si falta plata, lo primero es ver si una venta de
 * tarjeta se cobró en efectivo o al revés.
 */
export function construirTicketCierre(
  cab: EncabezadoCaja,
  d: DatosCierre,
  opciones: OpcionesTicketCaja = {},
): TicketEscPos {
  const t = new TicketEscPos();
  encabezado(t, cab, d.parcial ? 'CIERRE DE TURNO' : 'CIERRE DE CAJA');

  t.lineaDoble('Apertura:', fechaLarga(d.aperturaEn));
  if (d.parcial && d.cajeroEntrante) t.lineaDoble('Entra:', d.cajeroEntrante);
  t.separador();

  t.negrita(true).linea('VENTAS POR MEDIO DE PAGO').negrita(false);
  t.lineaDoble('Efectivo', soles(d.totalEfectivo));
  t.lineaDoble('Yape', soles(d.totalYape));
  t.lineaDoble('Plin', soles(d.totalPlin));
  t.lineaDoble('Tarjeta', soles(d.totalTarjeta));
  t.lineaDoble('Transferencia', soles(d.totalTransferencia));
  if (d.totalOtros > 0) t.lineaDoble('Otros', soles(d.totalOtros));

  /*
   * El detalle por cuenta, debajo del resumen por método.
   *
   * Va después y no en lugar del otro: el resumen por método es el que se mira
   * de un vistazo y el que la cajera compara con lo que tiene anotado. El
   * detalle por cuenta es para quien concilia el banco, que necesita el
   * renglón exacto.
   *
   * El efectivo se salta: no entra a ninguna cuenta y ya está arriba, contado
   * y cuadrado aparte.
   */
  const porCuenta = (d.porCuenta ?? []).filter((c) => c.etiqueta !== 'Efectivo');
  if (porCuenta.length > 0) {
    t.salto();
    t.negrita(true).linea('DETALLE POR CUENTA').negrita(false);
    for (const c of porCuenta) {
      for (const l of envolver(`${c.etiqueta} (${c.cantidad})`, COLUMNAS)) t.linea(l);
      t.lineaDoble('', soles(c.monto));
    }
  }

  t.separador();
  t.negrita(true);
  t.lineaDoble(`TOTAL VENTAS (${d.cantidadVentas})`, soles(d.totalVentas));
  t.negrita(false);
  t.salto();

  t.negrita(true).linea('CUADRE DE EFECTIVO').negrita(false);
  t.lineaDoble('Monto de apertura', soles(d.montoApertura));
  t.lineaDoble('+ Ventas efectivo', soles(d.totalEfectivo));
  t.lineaDoble('+ Ingresos caja chica', soles(d.totalIngresosExtra));
  t.lineaDoble('- Gastos caja chica', soles(d.totalGastos));
  t.separador();
  t.lineaDoble('Esperado en caja', soles(d.esperadoEfectivo));
  t.negrita(true);
  t.lineaDoble('Contado', soles(d.contadoEfectivo));
  t.negrita(false);

  /*
   * La diferencia va en letra grande y con su nombre.
   *
   * Es el único número por el que alguien va a responder, y "SOBRANTE" o
   * "FALTANTE" dice en una palabra lo que un signo menos no dice.
   */
  const diferencia = Number(d.contadoEfectivo ?? 0) - Number(d.esperadoEfectivo ?? 0);
  const cuadra = Math.abs(diferencia) < 0.01;
  t.separador('=');
  t.negrita(true).tamano(1, 2);
  t.lineaDoble(
    cuadra ? 'CUADRA' : diferencia > 0 ? 'SOBRANTE' : 'FALTANTE',
    cuadra ? soles(0) : soles(Math.abs(diferencia)),
  );
  t.tamano(1, 1).negrita(false);

  if (d.observaciones && d.observaciones.trim()) {
    t.salto();
    t.negrita(true).linea('Observaciones').negrita(false);
    t.linea(d.observaciones.trim());
  }

  firmas(t);
  t.cortar(opciones.avanceCorteMm ?? CORTE_MM_POR_DEFECTO);
  return t;
}
