'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const ESTADOS = ['BORRADOR','PLANIFICADA','EN_CORTE','EN_HABILITADO','EN_SERVICIO','EN_DECORADO','EN_CONTROL_CALIDAD','COMPLETADA','CANCELADA'] as const;

export async function cambiarEstadoOT(otId: string, nuevoEstado: typeof ESTADOS[number], detalle?: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    const { data: actual } = await sb.from('ot').select('estado').eq('id', otId).single();
    if (!actual) throw new Error('OT no encontrada');

    const { error: errUpd } = await sb.from('ot').update({ estado: nuevoEstado }).eq('id', otId);
    if (errUpd) throw new Error(errUpd.message);

    await sb.from('ot_eventos').insert({
      ot_id: otId,
      tipo: 'ESTADO_CAMBIO',
      estado_anterior: actual.estado,
      estado_nuevo: nuevoEstado,
      usuario_id: userId,
      detalle: detalle ?? `Transición ${actual.estado} → ${nuevoEstado}`,
    });
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`, '/ot');
  return r;
}

export async function agregarNotaOT(otId: string, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const detalle = String(fd.get('detalle') ?? '').trim();
    if (!detalle) throw new Error('Nota vacía');
    const { sb, userId } = await requireUser();
    const { error } = await sb.from('ot_eventos').insert({
      ot_id: otId,
      tipo: 'NOTA',
      usuario_id: userId,
      detalle,
    });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

const otSchema = z.object({
  fecha_entrega_objetivo: z.string().optional().or(z.literal('')),
  prioridad: z.coerce.number().int().min(0).default(100),
  observacion: z.string().optional().or(z.literal('')),
});

export async function actualizarOT(otId: string, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = otSchema.parse({
      fecha_entrega_objetivo: fd.get('fecha_entrega_objetivo') || '',
      prioridad: fd.get('prioridad') || 100,
      observacion: fd.get('observacion') || '',
    });
    const { sb } = await requireUser();
    const { error } = await sb.from('ot').update({
      fecha_entrega_objetivo: data.fecha_entrega_objetivo || null,
      prioridad: data.prioridad,
      observacion: data.observacion || null,
    }).eq('id', otId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

export async function declararProduccion(otId: string, lineaId: string, cantidadCortada: number, cantidadFallas: number): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('ot_lineas').update({
      cantidad_cortada: cantidadCortada,
      cantidad_fallas: cantidadFallas,
    }).eq('id', lineaId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

/**
 * Cierra la OT: declara las prendas terminadas, crea lote PT y registra
 * entradas en kardex del almacén PT.
 */
export async function cerrarOT(otId: string, almacenDestinoId: string): Promise<ActionResult<{ lotes: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    const { data: ot } = await sb.from('ot').select('numero, estado').eq('id', otId).single();
    if (!ot) throw new Error('OT no encontrada');
    if (ot.estado === 'COMPLETADA' || ot.estado === 'CANCELADA') throw new Error('OT ya cerrada');

    const { data: lineas } = await sb.from('ot_lineas')
      .select('id, producto_id, talla, cantidad_cortada, cantidad_terminada, cantidad_fallas')
      .eq('ot_id', otId);
    if (!lineas || lineas.length === 0) throw new Error('OT sin líneas');

    // Crear ingreso PT
    const { data: numIng } = await sb.rpc('next_correlativo', { p_clave: 'INGPT', p_padding: 6 });
    const { data: ing, error: errIng } = await sb.from('ingresos_pt').insert({
      numero: `INGPT-${numIng}`,
      ot_id: otId,
      almacen_destino: almacenDestinoId,
      declarado_por: userId,
      observacion: `Cierre de OT ${ot.numero}`,
    }).select('id').single();
    if (errIng) throw new Error(errIng.message);

    let lotes = 0;
    for (const l of lineas) {
      const cantTerminada = Number(l.cantidad_terminada ?? l.cantidad_cortada ?? 0) - Number(l.cantidad_fallas ?? 0);
      if (cantTerminada <= 0) continue;

      // Buscar variante
      const { data: variante } = await sb.from('productos_variantes')
        .select('id, sku, precio_costo_estandar')
        .eq('producto_id', l.producto_id).eq('talla', l.talla).maybeSingle();
      if (!variante) continue;

      // Crear lote PT
      const { data: numLote } = await sb.rpc('next_correlativo', { p_clave: 'LOTPT', p_padding: 6 });
      const codigoLote = `LT-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${variante.sku}-${numLote}`;
      const { data: lote, error: errLot } = await sb.from('lotes_pt').insert({
        codigo: codigoLote,
        ot_id: otId,
        ingreso_pt_id: ing.id,
        variante_id: variante.id,
        cantidad_inicial: cantTerminada,
        cantidad_actual: cantTerminada,
        costo_unitario: variante.precio_costo_estandar,
        almacen_actual: almacenDestinoId,
        estado: 'DISPONIBLE',
      }).select('id').single();
      if (errLot) throw new Error(errLot.message);

      // Línea de ingreso
      await sb.from('ingresos_pt_lineas').insert({
        ingreso_id: ing.id,
        variante_id: variante.id,
        cantidad: cantTerminada,
        cantidad_falla: l.cantidad_fallas ?? 0,
        costo_unitario_total: variante.precio_costo_estandar,
        lote_pt_id: lote.id,
      });

      // Movimiento de kardex (entrada)
      await sb.from('kardex_movimientos').insert({
        tipo: 'ENTRADA_PRODUCCION',
        almacen_id: almacenDestinoId,
        variante_id: variante.id,
        cantidad: cantTerminada,
        costo_unitario: variante.precio_costo_estandar,
        costo_total: cantTerminada * Number(variante.precio_costo_estandar ?? 0),
        referencia_tipo: 'INGRESO_PT',
        referencia_id: ing.id,
        usuario_id: userId,
        lote_pt_id: lote.id,
        observacion: `Cierre OT ${ot.numero}`,
      });

      // Evento trazabilidad
      await sb.from('trazabilidad_eventos').insert({
        lote_pt_id: lote.id,
        variante_id: variante.id,
        tipo: 'PRODUCCION',
        almacen_destino: almacenDestinoId,
        ot_id: otId,
        usuario_id: userId,
        cantidad: cantTerminada,
        observacion: `Producción cerrada de OT ${ot.numero}`,
      });

      // Actualizar línea con cantidad_terminada
      await sb.from('ot_lineas').update({ cantidad_terminada: cantTerminada }).eq('id', l.id);

      lotes++;
    }

    // Cambiar estado OT
    await sb.from('ot').update({ estado: 'COMPLETADA', fecha_cierre: new Date().toISOString().slice(0,10) }).eq('id', otId);
    await sb.from('ot_eventos').insert({
      ot_id: otId,
      tipo: 'ESTADO_CAMBIO',
      estado_nuevo: 'COMPLETADA',
      usuario_id: userId,
      detalle: `Cierre de OT con ${lotes} lote(s) PT generados`,
    });

    return { lotes };
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`, '/ot', '/inventario', '/kardex');
  return r;
}
