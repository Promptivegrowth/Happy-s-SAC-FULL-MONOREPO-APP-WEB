// Edge Function (cron-trigger): scan stock_actual y crea notificaciones
// para los gerentes/almaceneros cuando stock < umbral.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

Deno.serve(async () => {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: alertas } = await sb.from('v_stock_alertas').select('*').limit(100);
  if (!alertas || alertas.length === 0) {
    return new Response(JSON.stringify({ ok: true, alertas: 0 }));
  }

  const notifs = alertas.map((a) => ({
    destinatario_rol: 'almacenero',
    tipo: 'STOCK_BAJO',
    titulo: `Stock bajo en ${a.almacen}`,
    mensaje: `${a.producto} (${a.sku}) tiene solo ${a.cantidad} unidades.`,
    enlace: `/inventario/alertas`,
    meta: a,
  }));
  await sb.from('notificaciones').insert(notifs);

  return new Response(JSON.stringify({ ok: true, alertas: alertas.length }));
});
