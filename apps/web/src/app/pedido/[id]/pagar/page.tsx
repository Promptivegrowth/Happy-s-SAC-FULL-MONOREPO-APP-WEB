/**
 * Pantalla de pago con tarjeta de un pedido.
 *
 * Existe como página propia —y no como ventana sobre el checkout— para que
 * cada intento de pago sea una carga limpia. El porqué está en
 * `formulario-izipay.tsx`.
 *
 * El monto que se muestra sale de la base, igual que el que se cobra.
 */

import { redirect, notFound } from 'next/navigation';
import { createServiceClient } from '@happy/db/service';
import { FormularioIzipay } from './formulario-izipay';

export const metadata = { title: 'Pagar pedido' };
export const dynamic = 'force-dynamic';

type Pedido = {
  id: string;
  numero: string;
  estado: string;
  total: number | string;
};

export default async function PagarPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const sb = createServiceClient();
  const { data } = await sb
    .from('pedidos_web')
    .select('id, numero, estado, total')
    .eq('id', id)
    .maybeSingle();

  const pedido = data as unknown as Pedido | null;
  if (!pedido) notFound();

  // Un pedido que ya se pagó (o que se canceló) no se vuelve a cobrar: se lo
  // manda a ver su estado. El servidor tampoco entregaría un formToken, pero
  // más vale no hacerle abrir un formulario que no va a servirle.
  if (pedido.estado !== 'PENDIENTE_PAGO') redirect(`/pedido/${pedido.id}`);

  return (
    <FormularioIzipay
      pedidoId={pedido.id}
      numero={pedido.numero}
      total={Number(pedido.total)}
    />
  );
}
