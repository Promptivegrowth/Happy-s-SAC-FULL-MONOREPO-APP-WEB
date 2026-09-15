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
