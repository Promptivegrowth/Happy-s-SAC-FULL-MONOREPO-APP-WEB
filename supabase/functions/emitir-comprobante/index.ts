// Edge Function: POST /functions/v1/emitir-comprobante
// Genera y envía un comprobante electrónico (boleta/factura) vía Nubefact (PSE).
// Body: { comprobante_id: uuid }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();

  const { comprobante_id } = await req.json();
  if (!comprobante_id) return new Response(JSON.stringify({ error: 'falta comprobante_id' }), { status: 400 });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: c } = await sb.from('comprobantes')
    .select('*, comprobantes_lineas(*)')
    .eq('id', comprobante_id).single();

  if (!c) return new Response(JSON.stringify({ error: 'comprobante no encontrado' }), { status: 404 });

  const NUBEFACT_TOKEN = Deno.env.get('NUBEFACT_TOKEN');
  const NUBEFACT_RUC   = Deno.env.get('NUBEFACT_RUC');

  if (!NUBEFACT_TOKEN || !NUBEFACT_RUC) {
    return new Response(JSON.stringify({ error: 'NUBEFACT credentials missing' }), { status: 500 });
  }

  // Construye el payload Nubefact (https://www.nubefact.com/docs)
  // TODO: mapear todos los campos requeridos de cabecera + items
  const payload = {
    operacion: 'generar_comprobante',
    tipo_de_comprobante: c.tipo === 'BOLETA' ? 2 : 1,           // 1=Factura, 2=Boleta
    serie: c.serie,
    numero: c.numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: c.tipo_documento_cliente === 'RUC' ? 6 : 1,
    cliente_numero_de_documento: c.numero_documento_cliente,
    cliente_denominacion: c.razon_social_cliente,
    cliente_direccion: c.direccion_cliente,
    cliente_email: '',
    fecha_de_emision: c.fecha_emision,
    moneda: c.moneda === 'PEN' ? 1 : 2,
    porcentaje_de_igv: 18.00,
    total_gravada: c.sub_total,
    total_igv: c.igv,
    total: c.total,
    items: c.comprobantes_lineas?.map((l: { codigo: string; descripcion: string; cantidad: number; unidad_sunat: string; precio_unitario: number; sub_total: number; igv: number; total: number; afectacion_igv: string }) => ({
      unidad_de_medida: l.unidad_sunat,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      valor_unitario: l.precio_unitario / 1.18,
      precio_unitario: l.precio_unitario,
      subtotal: l.sub_total,
      tipo_de_igv: 1,
      igv: l.igv,
      total: l.total,
      anticipo_regularizacion: false,
    })) ?? [],
  };

  const res = await fetch(`https://api.nubefact.com/api/v1/${NUBEFACT_RUC}`, {
    method: 'POST',
    headers: {
      Authorization: `Token token="${NUBEFACT_TOKEN}"`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  await sb.from('comprobantes').update({
    estado: res.ok ? 'EMITIDO' : 'RECHAZADO',
    sunat_codigo_respuesta: json.codigo_de_error ?? null,
    sunat_mensaje: json.errors ?? json.respuesta ?? null,
    pdf_url: json.enlace_del_pdf ?? null,
    xml_firmado_url: json.enlace_del_xml ?? null,
    sunat_enviado_en: new Date().toISOString(),
  }).eq('id', comprobante_id);

  return new Response(JSON.stringify(json), {
    status: res.status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
