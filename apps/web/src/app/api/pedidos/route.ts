import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@happy/db/service';
import { formatTallaChip } from '@happy/lib';
import { cotizarPedido, ErrorCotizacion } from '@/server/cotizar-pedido';

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
    // A dónde va. Si no viene, no se cobra envío: ver costoEnvio.
    destino: z.enum(['LIMA_METRO', 'PROVINCIA']).nullish(),
  }),
  metodoPago: z.enum(['yape','plin','culqi_card','izipay_card','transferencia','whatsapp']),
  necesitaFactura: z.boolean().default(false),
  items: z.array(z.object({
    varianteId: z.string().uuid(),
    cantidad: z.number().int().min(1),
    // El precio que el navegador tenía en pantalla. NO se usa para cobrar: solo
    // para avisar si cambió mientras el carrito estaba abierto.
    precio: z.number().min(0),
  })).min(1),
  envio: z.number().min(0).default(0),
  total: z.number().min(0),
});

/** Diferencia que se tolera entre el total del navegador y el recalculado. */
const TOLERANCIA_SOLES = 0.01;

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
        ? `${v.productos?.nombre ?? 'producto'} talla ${formatTallaChip(v.talla)}`
        : 'producto';
      return `${desc}: pediste ${f.pide}, solo hay ${f.hay} disponible${f.hay === 1 ? '' : 's'}`;
    });
    return NextResponse.json(
      {
        error: 'Sin stock suficiente',
        mensaje: `No podemos procesar tu pedido. Algunos productos no tienen stock disponible:\n${mensajes.join('\n')}\n\nPor favor actualiza tu carrito y vuelve a intentar.`,
        faltantes,
      },
      { status: 409 },  // Conflict
    );
  }

  // 0.b COTIZACIÓN DEL SERVIDOR — los precios salen de la base, no del
  //     navegador. Ver el porqué en @/server/cotizar-pedido.
  let cotizacion;
  try {
    cotizacion = await cotizarPedido(
      body.items.map((i) => ({ varianteId: i.varianteId, cantidad: i.cantidad })),
      body.entrega.metodo,
      body.entrega.destino ?? null,
    );
  } catch (e) {
    const esDeNegocio = e instanceof ErrorCotizacion;
    return NextResponse.json(
      { error: esDeNegocio ? (e as Error).message : 'No se pudo calcular el total del pedido' },
      { status: esDeNegocio ? 409 : 500 },
    );
  }

  // Si el total no coincide, el carrito quedó abierto mientras cambiaban los
  // precios en el ERP. No se cobra a la callada ni lo uno ni lo otro: se le
  // muestra el total nuevo y decide.
  if (Math.abs(cotizacion.total - body.total) > TOLERANCIA_SOLES) {
    return NextResponse.json(
      {
        error: 'Los precios cambiaron',
        mensaje:
          `El total de tu pedido cambió mientras lo armabas: ahora es S/ ${cotizacion.total.toFixed(2)} ` +
          `en lugar de S/ ${body.total.toFixed(2)}.\n\n` +
          'Vuelve al carrito para ver el detalle actualizado y confirma de nuevo.',
        total: cotizacion.total,
        subTotal: cotizacion.subTotal,
        envio: cotizacion.envio,
      },
      { status: 409 },
    );
  }

  /*
   * 0.c EL UBIGEO.
   *
   * En el checkout es un campo de texto libre ("Lima / Lima / Miraflores"),
   * pero la columna `ubigeo_entrega` apunta por clave foránea al catálogo de
   * ubigeos, que usa códigos de 6 dígitos. Cualquier cosa que escribiera el
   * comprador hacía fallar el INSERT completo con un error de base de datos,
   * así que ningún pedido con entrega a domicilio llegaba a crearse.
   *
   * Ahora solo se guarda en esa columna si es un código válido de verdad. Si
   * es texto, no se tira: se suma a la referencia de entrega, que es donde el
   * repartidor lo va a leer igual.
   */
  const ubigeoTexto = (body.entrega.ubigeo ?? '').trim();
  let ubigeoCodigo: string | null = null;
  if (/^\d{6}$/.test(ubigeoTexto)) {
    const { data: u } = await sb
      .from('ubigeo')
      .select('codigo')
      .eq('codigo', ubigeoTexto)
      .maybeSingle();
    if (u) ubigeoCodigo = ubigeoTexto;
  }
  let referenciaEntrega = (body.entrega.referencia ?? '').trim();
  if (!ubigeoCodigo && ubigeoTexto) {
    referenciaEntrega = referenciaEntrega ? `${referenciaEntrega} · ${ubigeoTexto}` : ubigeoTexto;
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

  // 3. Insertar pedido — con los montos recalculados
  const { data: pedido, error: errP } = await sb.from('pedidos_web').insert({
    numero,
    cliente_id: clienteId,
    fecha: new Date().toISOString(),
    estado: body.metodoPago === 'whatsapp' ? 'WHATSAPP_DERIVADO' : 'PENDIENTE_PAGO',
    metodo_entrega: body.entrega.metodo,
    // Los campos vacíos van como NULL, no como cadena vacía: un '' en una
    // columna con clave foránea es tan inválido como cualquier otro texto.
    direccion_entrega: body.entrega.direccion?.trim() || null,
    referencia_entrega: referenciaEntrega || null,
    ubigeo_entrega: ubigeoCodigo,
    contacto_nombre: body.cliente.nombre,
    contacto_telefono: body.cliente.telefono,
    contacto_email: body.cliente.email?.trim() || null,
    metodo_pago_seleccionado: body.metodoPago,
    sub_total: cotizacion.subTotal,
    costo_envio: cotizacion.envio,
    total: cotizacion.total,
    necesita_factura: body.necesitaFactura,
    notas_cliente: '',
  }).select('id, numero').single();

  if (errP) return NextResponse.json({ error: errP.message }, { status: 500 });

  // 4. Insertar líneas
  const { error: errL } = await sb.from('pedidos_web_lineas').insert(
    cotizacion.lineas.map((l) => ({
      pedido_id: pedido.id,
      variante_id: l.varianteId,
      cantidad: l.cantidad,
      precio_unitario: l.precioUnitario,
    })),
  );
  // Un pedido sin líneas no se puede preparar ni cobrar: mejor que falle acá,
  // antes de mandar al comprador a pagar algo que nadie va a poder despachar.
  if (errL) {
    await sb.from('pedidos_web').delete().eq('id', pedido.id);
    return NextResponse.json({ error: errL.message }, { status: 500 });
  }

  return NextResponse.json({
    id: pedido.id,
    numero: pedido.numero,
    total: cotizacion.total,
  });
}
