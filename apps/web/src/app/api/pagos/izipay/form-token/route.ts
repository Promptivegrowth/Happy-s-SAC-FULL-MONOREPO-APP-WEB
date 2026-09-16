/**
 * Paso 1 del cobro con tarjeta: pedirle a izipay el token del formulario.
 *
 * El navegador manda SOLO el id del pedido. El monto se lee de la base de
 * datos: es la única manera de que no se pueda cobrar un total distinto al que
 * se guardó (ver @/server/cotizar-pedido).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@happy/db/service';
import { crearFormToken, configIzipayDesdeEntorno, ErrorIzipay } from '@happy/lib/pagos/izipay';
import { aCentimos } from '@/lib/precios';

export const runtime = 'nodejs';

const schema = z.object({ pedidoId: z.string().uuid() });

type PedidoParaPagar = {
  id: string;
  numero: string;
  estado: string;
  total: number | string;
  metodo_pago_seleccionado: string | null;
  contacto_nombre: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  cliente_id: string | null;
};

export async function POST(req: Request) {
  let pedidoId: string;
  try {
    pedidoId = schema.parse(await req.json()).pedidoId;
  } catch {
    return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  }

  let cfg;
  try {
    cfg = configIzipayDesdeEntorno();
  } catch (e) {
    // Falta configuración del comercio, no es culpa del comprador: se registra
    // completo en el servidor y afuera va un mensaje que no filtra nada.
    console.error('[izipay] ' + (e as Error).message);
    return NextResponse.json(
      { error: 'El pago con tarjeta no está disponible en este momento.' },
      { status: 503 },
    );
  }

  const publicKey = process.env.IZIPAY_PUBLIC_KEY?.trim();
  if (!publicKey) {
    console.error('[izipay] falta IZIPAY_PUBLIC_KEY');
    return NextResponse.json(
      { error: 'El pago con tarjeta no está disponible en este momento.' },
      { status: 503 },
    );
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('pedidos_web')
    .select(
      'id, numero, estado, total, metodo_pago_seleccionado, contacto_nombre, ' +
        'contacto_email, contacto_telefono, cliente_id',
    )
    .eq('id', pedidoId)
    .maybeSingle();

  if (error) {
    console.error('[izipay] no se pudo leer el pedido:', error.message);
    return NextResponse.json({ error: 'No se pudo preparar el pago' }, { status: 500 });
  }
  const pedido = data as unknown as PedidoParaPagar | null;
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  // Un pedido que ya avanzó no se vuelve a cobrar. Sin esto, recargar la
  // pantalla de pago después de pagar abriría un segundo cobro por lo mismo.
  if (pedido.estado !== 'PENDIENTE_PAGO') {
    return NextResponse.json(
      {
        error:
          pedido.estado === 'CANCELADO'
            ? 'Este pedido fue cancelado.'
            : 'Este pedido ya no está pendiente de pago.',
        estado: pedido.estado,
      },
      { status: 409 },
    );
  }

  const montoCentimos = aCentimos(Number(pedido.total));
  if (!(montoCentimos > 0)) {
    return NextResponse.json({ error: 'El pedido no tiene un total válido' }, { status: 409 });
  }

  try {
    const formToken = await crearFormToken(
      {
        orderId: pedido.numero,
        montoCentimos,
        cliente: {
          email: pedido.contacto_email,
          referencia: pedido.cliente_id,
          nombre: pedido.contacto_nombre,
          telefono: pedido.contacto_telefono,
        },
      },
      cfg,
    );
    return NextResponse.json({ formToken, publicKey, numero: pedido.numero });
  } catch (e) {
    console.error('[izipay] CreatePayment falló:', (e as Error).message);
    const codigo = e instanceof ErrorIzipay ? e.codigo : 'SIN_RESPUESTA';

    /*
     * Al comprador se le habla en claro; el código de izipay va aparte, para
     * que quien tenga que arreglarlo sepa qué mirar sin entrar a los registros
     * del servidor. Es un código público: no revela nada de las claves.
     *
     * Cuidado con INT_905: dice "usuario o contraseña inválidos", pero izipay
     * también lo devuelve cuando el cobro lleva un campo que la tienda no
     * tiene habilitado. Antes de dar por mala una credencial, conviene probar
     * la misma clave con un cobro mínimo (monto, moneda y número de pedido, y
     * nada más).
     */
    const cuerpo: Record<string, unknown> = {
      error: 'No pudimos abrir el pago con tarjeta. Intenta de nuevo en un momento.',
      codigoIzipay: codigo,
    };
    return NextResponse.json(cuerpo, { status: 502 });
  }
}
