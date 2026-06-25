'use server';

/**
 * Pedidos web — gestión administrativa desde el ERP.
 *
 * Flujo:
 *   PENDIENTE_PAGO → PAGO_VERIFICADO → EN_PREPARACION → LISTO_RECOJO/EN_DELIVERY → ENTREGADO
 *                                            │
 *                                            └─ aquí se DESCUENTA STOCK (kardex SALIDA_VENTA)
 *                                               + se crea la venta + se reserva correlativo
 *
 * Si se cancela un pedido que ya tenía stock reservado, se REINTEGRA via
 * kardex ENTRADA_AJUSTE para mantener consistencia.
 */

import { z } from 'zod';
import { createClient } from '@happy/db/server';
import { createServiceClient } from '@happy/db/service';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import {
  ESTADOS_PEDIDO_WEB, TRANSICIONES, STOCK_RESERVADO, type EstadoPedidoWeb,
} from './pedidos-web-helpers';

// Cast pragmático — pedidos_web no estaba en los types autogenerados originales.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any; rpc: (n: string, p?: unknown) => any };

// ============================================================================
// LISTAR pedidos web (con filtros)
// ============================================================================
export type PedidoWebRow = {
  id: string;
  numero: string;
  fecha: string;
  estado: EstadoPedidoWeb;
  cliente_nombre: string;
  cliente_doc: string | null;
  cliente_telefono: string | null;
  metodo_entrega: 'DELIVERY' | 'RECOJO_TIENDA';
  metodo_pago: string | null;
  total: number;
  cantidad_items: number;
};

export async function listarPedidosWeb(opts: {
  estado?: EstadoPedidoWeb | '';
  desde?: string;
  hasta?: string;
  q?: string;
} = {}): Promise<PedidoWebRow[]> {
  const sb = (await createClient()) as unknown as AnyClient;
  let q = sb
    .from('pedidos_web')
    .select(
      'id, numero, fecha, estado, contacto_nombre, contacto_telefono, ' +
        'metodo_entrega, metodo_pago_seleccionado, total, ' +
        'cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno, numero_documento, telefono)',
    )
    .order('fecha', { ascending: false })
    .limit(300);
  if (opts.estado) q = q.eq('estado', opts.estado);
  if (opts.desde) q = q.gte('fecha', `${opts.desde}T00:00:00`);
  if (opts.hasta) q = q.lte('fecha', `${opts.hasta}T23:59:59`);
  if (opts.q) q = q.or(`numero.ilike.%${opts.q}%,contacto_nombre.ilike.%${opts.q}%`);
  const { data } = await q;

  type Raw = {
    id: string;
    numero: string;
    fecha: string;
    estado: EstadoPedidoWeb;
    contacto_nombre: string | null;
    contacto_telefono: string | null;
    metodo_entrega: 'DELIVERY' | 'RECOJO_TIENDA';
    metodo_pago_seleccionado: string | null;
    total: string | number;
    cliente: {
      razon_social: string | null;
      nombres: string | null;
      apellido_paterno: string | null;
      apellido_materno: string | null;
      numero_documento: string | null;
      telefono: string | null;
    } | null;
  };
  const filas = (data ?? []) as Raw[];
  const ids = filas.map((f) => f.id);

  // Conteo de items por pedido (1 query agregada)
  const cantByPedido = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lns } = await sb
      .from('pedidos_web_lineas')
      .select('pedido_id, cantidad')
      .in('pedido_id', ids);
    for (const l of (lns ?? []) as { pedido_id: string; cantidad: number }[]) {
      cantByPedido.set(l.pedido_id, (cantByPedido.get(l.pedido_id) ?? 0) + Number(l.cantidad));
    }
  }

  return filas.map((f) => {
    const nombre =
      f.cliente?.razon_social ||
      [f.cliente?.nombres, f.cliente?.apellido_paterno, f.cliente?.apellido_materno]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      f.contacto_nombre ||
      'Cliente';
    return {
      id: f.id,
      numero: f.numero,
      fecha: f.fecha,
      estado: f.estado,
      cliente_nombre: nombre,
      cliente_doc: f.cliente?.numero_documento ?? null,
      cliente_telefono: f.cliente?.telefono ?? f.contacto_telefono ?? null,
      metodo_entrega: f.metodo_entrega,
      metodo_pago: f.metodo_pago_seleccionado,
      total: Number(f.total ?? 0),
      cantidad_items: cantByPedido.get(f.id) ?? 0,
    };
  });
}

// ============================================================================
// OBTENER pedido web (cabecera + líneas)
// ============================================================================
export type PedidoWebDetalle = {
  pedido: {
    id: string;
    numero: string;
    fecha: string;
    estado: EstadoPedidoWeb;
    metodo_entrega: 'DELIVERY' | 'RECOJO_TIENDA';
    almacen_recojo: string | null;
    direccion_entrega: string | null;
    referencia_entrega: string | null;
    ubigeo_entrega: string | null;
    contacto_nombre: string | null;
    contacto_telefono: string | null;
    contacto_email: string | null;
    metodo_pago: string | null;
    sub_total: number;
    descuento: number;
    costo_envio: number;
    igv: number;
    total: number;
    necesita_factura: boolean;
    ruc_facturacion: string | null;
    razon_social_facturacion: string | null;
    notas_cliente: string | null;
    notas_internas: string | null;
    venta_id: string | null;
    comprobante_id: string | null;
  };
  cliente: {
    id: string | null;
    nombre: string;
    documento: string | null;
    telefono: string | null;
    email: string | null;
  };
  lineas: {
    id: string;
    variante_id: string;
    sku: string;
    talla: string;
    producto_nombre: string;
    cantidad: number;
    precio_unitario: number;
    sub_total: number;
  }[];
  venta_numero: string | null;
  comprobante_numero: string | null;
};

export async function obtenerPedidoWeb(id: string): Promise<PedidoWebDetalle | null> {
  const sb = (await createClient()) as unknown as AnyClient;
  const { data: p } = await sb
    .from('pedidos_web')
    .select(
      '*, cliente:cliente_id(id, razon_social, nombres, apellido_paterno, apellido_materno, numero_documento, telefono, email)',
    )
    .eq('id', id)
    .maybeSingle();
  if (!p) return null;

  const { data: lineasRaw } = await sb
    .from('pedidos_web_lineas')
    .select('id, variante_id, cantidad, precio_unitario, sub_total, variantes:variante_id(sku, talla, productos:producto_id(nombre))')
    .eq('pedido_id', id);

  type LR = {
    id: string;
    variante_id: string;
    cantidad: number;
    precio_unitario: string | number;
    sub_total: string | number;
    variantes: { sku: string; talla: string; productos: { nombre: string } | null } | null;
  };
  const lineas = ((lineasRaw ?? []) as LR[]).map((l) => ({
    id: l.id,
    variante_id: l.variante_id,
    sku: l.variantes?.sku ?? '—',
    talla: l.variantes?.talla ?? '—',
    producto_nombre: l.variantes?.productos?.nombre ?? '—',
    cantidad: Number(l.cantidad),
    precio_unitario: Number(l.precio_unitario),
    sub_total: Number(l.sub_total ?? 0),
  }));

  // Venta y comprobante asociados (si están)
  let venta_numero: string | null = null;
  let comprobante_numero: string | null = null;
  if (p.venta_id) {
    const { data: v } = await sb.from('ventas').select('numero').eq('id', p.venta_id).maybeSingle();
    venta_numero = (v?.numero as string) ?? null;
  }
  if (p.comprobante_id) {
    const { data: c } = await sb.from('comprobantes').select('numero_completo').eq('id', p.comprobante_id).maybeSingle();
    comprobante_numero = (c?.numero_completo as string) ?? null;
  }

  const cliNombre =
    p.cliente?.razon_social ||
    [p.cliente?.nombres, p.cliente?.apellido_paterno, p.cliente?.apellido_materno].filter(Boolean).join(' ').trim() ||
    p.contacto_nombre ||
    'Cliente';

  return {
    pedido: {
      id: p.id as string,
      numero: p.numero as string,
      fecha: p.fecha as string,
      estado: p.estado as EstadoPedidoWeb,
      metodo_entrega: p.metodo_entrega as 'DELIVERY' | 'RECOJO_TIENDA',
      almacen_recojo: (p.almacen_recojo as string | null) ?? null,
      direccion_entrega: (p.direccion_entrega as string | null) ?? null,
      referencia_entrega: (p.referencia_entrega as string | null) ?? null,
      ubigeo_entrega: (p.ubigeo_entrega as string | null) ?? null,
      contacto_nombre: (p.contacto_nombre as string | null) ?? null,
      contacto_telefono: (p.contacto_telefono as string | null) ?? null,
      contacto_email: (p.contacto_email as string | null) ?? null,
      metodo_pago: (p.metodo_pago_seleccionado as string | null) ?? null,
      sub_total: Number(p.sub_total ?? 0),
      descuento: Number(p.descuento ?? 0),
      costo_envio: Number(p.costo_envio ?? 0),
      igv: Number(p.igv ?? 0),
      total: Number(p.total ?? 0),
      necesita_factura: Boolean(p.necesita_factura),
      ruc_facturacion: (p.ruc_facturacion as string | null) ?? null,
      razon_social_facturacion: (p.razon_social_facturacion as string | null) ?? null,
      notas_cliente: (p.notas_cliente as string | null) ?? null,
      notas_internas: (p.notas_internas as string | null) ?? null,
      venta_id: (p.venta_id as string | null) ?? null,
      comprobante_id: (p.comprobante_id as string | null) ?? null,
    },
    cliente: {
      id: (p.cliente?.id as string | null) ?? null,
      nombre: cliNombre,
      documento: (p.cliente?.numero_documento as string | null) ?? null,
      telefono: (p.cliente?.telefono as string | null) ?? (p.contacto_telefono as string | null) ?? null,
      email: (p.cliente?.email as string | null) ?? (p.contacto_email as string | null) ?? null,
    },
    lineas,
    venta_numero,
    comprobante_numero,
  };
}

// ============================================================================
// CAMBIAR ESTADO (con validación de transición)
// ============================================================================
function validarTransicion(actual: EstadoPedidoWeb, nuevo: EstadoPedidoWeb): void {
  const permitidas = TRANSICIONES[actual] ?? [];
  if (!permitidas.includes(nuevo)) {
    throw new Error(`No se puede pasar de ${actual} a ${nuevo}`);
  }
}

export async function confirmarPagoPedidoWeb(id: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const { data: p } = await sb.from('pedidos_web').select('estado').eq('id', id).single();
    if (!p) throw new Error('Pedido no encontrado');
    validarTransicion(p.estado as EstadoPedidoWeb, 'PAGO_VERIFICADO');
    const { error } = await sb.from('pedidos_web').update({ estado: 'PAGO_VERIFICADO' }).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/pedidos-web/${id}`, '/pedidos-web');
  return r;
}

// ============================================================================
// PREPARAR pedido — DESCUENTA STOCK + crea venta + comprobante interno
// ============================================================================
const prepararSchema = z.object({
  almacen_id: z.string().uuid(),
  notas_internas: z.string().optional().or(z.literal('')),
});

export async function prepararPedidoWeb(
  id: string,
  input: z.input<typeof prepararSchema>,
): Promise<ActionResult<{ venta_numero: string }>> {
  const r = await runAction(async () => {
    const { userId } = await requireUser();
    const data = prepararSchema.parse(input);
    // Service client porque vamos a tocar ventas + kardex + clientes en bypass de RLS
    const sb = createServiceClient() as unknown as AnyClient;

    // 1) Cargar pedido + líneas
    const { data: p } = await sb
      .from('pedidos_web')
      .select(
        'id, numero, estado, cliente_id, sub_total, descuento, igv, total, venta_id, ' +
          'metodo_pago_seleccionado, contacto_nombre, contacto_telefono',
      )
      .eq('id', id)
      .single();
    if (!p) throw new Error('Pedido no encontrado');
    validarTransicion(p.estado as EstadoPedidoWeb, 'EN_PREPARACION');
    if (p.venta_id) throw new Error('Este pedido ya tiene venta asociada');

    const { data: lineasRaw } = await sb
      .from('pedidos_web_lineas')
      .select('variante_id, cantidad, precio_unitario')
      .eq('pedido_id', id);
    type LR = { variante_id: string; cantidad: number; precio_unitario: string | number };
    const lineas = (lineasRaw ?? []) as LR[];
    if (lineas.length === 0) throw new Error('Pedido sin líneas');

    // 2) Validar stock disponible en el almacén elegido
    const varIds = lineas.map((l) => l.variante_id);
    const { data: stocks } = await sb
      .from('stock_actual')
      .select('variante_id, cantidad')
      .eq('almacen_id', data.almacen_id)
      .in('variante_id', varIds);
    const stockMap = new Map<string, number>(
      ((stocks ?? []) as { variante_id: string; cantidad: number | string }[]).map((s) => [
        s.variante_id,
        Number(s.cantidad ?? 0),
      ]),
    );
    const faltantes: string[] = [];
    for (const l of lineas) {
      const enStock = stockMap.get(l.variante_id) ?? 0;
      if (l.cantidad > enStock) {
        const { data: vInfo } = await sb
          .from('productos_variantes')
          .select('sku, talla, productos:producto_id(nombre)')
          .eq('id', l.variante_id)
          .single();
        const nom = vInfo
          ? `${vInfo.productos?.nombre ?? ''} talla ${String(vInfo.talla ?? '').replace('T', '')} (${vInfo.sku})`
          : 'producto';
        faltantes.push(`${nom}: pide ${l.cantidad}, hay ${enStock}`);
      }
    }
    if (faltantes.length > 0) {
      throw new Error('Sin stock suficiente en el almacén:\n- ' + faltantes.join('\n- '));
    }

    // 3) Crear venta nueva
    let ventaNumero: string;
    try {
      const { data: corr } = await sb.rpc('next_correlativo', { p_clave: 'VENTA', p_padding: 6 });
      ventaNumero = (typeof corr === 'string' ? corr : `VEN-${Date.now()}`) as string;
    } catch {
      ventaNumero = `VEN-${Date.now()}`;
    }

    const { data: ventaIns, error: errV } = await sb
      .from('ventas')
      .insert({
        numero: ventaNumero,
        canal: 'WEB',
        fecha: new Date().toISOString(),
        almacen_id: data.almacen_id,
        cliente_id: p.cliente_id,
        vendedor_usuario_id: userId,
        sub_total: Number(p.sub_total ?? 0),
        descuento_total: Number(p.descuento ?? 0),
        igv: Number(p.igv ?? 0),
        total: Number(p.total ?? 0),
        estado: 'COMPLETADA',
        pedido_web_id: p.id,
        observacion: `Venta de pedido web ${p.numero}`,
      })
      .select('id, numero')
      .single();
    if (errV) throw new Error(`Venta: ${errV.message}`);
    const ventaId = ventaIns.id as string;

    // 4) Líneas de venta
    const ventaLineas = lineas.map((l) => ({
      venta_id: ventaId,
      variante_id: l.variante_id,
      cantidad: l.cantidad,
      precio_unitario: Number(l.precio_unitario),
    }));
    const { error: errVL } = await sb.from('ventas_lineas').insert(ventaLineas);
    if (errVL) {
      await sb.from('ventas').delete().eq('id', ventaId);
      throw new Error(`Líneas venta: ${errVL.message}`);
    }

    // 5) Pago: registramos el método seleccionado por el cliente como CONFIRMADO
    const mp = mapeaMetodoPagoWeb(p.metodo_pago_seleccionado as string | null);
    if (mp) {
      const { error: errP } = await sb.from('ventas_pagos').insert({
        venta_id: ventaId,
        metodo: mp,
        monto: Number(p.total ?? 0),
        referencia: `Pedido web ${p.numero}`,
        estado: 'CONFIRMADO',
      });
      if (errP) {
        await sb.from('ventas_lineas').delete().eq('venta_id', ventaId);
        await sb.from('ventas').delete().eq('id', ventaId);
        throw new Error(`Pago: ${errP.message}`);
      }
    }

    // 6) Kardex SALIDA_VENTA por línea (esto dispara el trigger y baja el stock)
    const kx = lineas.map((l) => ({
      fecha: new Date().toISOString(),
      tipo: 'SALIDA_VENTA',
      almacen_id: data.almacen_id,
      variante_id: l.variante_id,
      cantidad: l.cantidad,
      costo_unitario: Number(l.precio_unitario),
      costo_total: Number(l.precio_unitario) * l.cantidad,
      referencia_tipo: 'PEDIDO_WEB',
      referencia_id: p.id,
      observacion: `Venta web ${ventaNumero} desde pedido ${p.numero}`,
    }));
    const { error: errKx } = await sb.from('kardex_movimientos').insert(kx);
    if (errKx) {
      await sb.from('ventas_pagos').delete().eq('venta_id', ventaId);
      await sb.from('ventas_lineas').delete().eq('venta_id', ventaId);
      await sb.from('ventas').delete().eq('id', ventaId);
      throw new Error(`Kardex: ${errKx.message}`);
    }

    // 7) Actualizar pedido: estado + venta_id + notas internas
    const update: Record<string, unknown> = {
      estado: 'EN_PREPARACION',
      venta_id: ventaId,
    };
    if (data.notas_internas) update.notas_internas = data.notas_internas;
    await sb.from('pedidos_web').update(update).eq('id', id);

    return { venta_numero: ventaNumero };
  });
  if (r.ok) await bumpPaths(`/pedidos-web/${id}`, '/pedidos-web', '/inventario');
  return r;
}

function mapeaMetodoPagoWeb(m: string | null): string | null {
  if (!m) return null;
  switch (m) {
    case 'yape': return 'YAPE';
    case 'plin': return 'PLIN';
    case 'culqi_card':
    case 'izipay_card': return 'TARJETA_CREDITO';
    case 'transferencia': return 'TRANSFERENCIA';
    case 'whatsapp': return null; // no genera pago automático
    default: return null;
  }
}

// ============================================================================
// AVANZAR ESTADOS simples (sin tocar stock)
// ============================================================================
const cambioEstadoSchema = z.object({
  nuevo: z.enum(ESTADOS_PEDIDO_WEB),
  notas_internas: z.string().optional().or(z.literal('')),
});

export async function cambiarEstadoPedidoWeb(
  id: string,
  input: z.input<typeof cambioEstadoSchema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb: sbRaw } = await requireUser();
    const sb = sbRaw as unknown as AnyClient;
    const data = cambioEstadoSchema.parse(input);
    const { data: p } = await sb.from('pedidos_web').select('estado').eq('id', id).single();
    if (!p) throw new Error('Pedido no encontrado');
    validarTransicion(p.estado as EstadoPedidoWeb, data.nuevo);
    // PREPARAR tiene su acción especial (descuenta stock) — bloquear esta ruta
    if (data.nuevo === 'EN_PREPARACION') {
      throw new Error('Para preparar usá la acción específica (requiere almacén)');
    }
    const update: Record<string, unknown> = { estado: data.nuevo };
    if (data.notas_internas) update.notas_internas = data.notas_internas;
    const { error } = await sb.from('pedidos_web').update(update).eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/pedidos-web/${id}`, '/pedidos-web');
  return r;
}

// ============================================================================
// CANCELAR — si tenía stock reservado, reintegrar via ENTRADA_AJUSTE
// ============================================================================
export async function cancelarPedidoWeb(id: string, motivo: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { userId } = await requireUser();
    const sb = createServiceClient() as unknown as AnyClient;
    const { data: p } = await sb
      .from('pedidos_web')
      .select('id, numero, estado, venta_id, notas_internas')
      .eq('id', id)
      .single();
    if (!p) throw new Error('Pedido no encontrado');
    if (p.estado === 'CANCELADO') throw new Error('Pedido ya cancelado');
    if (p.estado === 'ENTREGADO') throw new Error('No se puede cancelar un pedido ya entregado');

    // Si tenía stock reservado, reintegrar
    if (STOCK_RESERVADO.includes(p.estado as EstadoPedidoWeb) && p.venta_id) {
      // Reusamos las líneas de la venta para el kardex compensatorio
      const { data: vlineas } = await sb
        .from('ventas_lineas')
        .select('variante_id, cantidad, precio_unitario')
        .eq('venta_id', p.venta_id);
      const { data: venta } = await sb.from('ventas').select('almacen_id').eq('id', p.venta_id).single();
      if (vlineas && venta) {
        const kx = (vlineas as { variante_id: string; cantidad: number; precio_unitario: string | number }[]).map((l) => ({
          fecha: new Date().toISOString(),
          tipo: 'ENTRADA_AJUSTE',
          almacen_id: venta.almacen_id as string,
          variante_id: l.variante_id,
          cantidad: l.cantidad,
          costo_unitario: Number(l.precio_unitario),
          costo_total: Number(l.precio_unitario) * l.cantidad,
          referencia_tipo: 'PEDIDO_WEB',
          referencia_id: p.id,
          observacion: `Cancelación pedido web ${p.numero} — stock reintegrado. Motivo: ${motivo}`,
          usuario_id: userId,
        }));
        await sb.from('kardex_movimientos').insert(kx);
      }
      // Anular la venta también (sin borrarla, queda con estado ANULADA)
      await sb.from('ventas').update({ estado: 'ANULADA' }).eq('id', p.venta_id);
    }

    const observacionFinal = [p.notas_internas, `Cancelado: ${motivo}`].filter(Boolean).join('\n');
    const { error } = await sb
      .from('pedidos_web')
      .update({ estado: 'CANCELADO', notas_internas: observacionFinal })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/pedidos-web/${id}`, '/pedidos-web', '/inventario');
  return r;
}

// ============================================================================
// HELPERS para selectores
// ============================================================================
export async function listarAlmacenesParaPedido(): Promise<{ id: string; codigo: string; nombre: string }[]> {
  const sb = (await createClient()) as unknown as AnyClient;
  // Excluir almacenes ocultos (migración 52)
  const { data } = await sb
    .from('almacenes')
    .select('id, codigo, nombre, permite_ventas')
    .eq('activo', true)
    .eq('oculto_en_selectores', false)
    .order('codigo');
  type A = { id: string; codigo: string; nombre: string; permite_ventas: boolean | null };
  return ((data ?? []) as A[]).filter((a) => a.permite_ventas !== false).map((a) => ({
    id: a.id, codigo: a.codigo, nombre: a.nombre,
  }));
}
