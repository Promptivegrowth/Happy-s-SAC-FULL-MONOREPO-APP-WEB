/**
 * Retorno del comprador desde izipay.
 *
 * Adónde vuelve la persona cuando termina de pagar. Normalmente el formulario
 * está incrustado en nuestra página y el navegador nunca sale, pero hay casos
 * en que sí: la verificación 3-D Secure del banco abre su propia pantalla y de
 * ahí izipay devuelve al comprador acá, por POST.
 *
 * Este aviso va firmado con la CLAVE HMAC-SHA-256 (el del servidor, con la
 * contraseña REST — son distintos a propósito).
 *
 * Configurar en el Back Office de izipay, pestaña "Configuración":
 *   URL de retorno de la tienda en modo test / en modo producción →
 *   https://www.disfraceshappys.com.pe/api/pagos/izipay/retorno
 *
 * Aunque el pedido también se confirma por la notificación al servidor, acá se
 * registra igual: el IPN puede demorar unos segundos y el comprador estaría
 * mirando su pedido todavía "pendiente de pago" justo después de pagarlo.
 */

import { NextResponse } from 'next/server';
import { configIzipayDesdeEntorno, claveDeFirma, firmaValida } from '@happy/lib/pagos/izipay';
import { registrarResultadoIzipay, leerRespuesta } from '@/server/pago-izipay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Adónde mandar al comprador. Siempre a una página nuestra, nunca a izipay. */
function destino(req: Request, ruta: string) {
  const base = process.env.NEXT_PUBLIC_WEB_URL?.trim() || new URL(req.url).origin;
  return new URL(ruta, base.endsWith('/') ? base : base + '/').toString();
}

async function manejar(req: Request, campos: URLSearchParams) {
  const krAnswer = campos.get('kr-answer');
  const krHash = campos.get('kr-hash');
  const krHashKey = campos.get('kr-hash-key') ?? '';

  if (!krAnswer || !krHash) {
    // Alguien entró a la URL a mano. No es un error que valga la pena mostrar.
    return NextResponse.redirect(destino(req, 'carrito'), 303);
  }

  try {
    const cfg = configIzipayDesdeEntorno();
    const clave = claveDeFirma(krHashKey, cfg);
    if (!clave || !firmaValida(krAnswer, krHash, clave)) {
      console.error('[izipay retorno] firma inválida (kr-hash-key=' + krHashKey + ')');
      return NextResponse.redirect(destino(req, 'carrito?pago=invalido'), 303);
    }

    const respuesta = leerRespuesta(krAnswer);
    const r = await registrarResultadoIzipay(respuesta, 'retorno');
    if (r.pedidoId) {
      return NextResponse.redirect(destino(req, `pedido/${r.pedidoId}`), 303);
    }
    return NextResponse.redirect(destino(req, 'carrito?pago=sin-pedido'), 303);
  } catch (e) {
    /*
     * Si acá falla algo, el cobro puede haber salido bien igual: la
     * notificación al servidor va por su cuenta y confirmará el pedido. Por eso
     * NO se le dice al comprador que el pago falló — se lo manda a su pedido a
     * ver el estado real.
     */
    console.error('[izipay retorno] no se pudo procesar:', (e as Error).message);
    return NextResponse.redirect(destino(req, 'cuenta?pago=revisar'), 303);
  }
}

export async function POST(req: Request) {
  return manejar(req, new URLSearchParams(await req.text()));
}

export async function GET(req: Request) {
  return manejar(req, new URL(req.url).searchParams);
}
