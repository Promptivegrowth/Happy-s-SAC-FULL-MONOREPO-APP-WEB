/**
 * Confirmación desde el formulario incrustado.
 *
 * Cuando el formulario de tarjeta vive dentro de nuestra propia página, el
 * navegador no se va a ningún lado: al terminar, izipay le entrega el
 * resultado firmado al JavaScript de la página, que lo reenvía acá.
 *
 * Que venga del navegador NO significa que haya que creerle: se verifica la
 * firma igual que en el webhook. Lo único que cambia es la clave, porque este
 * mensaje viaja por el navegador y se firma con la HMAC-SHA-256.
 *
 * Existe para que el comprador vea la confirmación al instante. La palabra
 * final la sigue teniendo la notificación al servidor.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { configIzipayDesdeEntorno, claveDeFirma, firmaValida } from '@happy/lib/pagos/izipay';
import { registrarResultadoIzipay, leerRespuesta } from '@/server/pago-izipay';

export const runtime = 'nodejs';

const schema = z.object({
  respuesta: z.string().min(2),  // rawClientAnswer, TAL CUAL: la firma es sobre este texto
  firma: z.string().min(2),      // hash
  claveUsada: z.string().min(2), // hashKey
});

export async function POST(req: Request) {
  let datos: z.infer<typeof schema>;
  try {
    datos = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Respuesta incompleta' }, { status: 400 });
  }

  let cfg;
  try {
    cfg = configIzipayDesdeEntorno();
  } catch (e) {
    console.error('[izipay confirmar] ' + (e as Error).message);
    return NextResponse.json({ error: 'Pasarela sin configurar' }, { status: 503 });
  }

  const clave = claveDeFirma(datos.claveUsada, cfg);
  if (!clave || !firmaValida(datos.respuesta, datos.firma, clave)) {
    console.error('[izipay confirmar] firma inválida (kr-hash-key=' + datos.claveUsada + ')');
    return NextResponse.json({ error: 'No pudimos validar el pago' }, { status: 401 });
  }

  try {
    const r = await registrarResultadoIzipay(leerRespuesta(datos.respuesta), 'retorno');
    return NextResponse.json({
      pagado: r.pagado,
      pedidoId: r.pedidoId,
      numero: r.numero,
      estado: r.estado,
      mensaje: r.mensaje,
    });
  } catch (e) {
    /*
     * El cobro puede haber salido bien igual —la notificación al servidor va
     * por su cuenta y confirmará el pedido—, así que no se dice "falló el
     * pago": se le pide al comprador que mire el estado de su pedido.
     */
    console.error('[izipay confirmar] no se pudo procesar:', (e as Error).message);
    return NextResponse.json(
      { error: 'Tu pago se está procesando. Revisa el estado de tu pedido en unos segundos.' },
      { status: 500 },
    );
  }
}
