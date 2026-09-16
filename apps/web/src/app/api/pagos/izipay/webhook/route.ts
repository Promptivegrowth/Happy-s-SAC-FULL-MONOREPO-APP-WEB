/**
 * Notificación de izipay al servidor (IPN).
 *
 * Esta es la fuente de verdad del cobro. Llega de servidor a servidor, aunque
 * el comprador cierre el navegador a mitad del pago, y va firmada con la
 * CONTRASEÑA del API REST (no con la clave HMAC, que es la del retorno al
 * navegador — ver @happy/lib/pagos/izipay).
 *
 * Configurar en el Back Office de izipay:
 *   Configuración → Reglas de notificaciones → "URL de notificación al final
 *   del pago" → https://www.disfraceshappys.com.pe/api/pagos/izipay/webhook
 *
 * Sobre los códigos de respuesta: izipay REINTENTA cuando no recibe un 200.
 * Por eso solo se devuelve error en fallas transitorias (base caída); si el
 * pedido no existe se responde 200, porque reintentar no lo va a hacer
 * aparecer y la notificación quedaría rebotando para siempre.
 */

import { NextResponse } from 'next/server';
import { configIzipayDesdeEntorno, claveDeFirma, firmaValida } from '@happy/lib/pagos/izipay';
import { registrarResultadoIzipay, leerRespuesta } from '@/server/pago-izipay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const crudo = await req.text();
  const campos = new URLSearchParams(crudo);
  const krAnswer = campos.get('kr-answer');
  const krHash = campos.get('kr-hash');
  const krHashKey = campos.get('kr-hash-key') ?? '';

  if (!krAnswer || !krHash) {
    return NextResponse.json({ error: 'Notificación incompleta' }, { status: 400 });
  }

  let cfg;
  try {
    cfg = configIzipayDesdeEntorno();
  } catch (e) {
    // Sin credenciales no se puede verificar la firma. Se devuelve error a
    // propósito: izipay reintenta y el pago no se pierde mientras se carga la
    // variable que falta.
    console.error('[izipay webhook] ' + (e as Error).message);
    return NextResponse.json({ error: 'Pasarela sin configurar' }, { status: 503 });
  }

  const clave = claveDeFirma(krHashKey, cfg);
  if (!clave || !firmaValida(krAnswer, krHash, clave)) {
    // Cualquiera puede hacer POST a esta URL. Sin firma válida no se toca nada.
    console.error('[izipay webhook] firma inválida (kr-hash-key=' + krHashKey + ')');
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  try {
    const respuesta = leerRespuesta(krAnswer);
    const r = await registrarResultadoIzipay(respuesta, 'ipn');
    console.log(
      `[izipay webhook] ${r.numero ?? 's/n'} → ${respuesta.orderStatus} · ${r.mensaje}`,
    );
    // 200 aunque el pedido no exista o el pago haya sido rechazado: la
    // notificación se procesó correctamente, no hay nada que reintentar.
    return NextResponse.json({ ok: true, pedido: r.numero, estado: r.estado });
  } catch (e) {
    // Acá caen las fallas de base de datos. Devolver error hace que izipay lo
    // vuelva a mandar, que es exactamente lo que queremos.
    console.error('[izipay webhook] no se pudo procesar:', (e as Error).message);
    return NextResponse.json({ error: 'Error al procesar' }, { status: 500 });
  }
}

/**
 * Izipay verifica la URL con un GET antes de aceptarla en el Back Office; si
 * responde 404 la marca como "URL incorrecta".
 */
export function GET() {
  return NextResponse.json({ ok: true, servicio: 'izipay-ipn' });
}
