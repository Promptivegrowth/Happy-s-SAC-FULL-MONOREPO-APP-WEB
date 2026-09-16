/**
 * Pruebas del ticket ESC/POS.
 *
 * Se verifica sobre los BYTES que se le van a mandar a la ticketera, que es lo
 * único que importa: un ticket que se ve bien en pantalla y sale mal del papel
 * no sirve. Se comprueban los comandos que deciden formato y corte, la
 * codificación de los acentos y que esté todo lo que SUNAT exige.
 */

import { describe, it, expect } from 'vitest';
import { TicketEscPos, aCP850, envolver, COLUMNAS, PUNTO_MM } from './index';
import { construirTicket, cadenaQrSunat, type DatosTicket } from './ticket-comprobante';
import { construirTicketPrueba } from './ticket-prueba';

/** Los bytes como texto latin1, para poder buscar cadenas dentro. */
function texto(t: TicketEscPos): string {
  return Buffer.from(t.aBytes()).toString('latin1');
}

function bytes(t: TicketEscPos): number[] {
  return Array.from(t.aBytes());
}

/** Busca una secuencia de bytes dentro del ticket. */
function contiene(t: TicketEscPos, secuencia: number[]): boolean {
  const b = bytes(t);
  for (let i = 0; i + secuencia.length <= b.length; i++) {
    if (secuencia.every((x, k) => b[i + k] === x)) return true;
  }
  return false;
}

const BASE: DatosTicket = {
  empresa: {
    razon_social: "HAPPY'S S.A.C.",
    nombre_comercial: 'DISFRACES HAPPYS',
    ruc: '20603133545',
    direccion_fiscal: 'JR. HUALLAGA NRO. 726 INT. 150 URB. LIMA',
    telefono: '51916856842',
  },
  establecimiento: { nombre: 'TIENDA HUALLAGA', direccion: 'JR. HUALLAGA 726 INT. 150 - LIMA' },
  comprobante: {
    tipo: 'BOLETA',
    numero_completo: 'B006-0000758',
    fecha: '2026-09-15T20:30:00.000Z',
    igv_porcentaje: 18,
    moneda: 'PEN',
    hash: 'x1Y2z3A4b5C6d7E8f9G0hIjKlMn=',
  },
  cliente: { tipo_documento: 'DNI', numero_documento: '45678912', nombre_o_razon_social: 'MARÍA PIÑÓN QUISPE' },
  items: [
    { descripcion: 'disfraz de Abejita para niña talla 6', cantidad: 2, precio_unitario: 35, importe: 70 },
    { descripcion: 'Peluca afro', cantidad: 1, precio_unitario: 15.5, importe: 15.5 },
  ],
  totales: { gravado: 72.46, igv: 13.04, total: 85.5 },
  pagos: [{ metodo: 'Efectivo', monto: 100 }],
  vuelto: 14.5,
  vendedor: 'Rosa Quispe',
  caja: 'CAJA HUALLAGA 01',
  total_letras: 'OCHENTA Y CINCO CON 50/100 SOLES',
};

describe('codificación de caracteres', () => {
  it('convierte los acentos y la eñe a la página de códigos 850', () => {
    // Sin esto la impresora recibe UTF-8 (dos bytes) donde espera uno y escribe
    // símbolos sueltos en lugar de la letra.
    expect(aCP850('ñ')).toEqual([0xa4]);
    expect(aCP850('Ñ')).toEqual([0xa5]);
    expect(aCP850('á')).toEqual([0xa0]);
    expect(aCP850('é')).toEqual([0x82]);
    expect(aCP850('í')).toEqual([0xa1]);
    expect(aCP850('ó')).toEqual([0xa2]);
    expect(aCP850('ú')).toEqual([0xa3]);
    expect(aCP850('¿')).toEqual([0xa8]);
    expect(aCP850('¡')).toEqual([0xad]);
    expect(aCP850('°')).toEqual([0xf8]);
  });

  it('cada carácter ocupa exactamente un byte', () => {
    // Si alguno ocupara dos, todas las columnas del ticket se correrían.
    expect(aCP850('PIÑÓN')).toHaveLength(5);
    expect(aCP850('Señor Ñandú')).toHaveLength('Señor Ñandú'.length);
  });

  it('degrada a texto sin acento lo que no está en la tabla', () => {
    // Preferible "a" a un símbolo raro en medio del nombre del cliente.
    expect(aCP850('ā').every((b) => b < 0x80)).toBe(true);
    expect(Buffer.from(aCP850('“comillas”')).toString('latin1')).toBe('"comillas"');
    expect(Buffer.from(aCP850('guión–largo')).toString('latin1')).toBe('gui\xa2n-largo');
  });
});

describe('formato de renglones', () => {
  it('parte el texto sin cortar palabras', () => {
    expect(envolver('disfraz de Abejita para niña', 20)).toEqual(['disfraz de Abejita', 'para niña']);
  });

  it('parte las palabras más largas que el renglón', () => {
    expect(envolver('ABCDEFGHIJKLMNO', 5)).toEqual(['ABCDE', 'FGHIJ', 'KLMNO']);
  });

  it('pega el importe al borde derecho', () => {
    const t = new TicketEscPos();
    t.lineaDoble('TOTAL', 'S/ 85.50');
    // Se quitan los bytes de comando (el ESC @ y el ESC t del arranque) para
    // medir solo lo que se imprime en el papel.
    const l = texto(t)
      .split('\n')
      .find((x) => x.includes('TOTAL'))!
      .replace(/\u001b./g, '')
      .replace(/\u0002/, '');
    expect(l).toHaveLength(COLUMNAS);
    expect(l.endsWith('S/ 85.50')).toBe(true);
    expect(l.startsWith('TOTAL ')).toBe(true);
  });

  it('ninguna línea del ticket pasa el ancho del papel', () => {
    // Una línea más larga la parte la impresora por donde le toque, y la
    // columna de importes queda bailando.
    const t = construirTicket(BASE);
    const lineas = texto(t).split('\n');
    // Se descartan las que llevan comandos (QR, imagen): no son texto visible.
    const soloTexto = lineas.filter((l) => !/[\x00-\x09\x0b-\x1f]/.test(l));
    for (const l of soloTexto) expect(l.length).toBeLessThanOrEqual(COLUMNAS);
  });
});

describe('comandos de la impresora', () => {
  it('arranca inicializando y fijando la página de códigos', () => {
    const b = bytes(new TicketEscPos());
    expect(b.slice(0, 3)).toEqual([0x1b, 0x40, 0x1b]);   // ESC @ y luego ESC t
    expect(b.slice(3, 5)).toEqual([0x74, 0x02]);          // CP850
  });

  it('termina cortando el papel', () => {
    const t = construirTicket(BASE);
    const b = bytes(t);
    // GS V B n como últimos cuatro bytes: nada se imprime después del corte.
    expect(b.slice(-4, -1)).toEqual([0x1d, 0x56, 0x42]);
  });

  it('el avance antes de cortar es el que se pide, en puntos', () => {
    const b = bytes(construirTicket(BASE, { avanceCorteMm: 20 }));
    const esperado = Math.round(20 / PUNTO_MM);
    expect(b[b.length - 1]).toBe(Math.min(255, esperado));
  });

  it('respeta el rango razonable de avance', () => {
    // Por debajo de 5 mm la cuchilla corta texto; por encima de 40 se regala papel.
    const corto = bytes(construirTicket(BASE, { avanceCorteMm: 0 }));
    const largo = bytes(construirTicket(BASE, { avanceCorteMm: 999 }));
    expect(corto[corto.length - 1]).toBe(Math.round(5 / PUNTO_MM));
    expect(largo[largo.length - 1]).toBe(Math.min(255, Math.round(40 / PUNTO_MM)));
  });

  it('no deja renglones en blanco de relleno antes del corte', () => {
    // El papel sobrante era justo el problema a resolver: lo único que puede
    // ir entre el último texto y el corte es el avance hasta la cuchilla.
    const b = bytes(construirTicket(BASE));
    const sinCorte = b.slice(0, -4);
    let saltos = 0;
    for (let i = sinCorte.length - 1; i >= 0 && sinCorte[i] === 0x0a; i--) saltos++;
    expect(saltos).toBeLessThanOrEqual(1);
  });

  it('manda el QR con el comando nativo, no como imagen', () => {
    // GS ( k ... 1P0 = cargar los datos del QR.
    expect(contiene(construirTicket(BASE), [0x1d, 0x28, 0x6b])).toBe(true);
  });

  it('abre el cajón solo si se pide', () => {
    const pulso = [0x1b, 0x70, 0x00];
    expect(contiene(construirTicket(BASE, { abrirCajon: true }), pulso)).toBe(true);
    expect(contiene(construirTicket(BASE), pulso)).toBe(false);
  });
});

describe('estructura exigida por SUNAT', () => {
  const t = construirTicket(BASE);
  const s = texto(t);

  it('lleva la denominación completa del comprobante', () => {
    expect(s).toContain('BOLETA DE VENTA ELECTR');
  });

  it('lleva serie y correlativo', () => {
    expect(s).toContain('B006-0000758');
  });

  it('lleva el RUC y la razón social del emisor', () => {
    expect(s).toContain('20603133545');
    expect(s).toContain("HAPPY'S S.A.C.");
  });

  it('usa la dirección del ESTABLECIMIENTO donde se emite', () => {
    // Es lo que pide SUNAT cuando la tienda no está en el domicilio fiscal.
    expect(s).toContain('JR. HUALLAGA 726 INT. 150 - LIMA');
    expect(s).toContain('Domicilio fiscal');
  });

  it('no repite la dirección cuando el establecimiento es el domicilio fiscal', () => {
    const misma = 'JR. HUALLAGA NRO. 726';
    const t2 = construirTicket({
      ...BASE,
      empresa: { ...BASE.empresa, direccion_fiscal: misma },
      establecimiento: { nombre: null, direccion: misma },
    });
    expect(texto(t2).split(misma).length - 1).toBe(1);
  });

  it('lleva fecha y hora de emisión en hora de Perú', () => {
    // 20:30 UTC del 15/09 son las 15:30 del 15/09 en Lima.
    expect(s).toContain('15/09/2026');
    expect(s).toContain('15:30');
  });

  it('identifica al adquirente', () => {
    expect(s).toContain('DNI: 45678912');
    expect(s).toContain('MAR');   // el nombre va con acentos codificados
  });

  it('detalla cantidad, descripción, precio unitario e importe', () => {
    expect(s).toContain('Abejita');
    expect(s).toContain('2 x 35.00');
    expect(s).toContain('70.00');
  });

  it('desglosa operación gravada e IGV con su tasa', () => {
    expect(s).toContain('Op. gravada');
    expect(s).toContain('72.46');
    expect(s).toContain('IGV (18%)');
    expect(s).toContain('13.04');
  });

  it('lleva el importe total', () => {
    expect(s).toContain('TOTAL');
    expect(s).toContain('85.50');
  });

  it('lleva el importe total EN LETRAS', () => {
    expect(s).toContain('SON: OCHENTA Y CINCO CON 50/100 SOLES');
  });

  it('lleva el resumen (hash) del comprobante firmado', () => {
    expect(s).toContain('x1Y2z3A4b5C6d7E8f9G0hIjKlMn=');
  });

  it('lleva la leyenda de representación impresa', () => {
    expect(s).toContain('impresa');
    expect(s).toContain('sunat.gob.pe');
  });

  it('arma la cadena del QR en el orden que define SUNAT', () => {
    expect(cadenaQrSunat(BASE)).toBe('20603133545|03|B006|0000758|13.04|85.50|2026-09-15|1|45678912');
  });

  it('el QR usa la fecha de Perú, no la UTC', () => {
    // Una venta de las 8 de la noche en Lima cae al día siguiente en UTC: si se
    // usara esa fecha, el QR no cuadraría con el comprobante declarado.
    const nocturna = { ...BASE, comprobante: { ...BASE.comprobante, fecha: '2026-09-16T02:00:00.000Z' } };
    expect(cadenaQrSunat(nocturna)).toContain('|2026-09-15|');
  });
});

describe('nota de venta', () => {
  const t = construirTicket({
    ...BASE,
    comprobante: { ...BASE.comprobante, tipo: 'NOTA_VENTA', numero_completo: 'NV01-0000123', hash: null },
  });
  const s = texto(t);

  it('avisa que no es comprobante de pago', () => {
    expect(s).toContain('DOCUMENTO INTERNO');
    expect(s).toContain('No es comprobante de pago');
  });

  it('no lleva QR ni leyenda de SUNAT, para que nadie la confunda', () => {
    expect(contiene(t, [0x1d, 0x28, 0x6b])).toBe(false);
    expect(s).not.toContain('sunat.gob.pe');
  });
});

describe('tamaño del ticket', () => {
  it('pesa un par de kilobytes, no cien', () => {
    // La alternativa era mandarlo como imagen: ~100 KB por ticket, que en una
    // caja con internet lento se nota al cobrar. Un ticket de dos ítems con QR
    // y hash ronda los 1,3 KB.
    expect(construirTicket(BASE).aBytes().length).toBeLessThan(2048);
  });

  it('el base64 viaja sin caracteres raros', () => {
    expect(construirTicket(BASE).aBase64()).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('ticket de prueba de la impresora', () => {
  const t = construirTicketPrueba({
    empresa: 'DISFRACES HAPPYS',
    equipo: 'Caja Huallaga',
    caja: 'CAJA HUALLAGA 01',
    cajero: 'Rosa Quispe',
    fechaHora: '15/09/2026 15:30',
    avanceCorteMm: 18,
    muestras: [{ codigo: 'PR113', nombre: 'Abejita', talla: '6' }],
  });
  const s = texto(t);

  it('avisa que no es comprobante', () => {
    expect(s).toContain('No es comprobante de pago');
    expect(s).toContain('No se registra ninguna venta');
  });

  it('la regla mide exactamente el ancho del papel', () => {
    // Si el rollo o el driver están configurados más angostos, esta línea se
    // parte en dos y se ve al instante.
    const regla = s.split('\n').find((l) => /^-+\d/.test(l))!;
    expect(regla).toHaveLength(COLUMNAS);
  });

  it('el bloque negro sale como bloques y no como interrogaciones', () => {
    // El carácter █ no es ASCII: si no estuviera en la tabla CP850, la barra de
    // densidad saldría impresa como "??????" y la prueba no serviría de nada.
    const bloque = String.fromCharCode(0xdb).repeat(COLUMNAS);
    expect(s).toContain(bloque);
    expect(s).not.toContain('?'.repeat(10));
  });

  it('imprime el avance de corte que se está probando', () => {
    // Va en el papel a propósito: al calibrar se imprimen varios y hay que
    // poder saber cuál salió de qué valor.
    expect(s).toContain('Avance configurado: 18 mm');
  });

  it('usa el avance indicado al cortar', () => {
    const b = bytes(t);
    expect(b[b.length - 1]).toBe(Math.round(18 / PUNTO_MM));
  });

  it('manda el código de barras con el comando nativo', () => {
    // GS k 73 = CODE 128 con longitud explícita.
    expect(contiene(t, [0x1d, 0x6b, 73])).toBe(true);
  });

  it('funciona sin códigos para la pistola', () => {
    const sinMuestras = construirTicketPrueba({
      empresa: 'X', equipo: 'Y', fechaHora: '1/1/2026', avanceCorteMm: 15,
    });
    expect(texto(sinMuestras)).toContain('TICKET DE PRUEBA');
    expect(contiene(sinMuestras, [0x1d, 0x6b, 73])).toBe(false);
  });
});

describe('caja y vendedor en el ticket', () => {
  it('imprime la caja del turno y quién atendió', () => {
    // El cajero puede abrir un turno en una caja distinta a la suya —cubriendo
    // otra tienda—, así que estos dos datos tienen que salir del turno abierto
    // y no de la configuración del usuario.
    const s = texto(construirTicket({ ...BASE, caja: 'CAJA HUALLAGA 01', vendedor: 'Rosa Quispe' }));
    expect(s).toContain('Caja: CAJA HUALLAGA 01');
    expect(s).toContain('Atendido por: Rosa Quispe');
  });

  it('imprime la vendedora elegida, no la cajera, cuando se eligió una', () => {
    // En Wayaga varias vendedoras comparten la caja: en el ticket tiene que
    // figurar la que hizo la venta, que es de quien es la comisión.
    const s = texto(construirTicket({ ...BASE, vendedor: 'Milagros Ponce', caja: 'CAJA LA QUINTA 01' }));
    expect(s).toContain('Atendido por: Milagros Ponce');
    expect(s).not.toContain('Rosa Quispe');
  });

  it('el establecimiento del ticket es el de la tienda del turno', () => {
    // Si se abre turno en La Quinta, el comprobante tiene que llevar la
    // dirección de La Quinta: SUNAT pide la del establecimiento emisor.
    const s = texto(construirTicket({
      ...BASE,
      establecimiento: { nombre: 'TIENDA LA QUINTA', direccion: 'AV. LA QUINTA 123 - LIMA' },
    }));
    expect(s).toContain('TIENDA LA QUINTA');
    expect(s).toContain('AV. LA QUINTA 123 - LIMA');
    expect(s).not.toContain('JR. HUALLAGA 726');
  });

  it('sin caja en el turno no imprime una línea vacía', () => {
    const s = texto(construirTicket({ ...BASE, caja: null }));
    expect(s).not.toContain('Caja:');
    expect(s).toContain('Atendido por:');
  });
});

describe('a qué cuenta se pagó', () => {
  /*
   * El pedido que originó esto (16/09/2026): "al vender, el voucher no muestra
   * a qué cuenta se pagó —BCP Javier, Continental—, solo dice efectivo o
   * transferencia". La vendedora lo necesita en la mano: cuando el cliente
   * dice "ya te yapié", hay que poder mirar el papel y ver a qué número entró.
   */
  it('imprime la cuenta debajo del medio de pago', () => {
    const s = texto(construirTicket({
      ...BASE,
      pagos: [{ metodo: 'TRANSFERENCIA', monto: 100, referencia: 'BCP JAVIER' }],
    }));
    expect(s).toContain('Transferencia');
    expect(s).toContain('BCP JAVIER');
  });

  it('distingue dos cobros del mismo medio a cuentas distintas', () => {
    const s = texto(construirTicket({
      ...BASE,
      pagos: [
        { metodo: 'PLIN', monto: 60, referencia: 'CONTINENTAL - PLIN HAPPYS' },
        { metodo: 'PLIN', monto: 40, referencia: 'BCP HAPPYS' },
      ],
    }));
    expect(s).toContain('CONTINENTAL - PLIN HAPPYS');
    expect(s).toContain('BCP HAPPYS');
  });

  it('el efectivo no repite la palabra dos veces', () => {
    // Así viene de la base: el método y la referencia dicen lo mismo.
    const s = texto(construirTicket({
      ...BASE,
      pagos: [{ metodo: 'EFECTIVO', monto: 100, referencia: 'EFECTIVO' }],
    }));
    expect((s.match(/Efectivo/g) ?? []).length).toBe(1);
    expect(s).not.toContain('EFECTIVO\n');
  });

  it('un pago sin cuenta sale como siempre, sin renglón de más', () => {
    const s = texto(construirTicket({
      ...BASE,
      pagos: [{ metodo: 'YAPE', monto: 100 }],
    }));
    expect(s).toContain('Yape');
  });

  it('el nombre de la cuenta no desborda el ancho del papel', () => {
    const t = construirTicket({
      ...BASE,
      pagos: [{
        metodo: 'TRANSFERENCIA',
        monto: 100,
        referencia: 'CONTINENTAL - CUENTA CORRIENTE SOLES HAPPYS SAC 0011-0814',
      }],
    });
    const soloTexto = texto(t)
      .split('\n')
      .filter((l) => !/[\x00-\x09\x0b-\x1f]/.test(l));
    for (const l of soloTexto) expect(l.length).toBeLessThanOrEqual(COLUMNAS);
    // Y el nombre largo se ve entero, repartido en renglones.
    expect(texto(t)).toContain('CONTINENTAL');
    expect(texto(t)).toContain('0011-0814');
  });
});
