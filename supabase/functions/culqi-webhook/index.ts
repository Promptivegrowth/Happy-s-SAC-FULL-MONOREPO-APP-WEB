// Edge Function: POST /functions/v1/culqi-webhook
// Recibe eventos de Culqi (charge.creation.succeeded, charge.dispute.opened, etc.)
// Valida firma HMAC y actualiza pedidos_web_pagos / ventas_pagos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const body = await req.json();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Log de webhook recibido
  await supabase.from('webhooks_log').insert({
    proveedor: 'culqi',
    evento: body.type,
    payload: body,
  });

  // TODO: validar firma HMAC con CULQI_WEBHOOK_SECRET
  // const sig = req.headers.get('culqi-signature');
  // ... validar ...

  if (body.type === 'charge.creation.succeeded') {
    const charge = body.data;
    const metadataPedido = charge.metadata?.pedido_id;
    if (metadataPedido) {
      await supabase.from('pedidos_web_pagos').insert({
        pedido_id: metadataPedido,
        metodo: 'TARJETA_CREDITO',
        monto: charge.amount / 100,
        estado: 'CONFIRMADO',
        culqi_charge_id: charge.id,
        webhook_payload: charge,
      });
      await supabase.from('pedidos_web')
        .update({ estado: 'PAGO_VERIFICADO' })
        .eq('id', metadataPedido);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
