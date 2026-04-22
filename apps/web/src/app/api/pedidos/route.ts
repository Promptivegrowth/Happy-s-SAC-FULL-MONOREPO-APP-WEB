import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@happy/db/service';

export const runtime = 'nodejs';

const schema = z.object({
  cliente: z.object({
    tipoDoc: z.enum(['DNI','RUC']),
    doc: z.string().min(8).max(11),
    nombre: z.string().min(2),
    email: z.string().email().optional().or(z.literal('')),
    telefono: z.string().min(9),
  }),
  entrega: z.object({
    metodo: z.enum(['DELIVERY','RECOJO_TIENDA']),
    direccion: z.string().optional(),
    referencia: z.string().optional(),
    ubigeo: z.string().optional(),
  }),
  metodoPago: z.enum(['yape','plin','culqi_card','izipay_card','transferencia','whatsapp']),
  necesitaFactura: z.boolean().default(false),
  items: z.array(z.object({
    varianteId: z.string().uuid(),
    cantidad: z.number().int().min(1),
    precio: z.number().min(0),
  })).min(1),
  envio: z.number().min(0).default(0),
  total: z.number().min(0),
});

export async function POST(req: Request) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const sb = createServiceClient();

  // 1. Upsert cliente (sin RLS)
  const { data: existCliente } = await sb.from('clientes')
    .select('id')
    .eq('tipo_documento', body.cliente.tipoDoc)
    .eq('numero_documento', body.cliente.doc)
    .maybeSingle();

  let clienteId = existCliente?.id;
  if (!clienteId) {
    const { data: nuevo, error: errC } = await sb.from('clientes').insert({
      tipo_documento: body.cliente.tipoDoc,
      numero_documento: body.cliente.doc,
      tipo_cliente: 'PUBLICO_FINAL',
      ...(body.cliente.tipoDoc === 'RUC'
        ? { razon_social: body.cliente.nombre }
        : { nombres: body.cliente.nombre.split(' ')[0], apellido_paterno: body.cliente.nombre.split(' ').slice(1).join(' ') }),
      email: body.cliente.email || null,
      telefono: body.cliente.telefono,
    }).select('id').single();
    if (errC) return NextResponse.json({ error: errC.message }, { status: 500 });
    clienteId = nuevo.id;
  }

  // 2. Generar número
  const { data: numeroData } = await sb.rpc('generar_numero_pedido_web');
  const numero: string = numeroData ?? `WEB-${Date.now()}`;

  // 3. Calcular subtotal
  const subTotal = body.items.reduce((a, i) => a + i.cantidad * i.precio, 0);

  // 4. Insertar pedido
  const { data: pedido, error: errP } = await sb.from('pedidos_web').insert({
    numero,
    cliente_id: clienteId,
    fecha: new Date().toISOString(),
    estado: body.metodoPago === 'whatsapp' ? 'WHATSAPP_DERIVADO' : 'PENDIENTE_PAGO',
    metodo_entrega: body.entrega.metodo,
    direccion_entrega: body.entrega.direccion ?? null,
    referencia_entrega: body.entrega.referencia ?? null,
    ubigeo_entrega: body.entrega.ubigeo ?? null,
    contacto_nombre: body.cliente.nombre,
    contacto_telefono: body.cliente.telefono,
    contacto_email: body.cliente.email ?? null,
    metodo_pago_seleccionado: body.metodoPago,
    sub_total: subTotal,
    costo_envio: body.envio,
    total: body.total,
    necesita_factura: body.necesitaFactura,
    notas_cliente: '',
  }).select('id, numero').single();

  if (errP) return NextResponse.json({ error: errP.message }, { status: 500 });

  // 5. Insertar líneas
  const lineas = body.items.map((i) => ({
    pedido_id: pedido.id,
    variante_id: i.varianteId,
    cantidad: i.cantidad,
    precio_unitario: i.precio,
  }));
  await sb.from('pedidos_web_lineas').insert(lineas);

  return NextResponse.json({ id: pedido.id, numero: pedido.numero });
}
