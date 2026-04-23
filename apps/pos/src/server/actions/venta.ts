'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@happy/db/server';

const ventaSchema = z.object({
  caja_id: z.string().uuid(),
  almacen_id: z.string().uuid(),
  cliente_id: z.string().uuid().nullable().optional(),
  documento_cliente: z.string().optional().nullable(),
  tipo_documento_cliente: z.enum(['DNI','RUC','CE','PASAPORTE']).optional().nullable(),
  nombre_cliente_rapido: z.string().optional().nullable(),
  tipo_comprobante: z.enum(['NOTA_VENTA','BOLETA','FACTURA']).default('BOLETA'),
  items: z.array(z.object({
    variante_id: z.string().uuid(),
    cantidad: z.number().int().positive(),
    precio_unitario: z.number().min(0),
    descuento_monto: z.number().min(0).default(0),
  })).min(1),
  pagos: z.array(z.object({
    metodo: z.enum(['EFECTIVO','YAPE','PLIN','TARJETA_DEBITO','TARJETA_CREDITO','TRANSFERENCIA','DEPOSITO','CREDITO','WHATSAPP_PENDIENTE']),
    monto: z.number().min(0),
    referencia: z.string().optional().nullable(),
  })).min(1),
});

export type VentaInput = z.infer<typeof ventaSchema>;
export type VentaResultado =
  | { ok: true; venta_id: string; numero: string; comprobante?: { id: string; serie: string; numero: number } }
  | { ok: false; error: string };

/**
 * Persiste una venta completa: ventas + ventas_lineas + ventas_pagos + kardex (SALIDA_VENTA)
 * + comprobante (BOLETA/FACTURA/NOTA_VENTA) en estado BORRADOR.
 * Idempotencia: usa next_correlativo de Supabase.
 */
export async function registrarVenta(input: VentaInput): Promise<VentaResultado> {
  let parsed: VentaInput;
  try {
    parsed = ventaSchema.parse(input);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  // Validaciones
  const subTotal = parsed.items.reduce((a, i) => a + (i.cantidad * i.precio_unitario - i.descuento_monto), 0);
  const totalPagado = parsed.pagos.reduce((a, p) => a + p.monto, 0);
  if (totalPagado < subTotal - 0.01) {
    return { ok: false, error: `Pago insuficiente: faltan S/ ${(subTotal - totalPagado).toFixed(2)}` };
  }

  // Caja: buscar sesión abierta o crearla con apertura por defecto
  const { data: sesion } = await sb.from('cajas_sesiones')
    .select('id').eq('caja_id', parsed.caja_id).is('cerrada_en', null).maybeSingle();
  let sesionId: string | null = sesion?.id ?? null;
  if (!sesionId) {
    const { data: caja } = await sb.from('cajas').select('monto_apertura_default').eq('id', parsed.caja_id).single();
    const { data: nueva, error: errCaja } = await sb.from('cajas_sesiones').insert({
      caja_id: parsed.caja_id,
      abierta_por: user.id,
      monto_apertura: caja?.monto_apertura_default ?? 100,
    }).select('id').single();
    if (errCaja) return { ok: false, error: `Error apertura caja: ${errCaja.message}` };
    sesionId = nueva.id;
  }

  // Generar número venta
  const { data: numVenta } = await sb.rpc('next_correlativo', { p_clave: 'VENTA', p_padding: 6 });
  const numero = `VEN-${numVenta}`;

  // Insertar venta
  const igv = +(subTotal - subTotal / 1.18).toFixed(2);
  const { data: venta, error: errVenta } = await sb.from('ventas').insert({
    numero,
    canal: 'POS',
    fecha: new Date().toISOString(),
    almacen_id: parsed.almacen_id,
    caja_sesion_id: sesionId,
    caja_id: parsed.caja_id,
    cliente_id: parsed.cliente_id ?? null,
    tipo_documento_cliente: parsed.tipo_documento_cliente ?? null,
    documento_cliente: parsed.documento_cliente ?? null,
    nombre_cliente_rapido: parsed.nombre_cliente_rapido ?? null,
    vendedor_usuario_id: user.id,
    sub_total: +(subTotal - igv).toFixed(2),
    descuento_total: parsed.items.reduce((a, i) => a + i.descuento_monto, 0),
    igv,
    total: subTotal,
    moneda: 'PEN',
    estado: 'COMPLETADA',
  }).select('id').single();
  if (errVenta) return { ok: false, error: `Error venta: ${errVenta.message}` };

  // Líneas
  const lineas = parsed.items.map((i) => ({
    venta_id: venta.id,
    variante_id: i.variante_id,
    cantidad: i.cantidad,
    precio_unitario: i.precio_unitario,
    descuento_monto: i.descuento_monto,
    igv: +(i.cantidad * i.precio_unitario - i.descuento_monto - (i.cantidad * i.precio_unitario - i.descuento_monto) / 1.18).toFixed(2),
  }));
  const { error: errLin } = await sb.from('ventas_lineas').insert(lineas);
  if (errLin) return { ok: false, error: `Error líneas: ${errLin.message}` };

  // Pagos
  const pagos = parsed.pagos.map((p) => ({
    venta_id: venta.id,
    metodo: p.metodo,
    monto: p.monto,
    referencia: p.referencia ?? null,
    estado: 'CONFIRMADO',
  }));
  await sb.from('ventas_pagos').insert(pagos);

  // Kardex SALIDA_VENTA por línea
  const movs = parsed.items.map((i) => ({
    tipo: 'SALIDA_VENTA' as const,
    almacen_id: parsed.almacen_id,
    variante_id: i.variante_id,
    cantidad: i.cantidad,
    referencia_tipo: 'VENTA',
    referencia_id: venta.id,
    usuario_id: user.id,
    observacion: `Venta POS ${numero}`,
  }));
  await sb.from('kardex_movimientos').insert(movs);

  // Crear comprobante en estado BORRADOR
  let comprobanteRes: { id: string; serie: string; numero: number } | undefined;
  if (parsed.tipo_comprobante !== 'NOTA_VENTA') {
    const { data: caja } = await sb.from('cajas').select('serie_boleta, serie_factura').eq('id', parsed.caja_id).single();
    const serie = parsed.tipo_comprobante === 'FACTURA' ? caja?.serie_factura : caja?.serie_boleta;
    if (serie) {
      const { data: numComp } = await sb.rpc('next_correlativo', { p_clave: `COMP_${serie}`, p_padding: 8 });
      const numeroNum = Number(numComp);
      const { data: comp, error: errComp } = await sb.from('comprobantes').insert({
        tipo: parsed.tipo_comprobante,
        serie,
        numero: numeroNum,
        venta_id: venta.id,
        cliente_id: parsed.cliente_id ?? null,
        tipo_documento_cliente: parsed.tipo_documento_cliente ?? null,
        numero_documento_cliente: parsed.documento_cliente ?? null,
        razon_social_cliente: parsed.nombre_cliente_rapido ?? null,
        fecha_emision: new Date().toISOString(),
        sub_total: +(subTotal - igv).toFixed(2),
        igv,
        total: subTotal,
        moneda: 'PEN',
        estado: 'BORRADOR',
        forma_pago: 'CONTADO',
      }).select('id, serie, numero').single();
      if (!errComp && comp) {
        // Líneas de comprobante
        const compLineas = parsed.items.map((i) => ({
          comprobante_id: comp.id,
          variante_id: i.variante_id,
          codigo: '',
          descripcion: '',
          cantidad: i.cantidad,
          unidad_sunat: 'NIU',
          precio_unitario: i.precio_unitario,
          descuento: i.descuento_monto,
          sub_total: +((i.cantidad * i.precio_unitario - i.descuento_monto) / 1.18).toFixed(2),
          igv: +(i.cantidad * i.precio_unitario - i.descuento_monto - (i.cantidad * i.precio_unitario - i.descuento_monto) / 1.18).toFixed(2),
          total: i.cantidad * i.precio_unitario - i.descuento_monto,
        }));
        await sb.from('comprobantes_lineas').insert(compLineas);
        await sb.from('ventas').update({ comprobante_id: comp.id }).eq('id', venta.id);
        comprobanteRes = comp;
      }
    }
  }

  revalidatePath('/venta');
  return { ok: true, venta_id: venta.id, numero, comprobante: comprobanteRes };
}

/** Cerrar caja: suma totales por método y registra cierre */
export async function cerrarCaja(sesionId: string, montoCierreEfectivo: number): Promise<{ ok: boolean; error?: string }> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  // Sumar pagos de la sesión
  const { data: ventas } = await sb.from('ventas').select('id, total').eq('caja_sesion_id', sesionId);
  const ventaIds = (ventas ?? []).map((v) => v.id);

  const totales = { EFECTIVO: 0, YAPE: 0, PLIN: 0, TARJETA: 0, TRANSFERENCIA: 0, OTROS: 0 };
  if (ventaIds.length > 0) {
    const { data: pagos } = await sb.from('ventas_pagos').select('metodo, monto').in('venta_id', ventaIds);
    for (const p of (pagos ?? [])) {
      const m = String(p.metodo);
      const monto = Number(p.monto);
      if (m === 'EFECTIVO') totales.EFECTIVO += monto;
      else if (m === 'YAPE') totales.YAPE += monto;
      else if (m === 'PLIN') totales.PLIN += monto;
      else if (m.startsWith('TARJETA')) totales.TARJETA += monto;
      else if (m === 'TRANSFERENCIA') totales.TRANSFERENCIA += monto;
      else totales.OTROS += monto;
    }
  }
  const { data: sesion } = await sb.from('cajas_sesiones').select('monto_apertura').eq('id', sesionId).single();
  const esperado = Number(sesion?.monto_apertura ?? 0) + totales.EFECTIVO;
  const diferencia = montoCierreEfectivo - esperado;

  const { error } = await sb.from('cajas_sesiones').update({
    cerrada_por: user.id,
    cerrada_en: new Date().toISOString(),
    monto_cierre_efectivo: montoCierreEfectivo,
    monto_esperado_efectivo: esperado,
    diferencia,
    total_efectivo: totales.EFECTIVO,
    total_yape: totales.YAPE,
    total_plin: totales.PLIN,
    total_tarjeta: totales.TARJETA,
    total_transferencia: totales.TRANSFERENCIA,
    total_otros: totales.OTROS,
  }).eq('id', sesionId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/cierre');
  return { ok: true };
}

export async function redirigirAVenta() {
  redirect('/venta');
}
