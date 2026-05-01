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
 * Cierra la OT ATÓMICAMENTE vía función SQL close_ot_atomic (migración 32).
 * En una sola transacción PL/pgSQL: valida estado y cantidades, crea ingreso
 * PT, lotes, kardex, trazabilidad y marca OT como COMPLETADA. Si algo falla,
 * Postgres revierte todo — ninguna OT cerrada deja lotes huérfanos.
 */
export async function cerrarOT(otId: string, almacenDestinoId: string): Promise<ActionResult<{ lotes: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as unknown as { rpc: (fn: string, args: any) => any }).rpc(
      'close_ot_atomic',
      { p_ot_id: otId, p_almacen_destino: almacenDestinoId, p_user_id: userId },
    );
    if (error) throw new Error(error.message);
    const lotes = (data as { lotes?: number } | null)?.lotes ?? 0;
    return { lotes };
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`, '/ot', '/inventario', '/kardex');
  return r;
}
