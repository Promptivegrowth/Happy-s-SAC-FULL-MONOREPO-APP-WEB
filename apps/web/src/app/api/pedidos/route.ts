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

  // 0. VALIDACIÓN DE STOCK — sumar cantidades por variante (por si el carrito
  //    tiene el mismo SKU duplicado) y comparar contra stock disponible total
  //    (excluyendo almacenes ocultos como ALM-MR).
  const cantPorVariante = new Map<string, number>();
  for (const i of body.items) {
    cantPorVariante.set(i.varianteId, (cantPorVariante.get(i.varianteId) ?? 0) + i.cantidad);
  }
  const varianteIds = Array.from(cantPorVariante.keys());
  // IDs de almacenes ocultos (no cuentan como disponibles para web)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: ocultos } = await sbAny
    .from('almacenes')
    .select('id')
    .eq('oculto_en_selectores', true);
  const almacenesExcluidos = new Set((ocultos ?? []).map((a: { id: string }) => a.id));

  const { data: stockRows } = await sb
    .from('stock_actual')
    .select('variante_id, almacen_id, cantidad')
    .in('variante_id', varianteIds);
  const stockTotalPorVar = new Map<string, number>();
  for (const s of (stockRows ?? []) as { variante_id: string; almacen_id: string; cantidad: number | string }[]) {
    if (almacenesExcluidos.has(s.almacen_id)) continue;
    const cant = Math.max(0, Number(s.cantidad ?? 0)); // ignorar negativos
    stockTotalPorVar.set(s.variante_id, (stockTotalPorVar.get(s.variante_id) ?? 0) + cant);
  }

  const faltantes: { varianteId: string; pide: number; hay: number; sku?: string; nombre?: string }[] = [];
  for (const [vid, cant] of cantPorVariante) {
    const stock = stockTotalPorVar.get(vid) ?? 0;
    if (stock < cant) {
      faltantes.push({ varianteId: vid, pide: cant, hay: stock });
    }
  }
  if (faltantes.length > 0) {
    // Buscar nombres para mensaje claro al usuario
    const { data: vars } = await sb
      .from('productos_variantes')
      .select('id, sku, talla, productos(nombre)')
      .in('id', faltantes.map((f) => f.varianteId));
    type VR = { id: string; sku: string; talla: string; productos: { nombre: string } | null };
    const meta = new Map<string, VR>(((vars ?? []) as unknown as VR[]).map((v) => [v.id, v]));
    const mensajes = faltantes.map((f) => {
      const v = meta.get(f.varianteId);
      const desc = v
        ? `${v.productos?.nombre ?? 'producto'} talla ${v.talla.replace('T', '')}`
        : 'producto';
      return `${desc}: pediste ${f.pide}, solo hay ${f.hay} disponible${f.hay === 1 ? '' : 's'}`;
    });
    return NextResponse.json(
      {
        error: 'Sin stock suficiente',
        mensaje: `No podemos procesar tu pedido. Algunos productos no tienen stock disponible:\n${mensajes.join('\n')}\n\nPor favor actualizá tu carrito y volvé a intentar.`,
        faltantes,
      },
      { status: 409 },  // Conflict
    );
  }

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
