'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import {
  ESTADOS_B2B,
  LISTAS_PRECIO,
  CONDICIONES_PAGO,
  IGV_RATE,
  TRANSICIONES_B2B,
  precioAplicable,
  type EstadoB2B,
  type ListaPrecio,
  type PreciosVariante,
} from './b2b-helpers';

/**
 * Módulo de Pedidos B2B (Mayoristas).
 *
 * Flujo de estados:
 *   BORRADOR → PROFORMA → APROBADO → EN_PRODUCCION → PARCIAL → ENTREGADO
 *                                                       ↗
 *   En cualquier punto: → CANCELADO
 *
 * Numeración:
 *   - Pedido:   B2B-NNNNNN  (clave correlativo: 'PEDIDO_B2B', fallback 'B2B')
 *   - Despacho: DESP-NNNNNN (clave correlativo: 'DESP_B2B')
 *
 * Despachos: cada despacho parcial genera un registro en pedidos_b2b_despachos
 * y un movimiento SALIDA_VENTA en kardex_movimientos por cada línea despachada
 * (referencia_tipo='PEDIDO_B2B', referencia_id=pedido.id, referencia_linea_id=linea.id).
 *
 * Atomicidad: Supabase no expone transacciones cross-request; el rollback es
 * manual — si fallamos a mitad de un despacho, eliminamos los kardex insertados
 * (capturados por sus IDs) y revertimos cantidad_entregada al estado previo.
 *
 * Totales: sub_total de línea es GENERATED en la BD; recalculamos los totales
 * de cabecera (sub_total, igv, total) al pasar BORRADOR→PROFORMA y PROFORMA→APROBADO.
 */

// ============================================================================
// Tipos públicos
// ============================================================================

export type PedidoB2BRow = {
  id: string;
  numero: string;
  fecha: string;
  cliente_id: string;
  cliente_razon_social: string;
  vendedor_email: string | null;
  total: number;
  estado: EstadoB2B;
  lineas_count: number;
  fecha_entrega_estimada: string | null;
};

export type PedidoB2BLineaDetalle = {
  id: string;
  variante_id: string;
  sku: string;
  producto_nombre: string;
  talla: string;
  color: string | null;
  cantidad_pedida: number;
  cantidad_entregada: number;
  cantidad_pendiente: number;
  precio_unitario: number;
  descuento: number;
  sub_total: number;
  observacion: string | null;
};

export type PedidoB2BDespachoRow = {
  id: string;
  numero: string;
  fecha: string;
  almacen_id: string | null;
  almacen_codigo: string | null;
  almacen_nombre: string | null;
  observacion: string | null;
  total_lineas: number;
  total_cantidad: number;
};

export type PedidoB2BDetalle = {
  id: string;
  numero: string;
  cliente_id: string;
  cliente_razon_social: string;
  cliente_documento: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  cliente_direccion: string | null;
  vendedor_usuario_id: string | null;
  vendedor_email: string | null;
  fecha: string;
  fecha_entrega_estimada: string | null;
  estado: EstadoB2B;
  lista_precio: ListaPrecio | null;
  descuento_porcentaje: number;
  adelanto: number;
  sub_total: number;
  igv: number;
  total: number;
  condicion_pago: string | null;
  venta_id: string | null;
  proforma_pdf_url: string | null;
  observacion: string | null;
};

export type ClienteB2BItem = {
  id: string;
  razon_social: string;
  documento: string;
  tipo_cliente: string;
  lista_precio: ListaPrecio | null;
  email: string | null;
};

export type VarianteB2BItem = {
  id: string;
  sku: string;
  talla: string;
  color: string | null;
  producto_nombre: string;
  precio_aplicable: number;
  uso_fallback_precio: boolean;
  stock_actual: number;
};

// ============================================================================
// Helpers internos
// ============================================================================

const ESTADOS_TUPLE = ESTADOS_B2B;
const LISTAS_TUPLE = LISTAS_PRECIO;

/** Compone el documento legible del cliente (RUC/DNI) para mostrar en UI. */
function nombreCliente(c: {
  razon_social: string | null;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
}): string {
  if (c.razon_social) return c.razon_social;
  const partes = [c.nombres, c.apellido_paterno, c.apellido_materno].filter(Boolean);
  return partes.join(' ').trim() || '—';
}

function documentoCliente(c: {
  tipo_documento: string | null;
  numero_documento: string | null;
}): string | null {
  if (!c.numero_documento) return null;
  return `${c.tipo_documento ?? ''} ${c.numero_documento}`.trim();
}

// ============================================================================
// Listar pedidos
// ============================================================================

const listarSchema = z.object({
  estado: z.enum(ESTADOS_TUPLE).optional().or(z.literal('')),
  cliente_id: z.string().uuid().optional().or(z.literal('')),
  vendedor_id: z.string().uuid().optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type PedidosB2BFiltros = z.input<typeof listarSchema>;

type ClienteJoinMin = {
  razon_social: string | null;
  nombres: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
} | null;

type ListarRaw = {
  id: string;
  numero: string;
  fecha: string;
  cliente_id: string;
  vendedor_usuario_id: string | null;
  estado: EstadoB2B;
  total: string | number | null;
  fecha_entrega_estimada: string | null;
  cliente: ClienteJoinMin;
  lineas: Array<{ id: string }> | null;
};

export async function listarPedidosB2B(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{ rows: PedidoB2BRow[]; total: number; pagina: number; por_pagina: number }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('pedidos_b2b')
      .select(
        'id, numero, fecha, cliente_id, vendedor_usuario_id, estado, total, fecha_entrega_estimada, ' +
          'cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno), ' +
          'lineas:pedidos_b2b_lineas(id)',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false })
      .order('numero', { ascending: false });

    if (data.estado) q = q.eq('estado', data.estado);
    if (data.cliente_id) q = q.eq('cliente_id', data.cliente_id);
    if (data.vendedor_id) q = q.eq('vendedor_usuario_id', data.vendedor_id);
    if (data.desde) q = q.gte('fecha', data.desde);
    if (data.hasta) q = q.lte('fecha', data.hasta);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // Nota: no exponemos un join público a auth.users. Si el módulo de
    // usuarios provee en el futuro una vista, se puede enriquecer aquí.
    const mapped: PedidoB2BRow[] = ((rows ?? []) as unknown as ListarRaw[]).map((r) => ({
      id: r.id,
      numero: r.numero,
      fecha: r.fecha,
      cliente_id: r.cliente_id,
      cliente_razon_social: r.cliente
        ? nombreCliente(r.cliente)
        : '—',
      vendedor_email: null,
      total: Number(r.total ?? 0),
      estado: r.estado,
      lineas_count: (r.lineas ?? []).length,
      fecha_entrega_estimada: r.fecha_entrega_estimada,
    }));

    return {
      rows: mapped,
      total: Number(count ?? 0),
      pagina: data.pagina,
      por_pagina: data.por_pagina,
    };
  });
}

// ============================================================================
// Obtener pedido (detalle + líneas + despachos)
// ============================================================================

type DetalleCabRaw = {
  id: string;
  numero: string;
  cliente_id: string;
  vendedor_usuario_id: string | null;
  fecha: string;
  fecha_entrega_estimada: string | null;
  estado: EstadoB2B;
  lista_precio: ListaPrecio | null;
  descuento_porcentaje: string | number | null;
  adelanto: string | number | null;
  sub_total: string | number | null;
  igv: string | number | null;
  total: string | number | null;
  condicion_pago: string | null;
  venta_id: string | null;
  proforma_pdf_url: string | null;
  observacion: string | null;
  cliente: {
    razon_social: string | null;
    nombres: string | null;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    tipo_documento: string | null;
    numero_documento: string | null;
    email: string | null;
    telefono: string | null;
    direccion: string | null;
  } | null;
};

type DetalleLineaRaw = {
  id: string;
  variante_id: string;
  cantidad_pedida: number;
  cantidad_entregada: number | null;
  precio_unitario: string | number;
  descuento: string | number | null;
  sub_total: string | number | null;
  observacion: string | null;
  variante: {
    sku: string;
    talla: string;
    color_variante: string | null;
    color: { nombre: string } | null;
    producto: { nombre: string } | null;
  } | null;
};

type DespachoCabRaw = {
  id: string;
  numero: string;
  fecha: string;
  almacen_id: string | null;
  observacion: string | null;
  almacen: { codigo: string; nombre: string } | null;
};

export async function obtenerPedidoB2B(id: string): Promise<
  ActionResult<{
    pedido: PedidoB2BDetalle;
    lineas: PedidoB2BLineaDetalle[];
    despachos: PedidoB2BDespachoRow[];
  }>
> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('pedidos_b2b')
      .select(
        'id, numero, cliente_id, vendedor_usuario_id, fecha, fecha_entrega_estimada, estado, ' +
          'lista_precio, descuento_porcentaje, adelanto, sub_total, igv, total, condicion_pago, ' +
          'venta_id, proforma_pdf_url, observacion, ' +
          'cliente:cliente_id(razon_social, nombres, apellido_paterno, apellido_materno, ' +
          'tipo_documento, numero_documento, email, telefono, direccion)',
      )
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!cab) throw new Error('Pedido no encontrado');

    const c = cab as unknown as DetalleCabRaw;

    // Vendedor email — no expuesto desde auth.users por defecto.
    const vendedorEmail: string | null = null;

    const { data: lineasRaw, error: errLin } = await sb
      .from('pedidos_b2b_lineas')
      .select(
        'id, variante_id, cantidad_pedida, cantidad_entregada, precio_unitario, descuento, sub_total, observacion, ' +
          'variante:variante_id(sku, talla, color_variante, color:color_id(nombre), producto:producto_id(nombre))',
      )
      .eq('pedido_id', id)
      .order('id');
    if (errLin) throw new Error(errLin.message);

    const lineas: PedidoB2BLineaDetalle[] = ((lineasRaw ?? []) as unknown as DetalleLineaRaw[]).map(
      (l) => {
        const pedida = Number(l.cantidad_pedida ?? 0);
        const entregada = Number(l.cantidad_entregada ?? 0);
        const color = l.variante?.color?.nombre ?? l.variante?.color_variante ?? null;
        return {
          id: l.id,
          variante_id: l.variante_id,
          sku: l.variante?.sku ?? '—',
          producto_nombre: l.variante?.producto?.nombre ?? '—',
          talla: l.variante?.talla ?? '—',
          color,
          cantidad_pedida: pedida,
          cantidad_entregada: entregada,
          cantidad_pendiente: Math.max(0, pedida - entregada),
          precio_unitario: Number(l.precio_unitario ?? 0),
          descuento: Number(l.descuento ?? 0),
          sub_total: Number(l.sub_total ?? 0),
          observacion: l.observacion,
        };
      },
    );

    // Despachos.
    const { data: despachosRaw, error: errDesp } = await sb
      .from('pedidos_b2b_despachos')
      .select(
        'id, numero, fecha, almacen_id, observacion, almacen:almacen_id(codigo, nombre)',
      )
      .eq('pedido_id', id)
      .order('fecha', { ascending: false });
    if (errDesp) throw new Error(errDesp.message);

    // Para cada despacho, contar líneas/cantidad desde kardex_movimientos.
    const despachoIds = ((despachosRaw ?? []) as unknown as DespachoCabRaw[]).map((d) => d.id);
    const movsPorDespacho = new Map<string, { lineas: number; cantidad: number }>();
    if (despachoIds.length > 0) {
      // Recordamos en kardex: referencia_tipo='PEDIDO_B2B', observacion incluye `Despacho NRO`.
      // Para asociar al despacho exacto guardamos el nro en `observacion` del kardex.
      // Alternativa: contamos por observacion match — más simple usar lineas vivas
      // a partir del modelo cabecera-sin-líneas. Aquí dejamos counts en 0 y los
      // cálculos detallados los entrega el detalle del pedido.
      for (const id of despachoIds) movsPorDespacho.set(id, { lineas: 0, cantidad: 0 });
    }

    // Mejor: contar movs por la observación que escribimos al despachar.
    if (despachoIds.length > 0) {
      const numeros = ((despachosRaw ?? []) as unknown as DespachoCabRaw[]).map((d) => d.numero);
      const { data: kar } = await sb
        .from('kardex_movimientos')
        .select('cantidad, observacion')
        .eq('referencia_tipo', 'PEDIDO_B2B')
        .eq('referencia_id', id)
        .in('observacion', numeros.map((n) => `Despacho ${n}`));
      for (const m of (kar ?? []) as { cantidad: string | number; observacion: string | null }[]) {
        const matchNumero = (m.observacion ?? '').replace('Despacho ', '');
        const d = ((despachosRaw ?? []) as unknown as DespachoCabRaw[]).find(
          (x) => x.numero === matchNumero,
        );
        if (!d) continue;
        const acc = movsPorDespacho.get(d.id) ?? { lineas: 0, cantidad: 0 };
        acc.lineas += 1;
        acc.cantidad += Number(m.cantidad ?? 0);
        movsPorDespacho.set(d.id, acc);
      }
    }

    const despachos: PedidoB2BDespachoRow[] = ((despachosRaw ?? []) as unknown as DespachoCabRaw[]).map(
      (d) => {
        const acc = movsPorDespacho.get(d.id) ?? { lineas: 0, cantidad: 0 };
        return {
          id: d.id,
          numero: d.numero,
          fecha: d.fecha,
          almacen_id: d.almacen_id,
          almacen_codigo: d.almacen?.codigo ?? null,
          almacen_nombre: d.almacen?.nombre ?? null,
          observacion: d.observacion,
          total_lineas: acc.lineas,
          total_cantidad: acc.cantidad,
        };
      },
    );

    const pedido: PedidoB2BDetalle = {
      id: c.id,
      numero: c.numero,
      cliente_id: c.cliente_id,
      cliente_razon_social: c.cliente ? nombreCliente(c.cliente) : '—',
      cliente_documento: c.cliente ? documentoCliente(c.cliente) : null,
      cliente_email: c.cliente?.email ?? null,
      cliente_telefono: c.cliente?.telefono ?? null,
      cliente_direccion: c.cliente?.direccion ?? null,
      vendedor_usuario_id: c.vendedor_usuario_id,
      vendedor_email: vendedorEmail,
      fecha: c.fecha,
      fecha_entrega_estimada: c.fecha_entrega_estimada,
      estado: c.estado,
      lista_precio: c.lista_precio,
      descuento_porcentaje: Number(c.descuento_porcentaje ?? 0),
      adelanto: Number(c.adelanto ?? 0),
      sub_total: Number(c.sub_total ?? 0),
      igv: Number(c.igv ?? 0),
      total: Number(c.total ?? 0),
      condicion_pago: c.condicion_pago,
      venta_id: c.venta_id,
      proforma_pdf_url: c.proforma_pdf_url,
      observacion: c.observacion,
    };

    return { pedido, lineas, despachos };
  });
}

// ============================================================================
// Catálogos (clientes / variantes)
// ============================================================================

export async function listarClientesB2B(): Promise<ActionResult<ClienteB2BItem[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('clientes')
      .select(
        'id, razon_social, nombres, apellido_paterno, apellido_materno, tipo_documento, numero_documento, email, tipo_cliente, lista_precio, activo',
      )
      .eq('activo', true)
      .order('razon_social');
    if (error) throw new Error(error.message);

    type Row = {
      id: string;
      razon_social: string | null;
      nombres: string | null;
      apellido_paterno: string | null;
      apellido_materno: string | null;
      tipo_documento: string | null;
      numero_documento: string | null;
      email: string | null;
      tipo_cliente: string | null;
      lista_precio: string | null;
    };
    return ((data ?? []) as Row[]).map((c) => ({
      id: c.id,
      razon_social: nombreCliente(c),
      documento: documentoCliente(c) ?? '—',
      tipo_cliente: c.tipo_cliente ?? 'PUBLICO_FINAL',
      lista_precio:
        c.lista_precio && (LISTAS_TUPLE as readonly string[]).includes(c.lista_precio)
          ? (c.lista_precio as ListaPrecio)
          : null,
      email: c.email,
    }));
  });
}

type VarianteRaw = {
  id: string;
  sku: string;
  talla: string;
  color_variante: string | null;
  activo: boolean;
  precio_publico: string | number | null;
  precio_mayorista_a: string | number | null;
  precio_mayorista_b: string | number | null;
  precio_mayorista_c: string | number | null;
  precio_industrial: string | number | null;
  color: { nombre: string } | null;
  producto: { nombre: string; activo: boolean } | null;
};

export async function listarVariantesParaB2B(
  lista: ListaPrecio,
): Promise<ActionResult<VarianteB2BItem[]>> {
  return runAction(async () => {
    if (!(LISTAS_TUPLE as readonly string[]).includes(lista)) {
      throw new Error('Lista de precio inválida');
    }
    const { sb } = await requireUser();

    const { data, error } = await sb
      .from('productos_variantes')
      .select(
        'id, sku, talla, color_variante, activo, ' +
          'precio_publico, precio_mayorista_a, precio_mayorista_b, precio_mayorista_c, precio_industrial, ' +
          'color:color_id(nombre), ' +
          'producto:producto_id(nombre, activo)',
      )
      .eq('activo', true)
      .order('sku')
      .limit(1000);
    if (error) throw new Error(error.message);

    // Stock actual sumado por variante (todos los almacenes).
    const ids = ((data ?? []) as unknown as VarianteRaw[]).map((v) => v.id);
    const stockMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: stocks } = await sb
        .from('stock_actual')
        .select('variante_id, cantidad')
        .in('variante_id', ids);
      for (const s of (stocks ?? []) as { variante_id: string | null; cantidad: string | number }[]) {
        if (!s.variante_id) continue;
        stockMap.set(s.variante_id, (stockMap.get(s.variante_id) ?? 0) + Number(s.cantidad ?? 0));
      }
    }

    return ((data ?? []) as unknown as VarianteRaw[])
      .filter((v) => v.producto?.activo !== false)
      .map((v) => {
        const precios: PreciosVariante = {
          precio_publico: v.precio_publico != null ? Number(v.precio_publico) : null,
          precio_mayorista_a: v.precio_mayorista_a != null ? Number(v.precio_mayorista_a) : null,
          precio_mayorista_b: v.precio_mayorista_b != null ? Number(v.precio_mayorista_b) : null,
          precio_mayorista_c: v.precio_mayorista_c != null ? Number(v.precio_mayorista_c) : null,
          precio_industrial: v.precio_industrial != null ? Number(v.precio_industrial) : null,
        };
        const { precio, usoFallback } = precioAplicable(precios, lista);
        return {
          id: v.id,
          sku: v.sku,
          talla: v.talla,
          color: v.color?.nombre ?? v.color_variante ?? null,
          producto_nombre: v.producto?.nombre ?? '—',
          precio_aplicable: precio,
          uso_fallback_precio: usoFallback,
          stock_actual: stockMap.get(v.id) ?? 0,
        };
      });
  });
}

export async function listarVendedoresB2B(): Promise<
  ActionResult<Array<{ id: string; email: string | null }>>
> {
  return runAction(async () => {
    // No exponemos auth.users desde el cliente; devolvemos lista vacía y la
    // UI cae a "todos". El filtrado por vendedor sigue funcionando si se pasa
    // el uuid directo en la querystring.
    await requireUser();
    return [];
  });
}

// ============================================================================
// Crear pedido (cabecera en BORRADOR)
// ============================================================================

const crearSchema = z.object({
  cliente_id: z.string().uuid('Cliente requerido'),
  lista_precio: z.enum(LISTAS_TUPLE),
  fecha_entrega_estimada: z.string().optional().or(z.literal('')),
  condicion_pago: z.enum(CONDICIONES_PAGO).optional().or(z.literal('')),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

export type CrearPedidoB2BInput = z.input<typeof crearSchema>;

/** Genera correlativo B2B-NNNNNN; intenta clave 'PEDIDO_B2B' y cae a 'B2B' si choca. */
async function nuevoNumeroPedidoB2B(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
): Promise<string> {
  // Intento principal con clave 'PEDIDO_B2B' (no choca con otros módulos).
  for (let intento = 0; intento < 3; intento += 1) {
    const clave = intento === 0 ? 'PEDIDO_B2B' : intento === 1 ? 'B2B' : 'PEDIDO_B2B';
    const { data: nro, error } = await sb.rpc('next_correlativo', {
      p_clave: clave,
      p_padding: 6,
    });
    if (error) {
      if (intento < 2) continue;
      throw new Error(`No se pudo generar correlativo: ${error.message}`);
    }
    const numero = `B2B-${nro}`;
    // Verificar que no existe (otra fila pudo haberlo tomado por race con clave nueva).
    const { data: existente } = await sb
      .from('pedidos_b2b')
      .select('id')
      .eq('numero', numero)
      .maybeSingle();
    if (!existente) return numero;
  }
  throw new Error('No se pudo generar correlativo único para el pedido');
}

export async function crearPedidoB2B(
  input: CrearPedidoB2BInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const r = await runAction(async () => {
    const data = crearSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Cliente debe existir y estar activo.
    const { data: cli, error: errCli } = await sb
      .from('clientes')
      .select('id, activo')
      .eq('id', data.cliente_id)
      .single();
    if (errCli) throw new Error(errCli.message);
    if (!cli?.activo) throw new Error('Cliente inactivo');

    const numero = await nuevoNumeroPedidoB2B(sb);

    const { data: cab, error: errCab } = await sb
      .from('pedidos_b2b')
      .insert({
        numero,
        cliente_id: data.cliente_id,
        vendedor_usuario_id: userId,
        estado: 'BORRADOR',
        lista_precio: data.lista_precio,
        fecha_entrega_estimada: data.fecha_entrega_estimada || null,
        condicion_pago: data.condicion_pago || null,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errCab) throw new Error(errCab.message);

    return { id: cab.id as string, numero };
  });

  if (r.ok) await bumpPaths('/b2b');
  return r;
}

// ============================================================================
// Líneas (solo BORRADOR)
// ============================================================================

const agregarLineaSchema = z.object({
  variante_id: z.string().uuid('Variante requerida'),
  cantidad_pedida: z.coerce.number().int().positive('Cantidad debe ser > 0'),
  descuento: z.coerce.number().min(0).max(100).optional(),
  observacion: z.string().max(300).optional().or(z.literal('')),
});

export type AgregarLineaB2BInput = z.input<typeof agregarLineaSchema>;

export async function agregarLineaPedido(
  pedidoId: string,
  input: AgregarLineaB2BInput,
): Promise<ActionResult<{ id: string; precio_unitario: number; uso_fallback: boolean }>> {
  const r = await runAction(async () => {
    if (!pedidoId) throw new Error('Pedido requerido');
    const data = agregarLineaSchema.parse(input);
    const { sb } = await requireUser();

    // Validar estado.
    const { data: cab, error: errCab } = await sb
      .from('pedidos_b2b')
      .select('id, estado, lista_precio')
      .eq('id', pedidoId)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (cab.estado !== 'BORRADOR') {
      throw new Error('Solo se pueden agregar líneas si el pedido está en BORRADOR');
    }
    const lista = (cab.lista_precio as ListaPrecio | null) ?? 'PUBLICO';

    // Resolver precio desde la lista.
    const { data: variante, error: errVar } = await sb
      .from('productos_variantes')
      .select(
        'id, activo, precio_publico, precio_mayorista_a, precio_mayorista_b, precio_mayorista_c, precio_industrial',
      )
      .eq('id', data.variante_id)
      .single();
    if (errVar) throw new Error(errVar.message);
    if (!variante.activo) throw new Error('Variante inactiva');

    const precios: PreciosVariante = {
      precio_publico: variante.precio_publico != null ? Number(variante.precio_publico) : null,
      precio_mayorista_a:
        variante.precio_mayorista_a != null ? Number(variante.precio_mayorista_a) : null,
      precio_mayorista_b:
        variante.precio_mayorista_b != null ? Number(variante.precio_mayorista_b) : null,
      precio_mayorista_c:
        variante.precio_mayorista_c != null ? Number(variante.precio_mayorista_c) : null,
      precio_industrial: variante.precio_industrial != null ? Number(variante.precio_industrial) : null,
    };
    const { precio, usoFallback } = precioAplicable(precios, lista);
    if (precio <= 0) {
      throw new Error('La variante no tiene precio configurado en ninguna lista');
    }

    const { data: inserted, error: errIns } = await sb
      .from('pedidos_b2b_lineas')
      .insert({
        pedido_id: pedidoId,
        variante_id: data.variante_id,
        cantidad_pedida: data.cantidad_pedida,
        precio_unitario: precio,
        descuento: data.descuento ?? 0,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errIns) throw new Error(errIns.message);

    return {
      id: inserted.id as string,
      precio_unitario: precio,
      uso_fallback: usoFallback,
    };
  });

  if (r.ok) await bumpPaths('/b2b', `/b2b/${pedidoId}`);
  return r;
}

const actualizarLineaSchema = z.object({
  cantidad_pedida: z.coerce.number().int().positive().optional(),
  precio_unitario: z.coerce.number().min(0).optional(),
  descuento: z.coerce.number().min(0).max(100).optional(),
  observacion: z.string().max(300).optional().or(z.literal('')),
});

export type ActualizarLineaB2BInput = z.input<typeof actualizarLineaSchema>;

export async function actualizarLineaPedido(
  lineaId: string,
  patch: ActualizarLineaB2BInput,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!lineaId) throw new Error('Línea requerida');
    const data = actualizarLineaSchema.parse(patch);
    const { sb } = await requireUser();

    const { data: lin, error: errLin } = await sb
      .from('pedidos_b2b_lineas')
      .select('id, pedido_id, pedido:pedido_id(estado)')
      .eq('id', lineaId)
      .single();
    if (errLin) throw new Error(errLin.message);
    const t = lin as unknown as {
      id: string;
      pedido_id: string;
      pedido: { estado: EstadoB2B } | null;
    };
    if (t.pedido?.estado !== 'BORRADOR') {
      throw new Error('Solo se pueden editar líneas si el pedido está en BORRADOR');
    }

    const updatePayload: {
      cantidad_pedida?: number;
      precio_unitario?: number;
      descuento?: number;
      observacion?: string | null;
    } = {};
    if (data.cantidad_pedida != null) updatePayload.cantidad_pedida = data.cantidad_pedida;
    if (data.precio_unitario != null) updatePayload.precio_unitario = data.precio_unitario;
    if (data.descuento != null) updatePayload.descuento = data.descuento;
    if (data.observacion !== undefined) {
      updatePayload.observacion = data.observacion?.trim() || null;
    }
    if (Object.keys(updatePayload).length === 0) {
      return { ok: true as const };
    }

    const { error: errUpd } = await sb
      .from('pedidos_b2b_lineas')
      .update(updatePayload)
      .eq('id', lineaId);
    if (errUpd) throw new Error(errUpd.message);

    await bumpPaths(`/b2b/${t.pedido_id}`);
    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/b2b');
  return r;
}

export async function eliminarLineaPedido(
  lineaId: string,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!lineaId) throw new Error('Línea requerida');
    const { sb } = await requireUser();

    const { data: lin, error: errLin } = await sb
      .from('pedidos_b2b_lineas')
      .select('id, pedido_id, pedido:pedido_id(estado)')
      .eq('id', lineaId)
      .single();
    if (errLin) throw new Error(errLin.message);
    const t = lin as unknown as {
      id: string;
      pedido_id: string;
      pedido: { estado: EstadoB2B } | null;
    };
    if (t.pedido?.estado !== 'BORRADOR') {
      throw new Error('Solo se pueden eliminar líneas si el pedido está en BORRADOR');
    }

    const { error: errDel } = await sb.from('pedidos_b2b_lineas').delete().eq('id', lineaId);
    if (errDel) throw new Error(errDel.message);

    await bumpPaths(`/b2b/${t.pedido_id}`);
    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/b2b');
  return r;
}

// ============================================================================
// Cabecera (solo BORRADOR / PROFORMA)
// ============================================================================

const actualizarCabSchema = z.object({
  fecha_entrega_estimada: z.string().optional().or(z.literal('')),
  descuento_porcentaje: z.coerce.number().min(0).max(100).optional(),
  condicion_pago: z.enum(CONDICIONES_PAGO).optional().or(z.literal('')),
  observacion: z.string().max(500).optional().or(z.literal('')),
  adelanto: z.coerce.number().min(0).optional(),
});

export type ActualizarCabeceraB2BInput = z.input<typeof actualizarCabSchema>;

export async function actualizarPedidoCabecera(
  id: string,
  patch: ActualizarCabeceraB2BInput,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const data = actualizarCabSchema.parse(patch);
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('pedidos_b2b')
      .select('id, estado')
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!['BORRADOR', 'PROFORMA'].includes(cab.estado as string)) {
      throw new Error('Solo se pueden editar pedidos en BORRADOR o PROFORMA');
    }

    const update: {
      fecha_entrega_estimada?: string | null;
      descuento_porcentaje?: number;
      condicion_pago?: string | null;
      observacion?: string | null;
      adelanto?: number;
    } = {};
    if (data.fecha_entrega_estimada !== undefined) {
      update.fecha_entrega_estimada = data.fecha_entrega_estimada || null;
    }
    if (data.descuento_porcentaje != null) update.descuento_porcentaje = data.descuento_porcentaje;
    if (data.condicion_pago !== undefined) update.condicion_pago = data.condicion_pago || null;
    if (data.observacion !== undefined) update.observacion = data.observacion?.trim() || null;
    if (data.adelanto != null) update.adelanto = data.adelanto;
    if (Object.keys(update).length === 0) return { ok: true as const };

    const { error: errUpd } = await sb.from('pedidos_b2b').update(update).eq('id', id);
    if (errUpd) throw new Error(errUpd.message);

    // Si cambió el descuento global o el adelanto, recalcular totales (afecta IGV).
    if (data.descuento_porcentaje != null) {
      await recalcularTotalesInterno(sb, id);
    }

    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/b2b', `/b2b/${id}`);
  return r;
}

// ============================================================================
// Recalcular totales
// ============================================================================

/** Recalcula sub_total/igv/total del pedido (usa sub_total GENERATED de líneas). */
async function recalcularTotalesInterno(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  pedidoId: string,
): Promise<{ sub_total: number; igv: number; total: number }> {
  const { data: cab, error: errCab } = await sb
    .from('pedidos_b2b')
    .select('id, descuento_porcentaje')
    .eq('id', pedidoId)
    .single();
  if (errCab) throw new Error(errCab.message);

  const { data: lineas, error: errLin } = await sb
    .from('pedidos_b2b_lineas')
    .select('sub_total')
    .eq('pedido_id', pedidoId);
  if (errLin) throw new Error(errLin.message);

  const subTotalLineas = (lineas ?? []).reduce(
    (s, l) => s + Number((l as { sub_total: string | number | null }).sub_total ?? 0),
    0,
  );
  const descPct = Number(cab.descuento_porcentaje ?? 0);
  const descMonto = Math.round(((subTotalLineas * descPct) / 100) * 100) / 100;
  const baseImponible = Math.max(0, subTotalLineas - descMonto);
  const igv = Math.round(baseImponible * IGV_RATE * 100) / 100;
  const total = Math.round((baseImponible + igv) * 100) / 100;
  const subTotalRounded = Math.round(subTotalLineas * 100) / 100;

  const { error: errUpd } = await sb
    .from('pedidos_b2b')
    .update({ sub_total: subTotalRounded, igv, total })
    .eq('id', pedidoId);
  if (errUpd) throw new Error(errUpd.message);

  return { sub_total: subTotalRounded, igv, total };
}

export async function recalcularTotales(
  id: string,
): Promise<ActionResult<{ sub_total: number; igv: number; total: number }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();
    return recalcularTotalesInterno(sb, id);
  });
  if (r.ok) await bumpPaths('/b2b', `/b2b/${id}`);
  return r;
}

// ============================================================================
// Cambiar estado
// ============================================================================

const cambiarEstadoSchema = z.object({
  motivo: z.string().max(500).optional().or(z.literal('')),
});

export type CambiarEstadoB2BOpciones = z.input<typeof cambiarEstadoSchema>;

export async function cambiarEstadoB2B(
  id: string,
  nuevoEstado: EstadoB2B,
  opciones?: CambiarEstadoB2BOpciones,
): Promise<ActionResult<{ ok: true; estado: EstadoB2B }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    if (!(ESTADOS_TUPLE as readonly string[]).includes(nuevoEstado)) {
      throw new Error('Estado inválido');
    }
    const opts = cambiarEstadoSchema.parse(opciones ?? {});
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('pedidos_b2b')
      .select('id, estado, observacion')
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);

    const actual = cab.estado as EstadoB2B;
    const transiciones = TRANSICIONES_B2B[actual] ?? [];
    if (!transiciones.includes(nuevoEstado)) {
      throw new Error(`No se puede pasar de ${actual} a ${nuevoEstado}`);
    }

    // Validación: pasar a APROBADO o PROFORMA requiere al menos una línea.
    if (nuevoEstado === 'PROFORMA' || nuevoEstado === 'APROBADO') {
      const { count } = await sb
        .from('pedidos_b2b_lineas')
        .select('id', { count: 'exact', head: true })
        .eq('pedido_id', id);
      if ((count ?? 0) === 0) {
        throw new Error('El pedido no tiene líneas — agrega productos antes de avanzar');
      }
    }

    // Recalcular totales antes de cambiar a PROFORMA/APROBADO (asegura consistencia).
    if (nuevoEstado === 'PROFORMA' || nuevoEstado === 'APROBADO') {
      await recalcularTotalesInterno(sb, id);
    }

    const update: { estado: EstadoB2B; observacion?: string | null } = { estado: nuevoEstado };
    if (opts.motivo && opts.motivo.trim()) {
      const prev = (cab.observacion as string | null) ?? '';
      const stamp = `[${actual}→${nuevoEstado}] ${opts.motivo.trim()}`;
      update.observacion = prev ? `${prev}\n${stamp}` : stamp;
    }

    const { error: errUpd } = await sb
      .from('pedidos_b2b')
      .update(update)
      .eq('id', id)
      .eq('estado', actual);
    if (errUpd) throw new Error(errUpd.message);

    return { ok: true as const, estado: nuevoEstado };
  });

  if (r.ok) await bumpPaths('/b2b', `/b2b/${id}`);
  return r;
}

// ============================================================================
// Registrar despacho
// ============================================================================

const lineaDespachoSchema = z.object({
  linea_id: z.string().uuid('Línea inválida'),
  cantidad: z.coerce.number().int().positive('Cantidad debe ser > 0'),
});

const despachoSchema = z.object({
  almacen_id: z.string().uuid('Almacén requerido'),
  lineas: z.array(lineaDespachoSchema).min(1, 'Debes despachar al menos una línea'),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

export type RegistrarDespachoB2BInput = z.input<typeof despachoSchema>;

export async function registrarDespacho(
  pedidoId: string,
  input: RegistrarDespachoB2BInput,
): Promise<ActionResult<{ id: string; numero: string; estado: EstadoB2B }>> {
  const r = await runAction(async () => {
    if (!pedidoId) throw new Error('Pedido requerido');
    const data = despachoSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Validar estado.
    const { data: cab, error: errCab } = await sb
      .from('pedidos_b2b')
      .select('id, estado')
      .eq('id', pedidoId)
      .single();
    if (errCab) throw new Error(errCab.message);
    const actual = cab.estado as EstadoB2B;
    if (!['APROBADO', 'EN_PRODUCCION', 'PARCIAL'].includes(actual)) {
      throw new Error(
        `Solo se puede despachar desde APROBADO/EN_PRODUCCION/PARCIAL (actual: ${actual})`,
      );
    }

    // Cargar TODAS las líneas del pedido (para validar y recalcular estado).
    const { data: lineasRaw, error: errLin } = await sb
      .from('pedidos_b2b_lineas')
      .select('id, variante_id, cantidad_pedida, cantidad_entregada')
      .eq('pedido_id', pedidoId);
    if (errLin) throw new Error(errLin.message);
    if (!lineasRaw || lineasRaw.length === 0) throw new Error('Pedido sin líneas');

    type LineaEstado = {
      id: string;
      variante_id: string;
      pedida: number;
      entregada: number;
    };
    const lineasMap = new Map<string, LineaEstado>();
    for (const l of lineasRaw) {
      lineasMap.set(l.id as string, {
        id: l.id as string,
        variante_id: l.variante_id as string,
        pedida: Number(l.cantidad_pedida ?? 0),
        entregada: Number(l.cantidad_entregada ?? 0),
      });
    }

    // Validar cantidades a despachar.
    for (const ld of data.lineas) {
      const ref = lineasMap.get(ld.linea_id);
      if (!ref) throw new Error(`Línea no pertenece al pedido: ${ld.linea_id}`);
      const pendiente = ref.pedida - ref.entregada;
      if (ld.cantidad > pendiente) {
        throw new Error(
          `Línea ${ref.variante_id}: cantidad a despachar (${ld.cantidad}) > pendiente (${pendiente})`,
        );
      }
    }

    // Correlativo despacho.
    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', {
      p_clave: 'DESP_B2B',
      p_padding: 6,
    });
    if (errNro) throw new Error(`No se pudo generar correlativo de despacho: ${errNro.message}`);
    const numeroDesp = `DESP-${nro}`;

    // Insertar cabecera de despacho.
    const { data: cabDesp, error: errDesp } = await sb
      .from('pedidos_b2b_despachos')
      .insert({
        numero: numeroDesp,
        pedido_id: pedidoId,
        almacen_id: data.almacen_id,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errDesp) throw new Error(errDesp.message);
    const despachoId = cabDesp.id as string;

    // Insertar movimientos kardex (uno por línea despachada).
    const movimientos = data.lineas.map((ld) => {
      const ref = lineasMap.get(ld.linea_id)!;
      return {
        tipo: 'SALIDA_VENTA' as const,
        almacen_id: data.almacen_id,
        variante_id: ref.variante_id,
        cantidad: ld.cantidad,
        referencia_tipo: 'PEDIDO_B2B',
        referencia_id: pedidoId,
        referencia_linea_id: ld.linea_id,
        usuario_id: userId,
        observacion: `Despacho ${numeroDesp}`,
      };
    });

    const { data: insertados, error: errKar } = await sb
      .from('kardex_movimientos')
      .insert(movimientos)
      .select('id');
    if (errKar) {
      // Rollback cabecera despacho.
      await sb.from('pedidos_b2b_despachos').delete().eq('id', despachoId);
      throw new Error(`No se pudo registrar kardex: ${errKar.message}`);
    }
    const insertadosIds = ((insertados ?? []) as { id: number | string }[]).map((x) => x.id);

    // Actualizar cantidad_entregada en cada línea.
    const updatedLineaIds: string[] = [];
    const previas = new Map<string, number>();
    try {
      for (const ld of data.lineas) {
        const ref = lineasMap.get(ld.linea_id)!;
        previas.set(ld.linea_id, ref.entregada);
        const nueva = ref.entregada + ld.cantidad;
        const { error: errUpdLin } = await sb
          .from('pedidos_b2b_lineas')
          .update({ cantidad_entregada: nueva })
          .eq('id', ld.linea_id);
        if (errUpdLin) throw new Error(errUpdLin.message);
        ref.entregada = nueva;
        updatedLineaIds.push(ld.linea_id);
      }
    } catch (e) {
      // Rollback kardex y líneas que sí se actualizaron.
      if (insertadosIds.length > 0) {
        await sb
          .from('kardex_movimientos')
          .delete()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .in('id', insertadosIds as any);
      }
      for (const id2 of updatedLineaIds) {
        const prev = previas.get(id2);
        if (prev != null) {
          await sb.from('pedidos_b2b_lineas').update({ cantidad_entregada: prev }).eq('id', id2);
        }
      }
      await sb.from('pedidos_b2b_despachos').delete().eq('id', despachoId);
      throw e instanceof Error ? e : new Error('No se pudo actualizar cantidades entregadas');
    }

    // Recalcular estado del pedido.
    const todasEntregadas = Array.from(lineasMap.values()).every(
      (l) => l.entregada >= l.pedida,
    );
    const algoEntregado = Array.from(lineasMap.values()).some((l) => l.entregada > 0);
    let nuevoEstado: EstadoB2B = actual;
    if (todasEntregadas) nuevoEstado = 'ENTREGADO';
    else if (algoEntregado) nuevoEstado = 'PARCIAL';

    if (nuevoEstado !== actual) {
      // Validar que la transición sea legal (debería serlo desde APROBADO/EN_PRODUCCION/PARCIAL).
      const permitidas = TRANSICIONES_B2B[actual] ?? [];
      if (permitidas.includes(nuevoEstado)) {
        const { error: errUpdEst } = await sb
          .from('pedidos_b2b')
          .update({ estado: nuevoEstado })
          .eq('id', pedidoId)
          .eq('estado', actual);
        if (errUpdEst) {
          // No bloqueamos el despacho — los movimientos quedaron registrados.
          // El usuario verá el estado anterior y podrá refrescar/avanzar manual.
        }
      }
    }

    return { id: despachoId, numero: numeroDesp, estado: nuevoEstado };
  });

  if (r.ok) {
    await bumpPaths('/b2b', `/b2b/${pedidoId}`, '/kardex', '/inventario');
  }
  return r;
}
