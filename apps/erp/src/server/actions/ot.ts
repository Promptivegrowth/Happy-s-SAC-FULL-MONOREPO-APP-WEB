'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const ESTADOS = ['BORRADOR','PLANIFICADA','EN_CORTE','EN_HABILITADO','EN_SERVICIO','EN_DECORADO','EN_CONTROL_CALIDAD','COMPLETADA','CANCELADA'] as const;
type EstadoOT = typeof ESTADOS[number];

/**
 * Máquina de estados de la OT (server-side, espejo del FLOW del cliente).
 * CANCELADA es accesible desde cualquier estado activo (excepto cerrados).
 * COMPLETADA solo desde EN_CONTROL_CALIDAD.
 */
const FLOW_ESTADOS: Record<EstadoOT, EstadoOT[]> = {
  BORRADOR:           ['PLANIFICADA', 'CANCELADA'],
  PLANIFICADA:        ['EN_CORTE', 'CANCELADA'],
  EN_CORTE:           ['EN_HABILITADO', 'EN_SERVICIO', 'CANCELADA'],
  EN_HABILITADO:      ['EN_SERVICIO', 'CANCELADA'],
  EN_SERVICIO:        ['EN_DECORADO', 'EN_CONTROL_CALIDAD', 'CANCELADA'],
  EN_DECORADO:        ['EN_CONTROL_CALIDAD', 'CANCELADA'],
  EN_CONTROL_CALIDAD: ['COMPLETADA', 'CANCELADA'],
  COMPLETADA:         [],
  CANCELADA:          [],
};

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const agregarLineaSchema = z.object({
  producto_id: z.string().uuid(),
  talla: z.enum(TALLAS),
  cantidad_planificada: z.coerce.number().int().min(1),
});

export async function agregarLineaOT(otId: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = agregarLineaSchema.parse({
      producto_id: fd.get('producto_id'),
      talla: fd.get('talla'),
      cantidad_planificada: fd.get('cantidad_planificada'),
    });
    const { sb } = await requireUser();

    // Verificar que la OT no esté cerrada.
    const { data: ot } = await sb.from('ot').select('estado').eq('id', otId).single();
    if (!ot) throw new Error('OT no encontrada');
    if (ot.estado === 'COMPLETADA' || ot.estado === 'CANCELADA') {
      throw new Error('No se pueden agregar líneas a una OT cerrada');
    }

    const { error } = await sb.from('ot_lineas').insert({
      ot_id: otId,
      producto_id: data.producto_id,
      talla: data.talla,
      cantidad_planificada: data.cantidad_planificada,
    });
    if (error) {
      if (error.code === '23505') throw new Error('Ya existe una línea con ese producto y talla');
      throw new Error(error.message);
    }
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

export async function eliminarLineaOT(otId: string, lineaId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { data: ot } = await sb.from('ot').select('estado').eq('id', otId).single();
    if (!ot) throw new Error('OT no encontrada');
    if (ot.estado === 'COMPLETADA' || ot.estado === 'CANCELADA') {
      throw new Error('No se pueden modificar líneas de una OT cerrada');
    }
    const { error } = await sb.from('ot_lineas').delete().eq('id', lineaId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

const crearOTSchema = z.object({
  fecha_entrega_objetivo: z.string().optional().or(z.literal('')),
  prioridad: z.coerce.number().int().min(0).default(100),
  observacion: z.string().optional().or(z.literal('')),
  campana_id: z.string().uuid().optional().or(z.literal('')),
});

export async function crearOT(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const rawCampana = String(fd.get('campana_id') ?? '').trim();
    const data = crearOTSchema.parse({
      fecha_entrega_objetivo: fd.get('fecha_entrega_objetivo') || '',
      prioridad: fd.get('prioridad') || 100,
      observacion: fd.get('observacion') || '',
      campana_id: rawCampana && rawCampana !== 'none' ? rawCampana : '',
    });
    const { sb, userId } = await requireUser();

    const { data: nro, error: errNro } = await sb.rpc('generar_numero_ot');
    if (errNro) throw new Error(errNro.message);

    const { data: alm } = await sb.from('almacenes').select('id').eq('codigo', 'ALM-SB').maybeSingle();

    const { data: row, error } = await sb.from('ot').insert({
      numero: nro as string,
      estado: 'BORRADOR',
      fecha_apertura: new Date().toISOString().slice(0, 10),
      fecha_entrega_objetivo: data.fecha_entrega_objetivo || null,
      prioridad: data.prioridad,
      observacion: data.observacion || null,
      campana_id: data.campana_id || null,
      es_campana: !!data.campana_id,
      almacen_produccion: alm?.id ?? null,
      responsable_usuario_id: userId,
    }).select('id').single();
    if (error) throw new Error(error.message);

    await sb.from('ot_eventos').insert({
      ot_id: row.id,
      tipo: 'CREACION',
      estado_nuevo: 'BORRADOR',
      usuario_id: userId,
      detalle: 'OT creada manualmente',
    });

    return { id: row.id };
  });
  if (r.ok && r.data) {
    await bumpPaths('/ot');
    redirect(`/ot/${r.data.id}`);
  }
  return r;
}

export async function cambiarEstadoOT(otId: string, nuevoEstado: typeof ESTADOS[number], detalle?: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    const { data: actual } = await sb.from('ot').select('estado').eq('id', otId).single();
    if (!actual) throw new Error('OT no encontrada');

    // Validación server-side de la transición. Espeja al FLOW del cliente
    // pero acá no se puede saltear vía DevTools / API directa.
    const estadoActual = actual.estado as EstadoOT;
    const permitidos = FLOW_ESTADOS[estadoActual] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(
        `Transición no permitida: ${estadoActual.replace('_', ' ')} → ${nuevoEstado.replace('_', ' ')}. ` +
          `Desde ${estadoActual.replace('_', ' ')} solo se puede ir a: ${permitidos.length === 0 ? '(estado final)' : permitidos.map((p) => p.replace('_', ' ')).join(', ')}.`,
      );
    }

    // Update con WHERE en estado actual para atomicidad (evita race con otro
    // usuario que también esté cambiando el estado en paralelo).
    const { error: errUpd, count } = await sb
      .from('ot')
      .update({ estado: nuevoEstado }, { count: 'exact' })
      .eq('id', otId)
      .eq('estado', estadoActual);
    if (errUpd) throw new Error(errUpd.message);
    if ((count ?? 0) === 0) {
      throw new Error('La OT cambió de estado mientras procesabas. Recargá la página.');
    }

    await sb.from('ot_eventos').insert({
      ot_id: otId,
      tipo: 'ESTADO_CAMBIO',
      estado_anterior: estadoActual,
      estado_nuevo: nuevoEstado,
      usuario_id: userId,
      detalle: detalle ?? `Transición ${estadoActual} → ${nuevoEstado}`,
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
    if (cantidadCortada < 0 || cantidadFallas < 0) {
      throw new Error('Las cantidades no pueden ser negativas');
    }
    if (cantidadFallas > cantidadCortada) {
      throw new Error('Las fallas no pueden superar la cantidad cortada');
    }
    const { sb } = await requireUser();

    // Validar contra cantidad_planificada de la línea + estado de la OT
    const { data: linea } = await sb
      .from('ot_lineas')
      .select('cantidad_planificada, ot:ot_id(estado)')
      .eq('id', lineaId)
      .single();
    if (!linea) throw new Error('Línea de OT no encontrada');
    const ot = (linea as unknown as { ot?: { estado: string } | null }).ot;
    if (ot?.estado === 'COMPLETADA' || ot?.estado === 'CANCELADA') {
      throw new Error('No se puede declarar producción en una OT cerrada');
    }
    if (cantidadCortada > Number(linea.cantidad_planificada)) {
      throw new Error(
        `La cantidad cortada (${cantidadCortada}) no puede superar la planificada (${linea.cantidad_planificada})`,
      );
    }

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

    // Precondición: solo se puede cerrar desde EN_CONTROL_CALIDAD.
    if (ot.estado !== 'EN_CONTROL_CALIDAD') {
      throw new Error(
        `La OT debe estar en estado "Control de Calidad" para cerrarse (actualmente: ${(ot.estado as string).replace('_', ' ')}).`,
      );
    }

    const { data: lineas } = await sb.from('ot_lineas')
      .select('id, producto_id, talla, cantidad_planificada, cantidad_cortada, cantidad_terminada, cantidad_fallas')
      .eq('ot_id', otId);
    if (!lineas || lineas.length === 0) throw new Error('OT sin líneas');

    // Guardia: debe haber al menos una línea con cantidad cortada declarada.
    const totalCortado = lineas.reduce((s, l) => s + Number(l.cantidad_cortada ?? 0), 0);
    if (totalCortado <= 0) {
      throw new Error('Declara la cantidad cortada en al menos una línea antes de cerrar la OT');
    }

    // Validación: cantidad terminada efectiva (cortada - fallas o terminada
    // explícita - fallas) no puede superar cantidad planificada en ninguna línea.
    for (const l of lineas) {
      const cantTerm = Number(l.cantidad_terminada ?? l.cantidad_cortada ?? 0) - Number(l.cantidad_fallas ?? 0);
      if (cantTerm > Number(l.cantidad_planificada)) {
        throw new Error(
          `Línea ${l.talla}: cantidad terminada (${cantTerm}) supera planificada (${l.cantidad_planificada}). ` +
            `Revisá la declaración antes de cerrar.`,
        );
      }
    }

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
