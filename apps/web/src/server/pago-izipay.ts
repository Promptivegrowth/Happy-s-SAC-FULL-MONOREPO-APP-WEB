/**
 * Registra el resultado de un cobro con tarjeta y, si corresponde, da el
 * pedido por pagado.
 *
 * Lo llaman dos rutas distintas —la notificación al servidor (IPN) y el
 * retorno del navegador— porque izipay avisa por los dos caminos y no hay
 * garantía de cuál llega primero, ni de que lleguen los dos. Ambos vienen
 * firmados por izipay; la firma ya se verificó antes de llegar acá.
 *
 * Por eso todo lo de abajo tiene que poder correr varias veces sobre el mismo
 * cobro sin duplicarlo ni descontar stock dos veces.
 */

import { createServiceClient } from '@happy/db/service';
import {
  leerRespuesta,
  transaccionRelevante,
  motivoRechazo,
  type RespuestaIzipay,
} from '@happy/lib/pagos/izipay';
import { aCentimos } from '@/lib/precios';

export type ResultadoRegistro = {
  pedidoId: string | null;
  numero: string | null;
  /** Estado del pedido DESPUÉS de procesar. */
  estado: string | null;
  pagado: boolean;
  mensaje: string;
};

type PedidoFila = {
  id: string;
  numero: string;
  estado: string;
  total: number | string;
  notas_internas: string | null;
};

export { leerRespuesta };
export type { RespuestaIzipay };

export async function registrarResultadoIzipay(
  r: RespuestaIzipay,
  origen: 'ipn' | 'retorno',
): Promise<ResultadoRegistro> {
  const numero = r.orderDetails?.orderId ?? null;
  if (!numero) {
    return { pedidoId: null, numero: null, estado: null, pagado: false, mensaje: 'La respuesta de izipay no trae el número de pedido' };
  }

  const sb = createServiceClient();
  const { data, error } = await sb
    .from('pedidos_web')
    .select('id, numero, estado, total, notas_internas')
    .eq('numero', numero)
    .maybeSingle();

  if (error) throw new Error(`No se pudo leer el pedido ${numero}: ${error.message}`);
  const pedido = data as unknown as PedidoFila | null;
  if (!pedido) {
    // Pasa si se borró el pedido o si la notificación es de otra instalación
    // apuntando a la misma URL. No se inventa nada: queda en el log.
    return { pedidoId: null, numero, estado: null, pagado: false, mensaje: `Pedido ${numero} no existe` };
  }

  const tx = transaccionRelevante(r);
  const pagadoEnIzipay = r.orderStatus === 'PAID';

  /*
   * El monto que izipay dice haber cobrado tiene que ser el del pedido.
   *
   * Si no coincide, algo se salió del libreto —un formToken viejo, un pedido
   * editado después de generarlo, o alguien jugando con la API— y marcar el
   * pedido como pagado despacharía mercadería contra un cobro que no cuadra.
   * Se registra el pago con lo que realmente entró, pero el pedido NO avanza:
   * queda con una nota para que alguien lo mire.
   */
  const esperado = aCentimos(Number(pedido.total));
  const cobrado = Number(r.orderDetails?.orderTotalAmount ?? 0);
  const montoCuadra = cobrado === esperado;

  const montoSoles = Number((cobrado / 100).toFixed(2));
  const estadoPago = pagadoEnIzipay ? (montoCuadra ? 'CONFIRMADO' : 'PENDIENTE') : 'RECHAZADO';

  const tarjeta = tx?.transactionDetails?.cardDetails;
  const referencia = [
    tarjeta?.effectiveBrand,
    tarjeta?.pan,
    tarjeta?.authorizationResponse?.authorizationNumber
      ? `aut. ${tarjeta.authorizationResponse.authorizationNumber}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ') || null;

  if (tx?.uuid) {
    // Upsert sobre el índice único de la migración 95: si el otro camino ya
    // registró este mismo cobro, se actualiza esa fila en vez de duplicarla.
    // Cast pragmático: el aviso completo va a un jsonb y los tipos
    // autogenerados no aceptan un objeto arbitrario ahí.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tablaPagos = sb.from('pedidos_web_pagos') as any;
    const { error: errPago } = await tablaPagos.upsert(
      {
        pedido_id: pedido.id,
        metodo: 'TARJETA_CREDITO',
        monto: montoSoles,
        estado: estadoPago,
        referencia,
        izipay_transaction_id: tx.uuid,
        webhook_payload: r,
        verificado_en: pagadoEnIzipay ? new Date().toISOString() : null,
      },
      { onConflict: 'izipay_transaction_id' },
    );
    if (errPago) throw new Error(`No se pudo registrar el pago de ${numero}: ${errPago.message}`);
  }

  if (!pagadoEnIzipay) {
    return {
      pedidoId: pedido.id,
      numero,
      estado: pedido.estado,
      pagado: false,
      mensaje: motivoRechazo(tx),
    };
  }

  if (!montoCuadra) {
    const aviso =
      `[${new Date().toISOString()}] ATENCIÓN: izipay cobró S/ ${montoSoles.toFixed(2)} ` +
      `pero el pedido es de S/ ${Number(pedido.total).toFixed(2)}. ` +
      `Transacción ${tx?.uuid ?? 's/n'} (aviso por ${origen}). ` +
      'El pedido NO se dio por pagado: revisar antes de despachar.';
    await sb
      .from('pedidos_web')
      .update({ notas_internas: [pedido.notas_internas, aviso].filter(Boolean).join('\n') })
      .eq('id', pedido.id);
    console.error('[izipay] monto no coincide en', numero, '→', cobrado, 'vs', esperado);
    return {
      pedidoId: pedido.id,
      numero,
      estado: pedido.estado,
      pagado: false,
      mensaje: 'El monto cobrado no coincide con el del pedido. Nos comunicaremos contigo.',
    };
  }

  // Solo avanza desde PENDIENTE_PAGO. Si el pedido ya siguió su curso —lo
  // prepararon, lo entregaron— la segunda notificación no lo hace retroceder.
  if (pedido.estado === 'PENDIENTE_PAGO') {
    const { error: errEstado } = await sb
      .from('pedidos_web')
      .update({ estado: 'PAGO_VERIFICADO' })
      .eq('id', pedido.id)
      .eq('estado', 'PENDIENTE_PAGO'); // carrera entre IPN y retorno
    if (errEstado) throw new Error(`No se pudo confirmar el pedido ${numero}: ${errEstado.message}`);
    return { pedidoId: pedido.id, numero, estado: 'PAGO_VERIFICADO', pagado: true, mensaje: 'Pago confirmado' };
  }

  return {
    pedidoId: pedido.id,
    numero,
    estado: pedido.estado,
    pagado: true,
    mensaje: 'El pago ya estaba registrado',
  };
}
