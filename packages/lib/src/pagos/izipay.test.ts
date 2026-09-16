/**
 * Verificación de las firmas de izipay.
 *
 * Es lo único que separa un cobro real de alguien haciendo POST a nuestra URL
 * de notificación diciendo "este pedido está pagado". Si esto se afloja, la
 * tienda despacha mercadería contra pagos que no existen, y no se nota hasta
 * que alguien cruza la caja con el Back Office.
 *
 * Las claves de acá son inventadas: lo que se prueba es el mecanismo.
 */

import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  claveDeFirma,
  configIzipayDesdeEntorno,
  firmaValida,
  leerRespuesta,
  motivoRechazo,
  transaccionRelevante,
  FIRMA_CON_HMAC,
  FIRMA_CON_PASSWORD,
  API_IZIPAY_POR_DEFECTO,
  type ConfigIzipay,
  type RespuestaIzipay,
} from './izipay';

const CFG: ConfigIzipay = {
  usuario: '12345678',
  password: 'testpassword_lacontrasenadelapi',
  hmacKey: 'laclavehmacsha256delatienda',
  apiUrl: API_IZIPAY_POR_DEFECTO,
};

const RESPUESTA = JSON.stringify({
  orderStatus: 'PAID',
  orderDetails: { orderId: 'PW-260915-0001', orderTotalAmount: 24000, orderCurrency: 'PEN' },
  transactions: [
    {
      uuid: 'tx-1',
      amount: 24000,
      currency: 'PEN',
      status: 'PAID',
      detailedStatus: 'AUTHORISED',
      transactionDetails: {
        cardDetails: {
          pan: '497010XXXXXX0055',
          effectiveBrand: 'VISA',
          authorizationResponse: { authorizationNumber: '3fd452' },
        },
      },
    },
  ],
});

const firmar = (texto: string, clave: string) =>
  createHmac('sha256', clave).update(texto, 'utf8').digest('hex');

describe('qué clave corresponde a cada aviso', () => {
  it('la notificación al servidor se verifica con la contraseña del API', () => {
    expect(claveDeFirma(FIRMA_CON_PASSWORD, CFG)).toBe(CFG.password);
  });

  it('el retorno del navegador se verifica con la clave HMAC', () => {
    expect(claveDeFirma(FIRMA_CON_HMAC, CFG)).toBe(CFG.hmacKey);
  });

  it('un origen desconocido no habilita ninguna clave', () => {
    // Si izipay cambiara el valor, es preferible rechazar todo a verificar con
    // la clave equivocada y dar por bueno lo que no corresponde.
    expect(claveDeFirma('otra_cosa', CFG)).toBeNull();
    expect(claveDeFirma('', CFG)).toBeNull();
  });
});

describe('verificación de la firma', () => {
  it('acepta un aviso legítimo', () => {
    expect(firmaValida(RESPUESTA, firmar(RESPUESTA, CFG.password), CFG.password)).toBe(true);
  });

  it('acepta la firma en mayúsculas', () => {
    // Nadie garantiza el caso del hexadecimal.
    const f = firmar(RESPUESTA, CFG.password).toUpperCase();
    expect(firmaValida(RESPUESTA, f, CFG.password)).toBe(true);
  });

  it('rechaza si cambian el monto después de firmado', () => {
    const f = firmar(RESPUESTA, CFG.password);
    const alterada = RESPUESTA.replace('24000', '100');
    expect(firmaValida(alterada, f, CFG.password)).toBe(false);
  });

  it('rechaza si cambian el número de pedido', () => {
    const f = firmar(RESPUESTA, CFG.password);
    const alterada = RESPUESTA.replace('PW-260915-0001', 'PW-260915-0002');
    expect(firmaValida(alterada, f, CFG.password)).toBe(false);
  });

  it('rechaza una firma hecha con la otra clave', () => {
    // El error más fácil de cometer: las dos claves existen y las dos son
    // válidas, pero cada una para su propio camino.
    const f = firmar(RESPUESTA, CFG.hmacKey);
    expect(firmaValida(RESPUESTA, f, CFG.password)).toBe(false);
  });

  it('rechaza firmas vacías, inventadas o recortadas sin reventar', () => {
    const f = firmar(RESPUESTA, CFG.password);
    expect(firmaValida(RESPUESTA, '', CFG.password)).toBe(false);
    expect(firmaValida(RESPUESTA, 'a'.repeat(64), CFG.password)).toBe(false);
    expect(firmaValida(RESPUESTA, f.slice(0, 40), CFG.password)).toBe(false);
    expect(firmaValida(RESPUESTA, f + '00', CFG.password)).toBe(false);
  });
});

describe('configuración desde el entorno', () => {
  const base = {
    IZIPAY_USUARIO: '12345678',
    IZIPAY_PASSWORD: 'p',
    IZIPAY_HMAC_KEY: 'h',
  };

  it('dice exactamente qué variable falta', () => {
    // Un formToken que no se puede pedir es una venta que no se puede cobrar:
    // el mensaje tiene que decir qué cargar, no "error de configuración".
    expect(() => configIzipayDesdeEntorno({ ...base, IZIPAY_PASSWORD: undefined }))
      .toThrow(/IZIPAY_PASSWORD/);
    expect(() => configIzipayDesdeEntorno({})).toThrow(/IZIPAY_USUARIO.*IZIPAY_PASSWORD.*IZIPAY_HMAC_KEY/);
  });

  it('usa el servidor de izipay por defecto y le saca la barra final', () => {
    expect(configIzipayDesdeEntorno(base).apiUrl).toBe(API_IZIPAY_POR_DEFECTO);
    expect(configIzipayDesdeEntorno({ ...base, IZIPAY_API_URL: 'https://otro.pe/' }).apiUrl)
      .toBe('https://otro.pe');
  });
});

describe('lectura del resultado', () => {
  it('saca el pedido, el monto y la tarjeta', () => {
    const r = leerRespuesta(RESPUESTA);
    expect(r.orderDetails.orderId).toBe('PW-260915-0001');
    expect(r.orderDetails.orderTotalAmount).toBe(24000);
    expect(transaccionRelevante(r)?.transactionDetails?.cardDetails?.effectiveBrand).toBe('VISA');
  });

  it('con varios intentos se queda con el pagado, no con el último', () => {
    // El comprador puede haber errado la tarjeta antes de acertar; el cobro
    // bueno no siempre es el último de la lista.
    const r: RespuestaIzipay = {
      orderStatus: 'PAID',
      orderDetails: { orderId: 'x', orderTotalAmount: 100, orderCurrency: 'PEN' },
      transactions: [
        { uuid: 'mala', amount: 100, currency: 'PEN', status: 'UNPAID', detailedStatus: 'REFUSED' },
        { uuid: 'buena', amount: 100, currency: 'PEN', status: 'PAID', detailedStatus: 'AUTHORISED' },
        { uuid: 'otra-mala', amount: 100, currency: 'PEN', status: 'UNPAID', detailedStatus: 'REFUSED' },
      ],
    };
    expect(transaccionRelevante(r)?.uuid).toBe('buena');
  });

  it('sin transacciones no inventa una', () => {
    const r = { ...leerRespuesta(RESPUESTA), transactions: [] };
    expect(transaccionRelevante(r)).toBeNull();
  });

  it('no acepta una respuesta sin orderStatus', () => {
    expect(() => leerRespuesta('{"orderDetails":{}}')).toThrow(/orderStatus/);
  });

  it('el motivo del rechazo siempre dice algo legible', () => {
    expect(motivoRechazo(null)).toMatch(/\w/);
    expect(motivoRechazo({
      uuid: 'x', amount: 1, currency: 'PEN', status: 'UNPAID', detailedStatus: 'REFUSED',
    })).toContain('REFUSED');
    expect(motivoRechazo({
      uuid: 'x', amount: 1, currency: 'PEN', status: 'UNPAID', detailedStatus: 'REFUSED',
      detailedErrorMessage: 'Fondos insuficientes',
    })).toBe('Fondos insuficientes');
  });
});
