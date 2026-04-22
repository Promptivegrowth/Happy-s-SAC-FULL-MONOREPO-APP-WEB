import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@happy/db/service';

export const runtime = 'nodejs';

const schema = z.object({
  tipo: z.enum(['RECLAMO','QUEJA']),
  cliente_nombre: z.string().min(2),
  cliente_documento_tipo: z.enum(['DNI','RUC','CE','PASAPORTE']),
  cliente_documento_numero: z.string().min(8),
  cliente_telefono: z.string().min(9),
  cliente_email: z.string().email(),
  cliente_direccion: z.string().min(5),
  cliente_ubigeo: z.string().optional(),
  es_menor_edad: z.boolean().default(false),
  apoderado_nombre: z.string().optional(),
  apoderado_documento: z.string().optional(),
  tipo_bien: z.enum(['PRODUCTO','SERVICIO']),
  monto_reclamado: z.number().optional(),
  descripcion: z.string().min(10),
  pedido_consumidor: z.string().min(5),
  acepta_terminos: z.literal(true),
});

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data: numero } = await sb.rpc('generar_numero_reclamo');
  const ip = req.headers.get('x-forwarded-for') ?? null;
  const ua = req.headers.get('user-agent') ?? null;

  const { data, error } = await sb.from('reclamos').insert({
    numero: numero ?? `REC-${Date.now()}`,
    ...body,
    ip_consumidor: ip,
    user_agent: ua,
  }).select('id, numero').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // TODO: Edge Function dispara email a INDECOPI / al gerente
  return NextResponse.json({ id: data.id, numero: data.numero });
}
