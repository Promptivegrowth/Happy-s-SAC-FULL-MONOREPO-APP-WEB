'use server';

/**
 * Cotizaciones del POS (pedido del cliente 21/07/2026).
 *
 * El cajero arma un carrito, lo guarda como COTIZACIÓN con vigencia (default
 * 20 días) y precios CONGELADOS. Después puede buscarla por número o cliente
 * y convertirla en venta (boleta/factura) cargando esos mismos precios.
 *
 * No mueve stock ni caja: es un documento comercial. El stock se valida
 * recién al cobrar la venta.
 */

import { createClient } from '@happy/db/server';

async function requireUser(sb: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any; rpc: (fn: string, args: any) => any };

export type CotizacionLineaInput = {
  variante_id: string;
  sku: string;
  producto_nombre: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
};

export type GuardarCotizacionInput = {
  cliente_id?: string | null;
  cliente_nombre?: string;
  cliente_documento?: string;
  cliente_telefono?: string;
  vigencia_dias?: number;
  vendedor_id?: string | null;
  vendedor_nombre?: string;
  caja_id?: string | null;
  notas?: string;
  lineas: CotizacionLineaInput[];
};

/** Guarda una cotización con sus líneas (precios congelados). */
export async function guardarCotizacion(
  input: GuardarCotizacionInput,
): Promise<{ ok: boolean; id?: string; numero?: string; error?: string }> {
  try {
    const sb = (await createClient()) as unknown as AnyClient & Awaited<ReturnType<typeof createClient>>;
    const user = await requireUser(sb);
    if (!input.lineas || input.lineas.length === 0) {
      return { ok: false, error: 'La cotización no tiene productos.' };
    }

    const vigencia = Number(input.vigencia_dias ?? 20) || 20;
    // Total (los precios ya incluyen IGV en el POS). Subtotal/IGV informativos.
    const total = input.lineas.reduce((s, l) => s + Number(l.precio_unitario) * Number(l.cantidad), 0);
    const subtotal = Math.round((total / 1.18) * 100) / 100;
    const igv = Math.round((total - subtotal) * 100) / 100;

    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', { p_clave: 'COT', p_padding: 5 });
    if (errNro) throw new Error(`Correlativo: ${errNro.message}`);
    const numero = `COT-${nro as unknown as string}`;

    const venceEl = new Date(Date.now() + vigencia * 86400_000).toISOString().slice(0, 10);

    const { data: cot, error: errC } = await sb
      .from('cotizaciones')
      .insert({
        numero,
        cliente_id: input.cliente_id || null,
        cliente_nombre: input.cliente_nombre || null,
        cliente_documento: input.cliente_documento || null,
        cliente_telefono: input.cliente_telefono || null,
        vigencia_dias: vigencia,
        vence_el: venceEl,
        subtotal,
        igv,
        total,
        vendedor_id: input.vendedor_id || null,
        vendedor_nombre: input.vendedor_nombre || null,
        caja_id: input.caja_id || null,
        notas: input.notas || null,
        estado: 'VIGENTE',
        creada_por: user.id,
      })
      .select('id, numero')
      .single();
    if (errC) throw new Error(errC.message);

    const filas = input.lineas.map((l) => ({
      cotizacion_id: cot.id,
      variante_id: l.variante_id,
      sku: l.sku,
      producto_nombre: l.producto_nombre,
      talla: l.talla,
      cantidad: Math.round(Number(l.cantidad)),
      precio_unitario: Number(l.precio_unitario),
      sub_total: Math.round(Number(l.precio_unitario) * Number(l.cantidad) * 100) / 100,
    }));
    const { error: errL } = await sb.from('cotizaciones_lineas').insert(filas);
    if (errL) {
      await sb.from('cotizaciones').delete().eq('id', cot.id);
      throw new Error(errL.message);
    }

    return { ok: true, id: cot.id as string, numero: cot.numero as string };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type CotizacionResumen = {
  id: string;
  numero: string;
  cliente_nombre: string | null;
  total: number;
  fecha: string;
  vence_el: string;
  estado: string;
  vencida: boolean;
  items: number;
};

/** Lista cotizaciones (últimas 60), con búsqueda por número o cliente. */
export async function buscarCotizaciones(q?: string): Promise<CotizacionResumen[]> {
  const sb = (await createClient()) as unknown as AnyClient;
  let query = sb
    .from('cotizaciones')
    .select('id, numero, cliente_nombre, total, fecha, vence_el, estado, cotizaciones_lineas(id)')
    .order('fecha', { ascending: false })
    .limit(60);
  const term = (q ?? '').trim();
  if (term) {
    // número o nombre de cliente
    query = query.or(`numero.ilike.%${term}%,cliente_nombre.ilike.%${term}%`);
  }
  const { data } = await query;
  const hoy = new Date().toISOString().slice(0, 10);
  type Row = {
    id: string; numero: string; cliente_nombre: string | null; total: number | string;
    fecha: string; vence_el: string; estado: string; cotizaciones_lineas: { id: string }[] | null;
  };
  return ((data ?? []) as Row[]).map((c) => ({
    id: c.id,
    numero: c.numero,
    cliente_nombre: c.cliente_nombre,
    total: Number(c.total ?? 0),
    fecha: c.fecha,
    vence_el: c.vence_el,
    estado: c.estado,
    vencida: c.estado === 'VIGENTE' && c.vence_el < hoy,
    items: (c.cotizaciones_lineas ?? []).length,
  }));
}

export type CotizacionDetalle = {
  id: string;
  numero: string;
  cliente_id: string | null;
  cliente_nombre: string | null;
  cliente_documento: string | null;
  cliente_telefono: string | null;
  vence_el: string;
  estado: string;
  vencida: boolean;
  total: number;
  lineas: {
    variante_id: string;
    sku: string;
    producto_nombre: string;
    talla: string;
    cantidad: number;
    precio_unitario: number;
  }[];
};

/** Trae una cotización con sus líneas (para convertirla a venta). */
export async function obtenerCotizacion(id: string): Promise<CotizacionDetalle | null> {
  const sb = (await createClient()) as unknown as AnyClient;
  const { data } = await sb
    .from('cotizaciones')
    .select(
      'id, numero, cliente_id, cliente_nombre, cliente_documento, cliente_telefono, vence_el, estado, total, ' +
        'cotizaciones_lineas(variante_id, sku, producto_nombre, talla, cantidad, precio_unitario)',
    )
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  const hoy = new Date().toISOString().slice(0, 10);
  type L = { variante_id: string; sku: string; producto_nombre: string; talla: string; cantidad: number; precio_unitario: number | string };
  return {
    id: data.id,
    numero: data.numero,
    cliente_id: data.cliente_id,
    cliente_nombre: data.cliente_nombre,
    cliente_documento: data.cliente_documento,
    cliente_telefono: data.cliente_telefono,
    vence_el: data.vence_el,
    estado: data.estado,
    vencida: data.estado === 'VIGENTE' && data.vence_el < hoy,
    total: Number(data.total ?? 0),
    lineas: ((data.cotizaciones_lineas ?? []) as L[]).map((l) => ({
      variante_id: l.variante_id,
      sku: l.sku,
      producto_nombre: l.producto_nombre,
      talla: l.talla,
      cantidad: Number(l.cantidad),
      precio_unitario: Number(l.precio_unitario),
    })),
  };
}

/** Marca una cotización como CONVERTIDA (tras registrar la venta). */
export async function marcarCotizacionConvertida(id: string, ventaId?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = (await createClient()) as unknown as AnyClient;
    const { error } = await sb
      .from('cotizaciones')
      .update({ estado: 'CONVERTIDA', venta_id: ventaId || null })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
