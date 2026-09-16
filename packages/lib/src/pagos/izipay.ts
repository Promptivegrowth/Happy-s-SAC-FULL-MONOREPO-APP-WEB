/**
 * Izipay — pago con tarjeta en la web.
 *
 * Izipay corre sobre la plataforma Lyra ("micuentaweb"), API REST V4. El cobro
 * tiene tres pasos y cada uno vive en un lugar distinto a propósito:
 *
 *   1. El SERVIDOR pide un `formToken` a izipay diciendo cuánto se cobra y por
 *      qué pedido. El monto sale de acá, nunca del navegador.
 *   2. El NAVEGADOR monta el formulario de tarjeta con ese token. Los datos de
 *      la tarjeta viajan de izipay al navegador y de vuelta: nunca pasan por
 *      nuestro servidor ni se guardan (por eso no nos alcanza PCI-DSS).
 *   3. Izipay avisa el resultado al SERVIDOR por su cuenta (IPN / webhook).
 *      Esa notificación es la única fuente confiable de que el pedido se pagó:
 *      lo que diga el navegador del comprador se puede falsificar.
 *
 * Las dos respuestas vienen firmadas, pero CON CLAVES DISTINTAS, y es un error
 * fácil de cometer:
 *
 *   - la notificación al servidor (IPN)  → se firma con la CONTRASEÑA REST
 *   - el retorno al navegador            → se firma con la CLAVE HMAC-SHA-256
 *
 * El propio mensaje trae el campo `kr-hash-key` diciendo cuál se usó; acá se
 * respeta ese campo en vez de adivinar (ver `claveDeFirma`).
 *
 * Credenciales en el Back Office de izipay:
 *   Configuración → Tienda → pestaña "Claves de API REST".
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Servidor REST de izipay Perú. Es el mismo para test y producción. */
export const API_IZIPAY_POR_DEFECTO = 'https://api.micuentaweb.pe';

/** Valores posibles de `kr-hash-key`: indican con qué clave se firmó. */
export const FIRMA_CON_PASSWORD = 'password';
export const FIRMA_CON_HMAC = 'sha256_hmac';

export type ConfigIzipay = {
  /** Identificador de la tienda; es también el usuario del API REST. */
  usuario: string;
  /** Contraseña del API REST. Firma la notificación al servidor (IPN). */
  password: string;
  /** Clave HMAC-SHA-256. Firma el retorno al navegador. */
  hmacKey: string;
  /** Servidor REST. */
  apiUrl: string;
};

/**
 * Arma la configuración desde las variables de entorno.
 *
 * Falla nombrando la variable que falta: un `formToken` que no se puede pedir
 * es una venta que no se puede cobrar, y el mensaje tiene que decir qué cargar.
 */
export function configIzipayDesdeEntorno(
  env: Record<string, string | undefined> = process.env,
): ConfigIzipay {
  const faltan: string[] = [];
  const usuario = env.IZIPAY_USUARIO?.trim();
  const password = env.IZIPAY_PASSWORD?.trim();
  const hmacKey = env.IZIPAY_HMAC_KEY?.trim();
  if (!usuario) faltan.push('IZIPAY_USUARIO');
  if (!password) faltan.push('IZIPAY_PASSWORD');
  if (!hmacKey) faltan.push('IZIPAY_HMAC_KEY');
  if (faltan.length > 0) {
    throw new Error(`Izipay sin configurar: falta ${faltan.join(', ')}`);
  }
  return {
    usuario: usuario as string,
    password: password as string,
    hmacKey: hmacKey as string,
    apiUrl: (env.IZIPAY_API_URL?.trim() || API_IZIPAY_POR_DEFECTO).replace(/\/+$/, ''),
  };
}

// ===========================================================================
// 1. Pedir el formToken (servidor)
// ===========================================================================

/**
 * Izipay rechazó la solicitud, y con su código de error.
 *
 * El código (por ejemplo `INT_905`, credenciales inválidas) es público y no
 * dice nada de las claves, pero es lo único que distingue "la contraseña está
 * mal cargada" de "la tienda no está habilitada" o "el monto no se acepta".
 * Sin él, cuando esto falla a las once de la noche, alguien tiene que entrar a
 * buscar los registros del servidor para enterarse de algo que el propio
 * sistema ya sabía.
 */
export class ErrorIzipay extends Error {
  constructor(
    mensaje: string,
    readonly codigo: string,
    /** Lo que izipay explica además del código, cuando explica algo. */
    readonly detalle?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorIzipay';
  }
}

export type DatosFormToken = {
  /** Referencia del pedido. Es lo que el comercio ve en el Back Office. */
  orderId: string;
  /** Monto en CÉNTIMOS de sol. S/ 123.45 → 12345. */
  montoCentimos: number;
  moneda?: string;
  cliente?: {
    email?: string | null;
    /** Identificador del comprador de nuestro lado (DNI/RUC, o el id interno). */
    referencia?: string | null;
    nombre?: string | null;
    telefono?: string | null;
  };
};

type RespuestaRest<T> = {
  status: 'SUCCESS' | 'ERROR';
  answer: T & {
    errorCode?: string;
    errorMessage?: string;
    detailedErrorMessage?: string;
    detailedErrorCode?: string;
  };
};

/**
 * Pide a izipay el token del formulario de pago.
 *
 * El token lleva adentro el monto y el pedido, firmados por izipay: el
 * navegador no puede alterarlos. Por eso el monto tiene que salir de la base
 * de datos y no de lo que mande el cliente.
 */
export async function crearFormToken(
  datos: DatosFormToken,
  cfg: ConfigIzipay,
): Promise<string> {
  if (!Number.isInteger(datos.montoCentimos) || datos.montoCentimos <= 0) {
    throw new Error(`Monto inválido para izipay: ${datos.montoCentimos} céntimos`);
  }

  const nombre = (datos.cliente?.nombre ?? '').trim();
  const corte = nombre.indexOf(' ');
  const cuerpo: Record<string, unknown> = {
    amount: datos.montoCentimos,
    currency: datos.moneda ?? 'PEN',
    orderId: datos.orderId,
    // Sin esto izipay elige el idioma por el navegador; la tienda es peruana.
    formAction: 'PAYMENT',
    customer: {
      email: datos.cliente?.email || undefined,
      reference: datos.cliente?.referencia || undefined,
      billingDetails: {
        firstName: corte > 0 ? nombre.slice(0, corte) : nombre || undefined,
        lastName: corte > 0 ? nombre.slice(corte + 1) : undefined,
        cellPhoneNumber: datos.cliente?.telefono || undefined,
        country: 'PE',
        language: 'es',
      },
    },
  };

  /*
   * NO se manda `ipnTargetUrl`.
   *
   * Existe para indicar en cada cobro a qué dirección notificar, pero es un
   * campo privilegiado: izipay lo rechaza si la tienda no tiene ese permiso
   * habilitado, y lo hace devolviendo INT_905, "usuario o contraseña
   * inválidos". O sea que un campo de más se ve exactamente igual que una
   * credencial mal cargada, y se pierde la tarde revisando las claves.
   *
   * La dirección de notificación se configura una vez en el Back Office
   * (Reglas de notificaciones → "URL de notificación al final del pago"), que
   * es donde corresponde.
   */

  const auth = Buffer.from(`${cfg.usuario}:${cfg.password}`).toString('base64');
  const res = await fetch(`${cfg.apiUrl}/api-payment/V4/Charge/CreatePayment`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });

  const json = (await res.json().catch(() => null)) as RespuestaRest<{ formToken?: string }> | null;
  if (!json) {
    throw new ErrorIzipay(`Izipay respondió algo ilegible (HTTP ${res.status})`, `HTTP_${res.status}`);
  }
  if (json.status !== 'SUCCESS' || !json.answer?.formToken) {
    const a = json.answer ?? {};
    const codigo = a.errorCode ?? `HTTP_${res.status}`;
    throw new ErrorIzipay(
      `Izipay rechazó la solicitud: ${codigo} ${a.errorMessage ?? ''} ${
        a.detailedErrorMessage ?? ''
      }`.trim(),
      codigo,
      [a.detailedErrorCode, a.detailedErrorMessage].filter(Boolean).join(' ') || undefined,
    );
  }
  return json.answer.formToken;
}

// ===========================================================================
// 2. Verificar la firma (servidor)
// ===========================================================================

/**
 * Clave con la que hay que verificar, según quién mandó el mensaje.
 *
 * El campo `kr-hash-key` viene en el propio mensaje. Se respeta en vez de
 * asumir, porque usar la clave equivocada da siempre "firma inválida" y el
 * síntoma —pagos que entran pero el pedido nunca se confirma— es difícil de
 * rastrear. Si el valor no es uno de los dos conocidos, no se acepta nada.
 */
export function claveDeFirma(krHashKey: string, cfg: ConfigIzipay): string | null {
  if (krHashKey === FIRMA_CON_PASSWORD) return cfg.password;
  if (krHashKey === FIRMA_CON_HMAC) return cfg.hmacKey;
  return null;
}

/**
 * ¿La firma corresponde al contenido?
 *
 * Se firma el texto CRUDO de `kr-answer`, tal cual llegó. Volver a serializar
 * el JSON cambia aunque sea un espacio y la firma deja de dar.
 *
 * La comparación es de tiempo constante: comparar hashes con `===` filtra,
 * carácter por carácter, cuánto acertó quien esté probando firmas.
 */
export function firmaValida(
  respuestaCruda: string,
  firmaRecibida: string,
  clave: string,
): boolean {
  const esperada = createHmac('sha256', clave).update(respuestaCruda, 'utf8').digest('hex');
  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from((firmaRecibida ?? '').trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false; // timingSafeEqual exige mismo largo
  return timingSafeEqual(a, b);
}

// ===========================================================================
// 3. Leer el resultado
// ===========================================================================

export type EstadoPedidoIzipay =
  | 'PAID'
  | 'UNPAID'
  | 'RUNNING'
  | 'PARTIALLY_PAID'
  | 'ABANDONED'
  | 'EXPIRED';

export type TransaccionIzipay = {
  uuid: string;
  amount: number;
  currency: string;
  status: string;
  detailedStatus: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  detailedErrorMessage?: string | null;
  transactionDetails?: {
    cardDetails?: {
      pan?: string;
      effectiveBrand?: string;
      installmentNumber?: number | null;
      authorizationResponse?: { authorizationNumber?: string } | null;
    } | null;
  } | null;
};

export type RespuestaIzipay = {
  orderStatus: EstadoPedidoIzipay;
  orderCycle?: string;
  serverDate?: string;
  orderDetails: {
    orderId: string | null;
    orderTotalAmount: number;
    orderCurrency: string;
  };
  customer?: { email?: string | null; reference?: string | null } | null;
  transactions: TransaccionIzipay[];
};

/** Interpreta el `kr-answer`. Llamar SOLO después de validar la firma. */
export function leerRespuesta(krAnswer: string): RespuestaIzipay {
  const r = JSON.parse(krAnswer) as RespuestaIzipay;
  if (!r || typeof r.orderStatus !== 'string') {
    throw new Error('La respuesta de izipay no tiene orderStatus');
  }
  return r;
}

/**
 * La transacción que importa de la respuesta.
 *
 * Un pedido puede traer varias: reintentos del comprador, un rechazo seguido
 * de un cobro bueno. Si alguna está pagada, esa manda; si no, la última.
 */
export function transaccionRelevante(r: RespuestaIzipay): TransaccionIzipay | null {
  const txs = r.transactions ?? [];
  if (txs.length === 0) return null;
  return txs.find((t) => t.status === 'PAID') ?? txs[txs.length - 1] ?? null;
}

/** Motivo del rechazo, en algo que se pueda leer sin ser de sistemas. */
export function motivoRechazo(t: TransaccionIzipay | null): string {
  if (!t) return 'La operación no llegó a procesarse';
  const detalle = t.detailedErrorMessage || t.errorMessage;
  if (detalle) return detalle;
  if (t.detailedStatus) return `Rechazada por el banco (${t.detailedStatus})`;
  return 'La operación fue rechazada';
}
