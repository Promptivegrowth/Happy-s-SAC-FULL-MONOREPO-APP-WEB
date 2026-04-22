// @deno-types="https://esm.sh/@supabase/functions-js@2.4.1/src/edge-runtime.d.ts"
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

// Edge Function: GET /functions/v1/sunat-consulta?tipo=dni&numero=12345678
// Proxy seguro a apis.net.pe — el token vive en Supabase secrets, no en el cliente.

const BASE = 'https://api.apis.net.pe/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  const url = new URL(req.url);
  const tipo = url.searchParams.get('tipo');
  const numero = url.searchParams.get('numero');

  if (!tipo || !numero) {
    return new Response(JSON.stringify({ error: 'Faltan parámetros tipo y numero' }), {
      status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const token = Deno.env.get('APIS_NET_PE_TOKEN');
  if (!token) {
    return new Response(JSON.stringify({ error: 'APIS_NET_PE_TOKEN no configurado' }), {
      status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const path = tipo === 'dni' ? `/reniec/dni?numero=${numero}` : `/sunat/ruc?numero=${numero}`;
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(JSON.stringify({ error: text }), {
      status: res.status, headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
  }

  const body = await res.json();
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
