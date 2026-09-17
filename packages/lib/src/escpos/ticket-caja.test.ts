/**
 * Pruebas de los papeles de caja: gastos del turno y cierre.
 *
 * Lo que motivó estos tickets fue una ticketera sacando papel sin parar hasta
 * que la cajera la detuvo a mano (tienda, 16/09/2026). Pasaba porque se
 * imprimían desde el navegador, a través del controlador de Windows, que en
 * papel de rollo continuo no sabe dónde termina la hoja.
 *
 * Por eso la prueba que más importa acá es la más aburrida: que el ticket
 * TERMINE, con su comando de corte y sin nada después.
 */

import { describe, it, expect } from 'vitest';
import { TicketEscPos, COLUMNAS, PUNTO_MM } from './index';
import {
  construirTicketGastos,
  construirTicketCierre,
  type EncabezadoCaja,
  type MovimientoCaja,
  type DatosCierre,
} from './ticket-caja';

/** Los bytes como texto latin1, para poder buscar cadenas dentro. */
function texto(t: TicketEscPos): string {
  return Buffer.from(t.aBytes()).toString('latin1');
}

function bytes(t: TicketEscPos): number[] {
  return Array.from(t.aBytes());
}

/**
 * Los renglones que se van a ver en el papel, ya sin comandos.
 *
 * Se quitan exactamente los comandos que emite la clase, con su parámetro. El
 * parámetro suele ser un byte imprimible: si no se descuenta, cada línea
 * parece un par de caracteres más larga de lo que realmente es.
 */
function renglones(t: TicketEscPos): string[] {
  return texto(t)
    .replace(/\x1b@/g, '')          // init
    .replace(/\x1bt[\s\S]/g, '')    // tabla de caracteres
    .replace(/\x1ba[\s\S]/g, '')    // alineación
    .replace(/\x1bE[\s\S]/g, '')    // negrita
    .replace(/\x1d![\s\S]/g, '')    // tamaño de letra
    .replace(/\x1dVB[\s\S]/g, '')   // corte
    .split('\n');
}

const CAB: EncabezadoCaja = {
  empresa: 'DISFRACES HAPPYS',
  ruc: '20603133545',
  establecimiento: 'TIENDA HUALLAGA',
  caja: 'Caja 1 Huallaga',
  cajero: 'Rosa Quispe',
};

const MOVS: MovimientoCaja[] = [
  {
    fecha: '2026-09-16T14:05:00.000Z',
    tipo: 'EGRESO',
    concepto: 'Taxi a proveedor',
    categoria: 'Movilidad',
    referencia: 'F001-123',
    monto: 25,
  },
  {
    fecha: '2026-09-16T16:40:00.000Z',
    tipo: 'EGRESO',
    concepto: 'Almuerzo personal',
    categoria: null,
    referencia: null,
    monto: 18.5,
  },
  {
    fecha: '2026-09-16T18:10:00.000Z',
    tipo: 'INGRESO',
    concepto: 'Devolución de adelanto',
    categoria: null,
    referencia: null,
    monto: 40,
  },
];

const CIERRE: DatosCierre = {
  aperturaEn: '2026-09-16T13:00:00.000Z',
  montoApertura: 100,
  totalEfectivo: 850.5,
  totalYape: 320,
  totalPlin: 0,
  totalTarjeta: 210,
  totalTransferencia: 0,
  totalOtros: 0,
  totalVentas: 1380.5,
  cantidadVentas: 23,
  totalGastos: 43.5,
  totalIngresosExtra: 40,
  esperadoEfectivo: 947,
  contadoEfectivo: 947,
  observaciones: null,
};

describe('el ticket siempre termina', () => {
  it('el de gastos corta al final y no imprime nada después', () => {
    const b = bytes(construirTicketGastos(CAB, MOVS));
    // GS V B n: los últimos cuatro bytes. Si quedara algo después del corte,
    // saldría en el ticket siguiente.
    expect(b.slice(-4, -1)).toEqual([0x1d, 0x56, 0x42]);
  });

  it('el de cierre corta al final y no imprime nada después', () => {
    const b = bytes(construirTicketCierre(CAB, CIERRE));
    expect(b.slice(-4, -1)).toEqual([0x1d, 0x56, 0x42]);
  });

  it('respeta el avance de corte de cada ticketera', () => {
    const b = bytes(construirTicketCierre(CAB, CIERRE, { avanceCorteMm: 20 }));
    expect(b[b.length - 1]).toBe(Math.round(20 / PUNTO_MM));
  });

  it('un ticket sin movimientos también termina', () => {
    // La cajera puede darle a imprimir con la lista vacía; el papel tiene que
    // salir y cortarse igual, no quedarse a medias.
    const t = construirTicketGastos(CAB, []);
    expect(bytes(t).slice(-4, -1)).toEqual([0x1d, 0x56, 0x42]);
    expect(texto(t)).toContain('Sin movimientos');
  });
});

describe('nada se sale del ancho del papel', () => {
  it('ningún renglón pasa las 42 columnas', () => {
    for (const t of [construirTicketGastos(CAB, MOVS), construirTicketCierre(CAB, CIERRE)]) {
      const largos = renglones(t).map((l) => l.length);
      expect(Math.max(...largos)).toBeLessThanOrEqual(COLUMNAS);
    }
  });

  it('un concepto largo no empuja el monto fuera del papel', () => {
    const t = construirTicketGastos(CAB, [
      {
        fecha: '2026-09-16T14:05:00.000Z',
        tipo: 'EGRESO',
        concepto: 'Compra de materiales de limpieza y artículos varios para la tienda',
        monto: 199.9,
      },
    ]);
    expect(Math.max(...renglones(t).map((l) => l.length))).toBeLessThanOrEqual(COLUMNAS);
    expect(texto(t)).toContain('199.90');
  });
});

describe('el ticket de gastos dice lo que hay que saber', () => {
  const t = construirTicketGastos(CAB, MOVS);
  const salida = texto(t);

  it('lleva de quién y de qué caja es', () => {
    // Sin esto el papel no sirve para reclamarle nada a nadie.
    expect(salida).toContain('Rosa Quispe');
    expect(salida).toContain('Caja 1 Huallaga');
    expect(salida).toContain('20603133545');
  });

  it('suma los egresos y los ingresos por separado', () => {
    expect(salida).toContain('43.50'); // 25.00 + 18.50
    expect(salida).toContain('40.00');
  });

  it('muestra el neto del turno', () => {
    expect(salida).toContain('NETO');
    expect(salida).toContain('3.50'); // 40.00 - 43.50, en negativo
  });

  it('marca cada movimiento con su signo', () => {
    expect(salida).toContain('-S/ 25.00');
    expect(salida).toContain('+S/ 40.00');
  });

  it('pone la categoría y el comprobante cuando los hay', () => {
    expect(salida).toContain('Movilidad');
    expect(salida).toContain('Ref: F001-123');
  });

  it('tiene dónde firmar', () => {
    expect(salida).toContain('Entrega');
    expect(salida).toContain('Recibe');
  });
});

describe('el ticket de cierre deja el cuadre a la vista', () => {
  it('desglosa las ventas por medio de pago', () => {
    const salida = texto(construirTicketCierre(CAB, CIERRE));
    // Si falta plata, lo primero que se revisa es si una venta de tarjeta se
    // cobró en efectivo: sin el desglose no hay forma de discutirlo.
    expect(salida).toContain('Efectivo');
    expect(salida).toContain('850.50');
    expect(salida).toContain('Yape');
    expect(salida).toContain('320.00');
    expect(salida).toContain('Tarjeta');
    expect(salida).toContain('210.00');
    expect(salida).toContain('TOTAL VENTAS (23)');
  });

  it('los renglones son los botones de la ventana de venta', () => {
    /*
     * Pedido del cliente (16/09/2026): "debe aparecer tal cual lo que se
     * selecciona en la ventana de venta". El ticket mostraba Efectivo, Yape,
     * Plin, Tarjeta y Transferencia, que no es lo que la cajera toca.
     */
    const salida = texto(construirTicketCierre(CAB, {
      ...CIERRE,
      porCuenta: [
        { etiqueta: 'EFECTIVO', monto: 803, cantidad: 12 },
        { etiqueta: 'CONTINENTAL - PLIN HAPPYS', monto: 365, cantidad: 8 },
        { etiqueta: 'BCP HAPPYS', monto: 0, cantidad: 0 },
        { etiqueta: 'YAPE (BCP HAPPYS)', monto: 0, cantidad: 0 },
        { etiqueta: 'BCP JAVIER', monto: 810, cantidad: 9 },
        { etiqueta: 'INTERBANK JAVIER', monto: 0, cantidad: 0 },
      ],
    }));
    expect(salida).toContain('CONTINENTAL - PLIN HAPPYS');
    expect(salida).toContain('BCP JAVIER');
    expect(salida).toContain('YAPE (BCP HAPPYS)');
    expect(salida).toContain('INTERBANK JAVIER');
    // Y ya no habla de medios de pago genéricos que nadie aprieta.
    expect(salida).not.toContain('Transferencia');
    expect(salida).not.toContain('Tarjeta');
  });

  it('un botón sin movimiento sale en cero, no se esconde', () => {
    const salida = texto(construirTicketCierre(CAB, {
      ...CIERRE,
      porCuenta: [{ etiqueta: 'INTERBANK JAVIER', monto: 0, cantidad: 0 }],
    }));
    expect(salida).toContain('INTERBANK JAVIER');
    expect(salida).toContain('0.00');
  });

  it('un nombre de cuenta largo no se come el importe', () => {
    // 42 columnas: si el nombre y el monto no entran juntos, el monto baja.
    const t = construirTicketCierre(CAB, {
      ...CIERRE,
      porCuenta: [{ etiqueta: 'CONTINENTAL - CUENTA CORRIENTE SOLES HAPPYS', monto: 1234.5, cantidad: 3 }],
    });
    expect(texto(t)).toContain('1234.50');
    for (const l of renglones(t)) expect(l.length).toBeLessThanOrEqual(42);
  });

  it('un cierre viejo reimpreso sigue mostrando sus totales', () => {
    // Sin el detalle por cuenta guardado, se cae a los cinco de siempre.
    const salida = texto(construirTicketCierre(CAB, CIERRE));
    expect(salida).toContain('Efectivo');
    expect(salida).toContain('850.50');
    expect(salida).toContain('TOTAL VENTAS (23)');
  });

  it('dice a qué cuenta entró cada cobro, no solo el medio de pago', () => {
    /*
     * El pedido de la vendedora (16/09/2026): el arqueo decía "Transferencia
     * S/ 1165" y hay dos bancos. Al día siguiente, quien concilia no sabía
     * cuál abrir.
     */
    const salida = texto(construirTicketCierre(CAB, {
      ...CIERRE,
      porCuenta: [
        { etiqueta: 'Efectivo', monto: 850.5, cantidad: 12 },
        { etiqueta: 'Plin · CONTINENTAL - PLIN HAPPYS', monto: 715, cantidad: 8 },
        { etiqueta: 'Transferencia · BCP JAVIER', monto: 1165, cantidad: 16 },
      ],
    }));
    expect(salida).toContain('CONTINENTAL - PLIN HAPPYS');
    expect(salida).toContain('BCP JAVIER');
    expect(salida).toContain('715.00');
    expect(salida).toContain('1165.00');
    // Cuántos cobros hubo: sirve para saber si falta uno.
    expect(salida).toContain('(8)');
    expect(salida).toContain('(16)');
  });

  it('muestra cómo se llega al efectivo esperado', () => {
    const salida = texto(construirTicketCierre(CAB, CIERRE));
    expect(salida).toContain('Monto de apertura');
    expect(salida).toContain('100.00');
    expect(salida).toContain('Gastos caja chica');
    expect(salida).toContain('43.50');
    expect(salida).toContain('947.00');
  });

  it('dice CUADRA cuando la cuenta da', () => {
    expect(texto(construirTicketCierre(CAB, CIERRE))).toContain('CUADRA');
  });

  it('dice FALTANTE con el monto cuando falta plata', () => {
    // "FALTANTE" dice en una palabra lo que un signo menos no dice.
    const salida = texto(construirTicketCierre(CAB, { ...CIERRE, contadoEfectivo: 900 }));
    expect(salida).toContain('FALTANTE');
    expect(salida).toContain('47.00');
    expect(salida).not.toContain('CUADRA');
  });

  it('dice SOBRANTE cuando sobra', () => {
    const salida = texto(construirTicketCierre(CAB, { ...CIERRE, contadoEfectivo: 960 }));
    expect(salida).toContain('SOBRANTE');
    expect(salida).toContain('13.00');
  });

  it('una diferencia de céntimos por redondeo se considera cuadrada', () => {
    const salida = texto(construirTicketCierre(CAB, { ...CIERRE, contadoEfectivo: 947.004 }));
    expect(salida).toContain('CUADRA');
  });

  it('distingue el cierre de turno del de fin de día', () => {
    expect(texto(construirTicketCierre(CAB, CIERRE))).toContain('CIERRE DE CAJA');
    const turno = texto(
      construirTicketCierre(CAB, { ...CIERRE, parcial: true, cajeroEntrante: 'Luis Vargas' }),
    );
    expect(turno).toContain('CIERRE DE TURNO');
    // A quién se le entrega la caja: es la mitad del sentido del papel.
    expect(turno).toContain('Luis Vargas');
  });

  it('incluye las observaciones que escribió la cajera', () => {
    const salida = texto(
      construirTicketCierre(CAB, { ...CIERRE, observaciones: 'Faltó vuelto de S/ 10' }),
    );
    expect(salida).toContain('Observaciones');
    expect(salida).toContain('vuelto');
  });

  it('no deja un encabezado de observaciones vacío', () => {
    expect(texto(construirTicketCierre(CAB, { ...CIERRE, observaciones: '   ' })))
      .not.toContain('Observaciones');
  });
});
