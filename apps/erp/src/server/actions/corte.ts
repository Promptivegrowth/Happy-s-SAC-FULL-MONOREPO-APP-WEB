'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const corteSchema = z.object({
  ot_id: z.string().uuid(),
  producto_id: z.string().uuid(),
  responsable_operario_id: z.string().uuid().optional().or(z.literal('')),
  capas_tendidas: z.coerce.number().int().min(0).default(0),
  metros_consumidos: z.coerce.number().min(0).default(0),
  observacion: z.string().optional().or(z.literal('')),
});

export async function crearCorte(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = corteSchema.parse({
      ot_id: fd.get('ot_id'),
      producto_id: fd.get('producto_id'),
      responsable_operario_id: fd.get('responsable_operario_id') || '',
      capas_tendidas: fd.get('capas_tendidas') || 0,
      metros_consumidos: fd.get('metros_consumidos') || 0,
      observacion: fd.get('observacion') || '',
    });
    const { sb } = await requireUser();
    const { data: nro } = await sb.rpc('next_correlativo', { p_clave: 'CORTE', p_padding: 6 });
    const { data: row, error } = await sb.from('ot_corte').insert({
      numero: `COR-${nro}`,
      ot_id: data.ot_id,
      producto_id: data.producto_id,
      responsable_operario_id: data.responsable_operario_id || null,
      capas_tendidas: data.capas_tendidas,
      metros_consumidos: data.metros_consumidos,
      observacion: data.observacion || null,
      estado: 'ABIERTO',
      fecha_inicio: new Date().toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok && r.data) {
    await bumpPaths('/corte');
    redirect(`/corte/${r.data.id}`);
  }
  return r;
}

const lineaCorteSchema = z.object({
  corte_id: z.string().uuid(),
  talla: z.enum(TALLAS),
  cantidad_teorica: z.coerce.number().int().min(0),
  cantidad_real: z.coerce.number().int().min(0).optional().or(z.literal('')),
  merma: z.coerce.number().int().min(0).default(0),
});

export async function agregarLineaCorte(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = lineaCorteSchema.parse({
      corte_id: fd.get('corte_id'),
      talla: fd.get('talla'),
      cantidad_teorica: fd.get('cantidad_teorica'),
      cantidad_real: fd.get('cantidad_real') || '',
      merma: fd.get('merma') || 0,
    });
    const { sb } = await requireUser();
    const { error } = await sb.from('ot_corte_lineas').insert({
      corte_id: data.corte_id,
      talla: data.talla,
      cantidad_teorica: data.cantidad_teorica,
      cantidad_real: data.cantidad_real === '' ? null : Number(data.cantidad_real),
      merma: data.merma,
    });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/corte/${fd.get('corte_id')}`);
  return r;
}

export async function cerrarCorte(corteId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('ot_corte').update({
      estado: 'COMPLETADO',
      fecha_fin: new Date().toISOString(),
    }).eq('id', corteId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/corte/${corteId}`, '/corte');
  return r;
}

// =============================
// Órdenes de Servicio
// =============================

const osSchema = z.object({
  corte_id: z.string().uuid().optional().or(z.literal('')),
  ot_id: z.string().uuid(),
  taller_id: z.string().uuid(),
  proceso: z.enum(['COSTURA','BORDADO','ESTAMPADO','SUBLIMADO','PLISADO','DECORADO','ACABADO','PLANCHADO','OJAL_BOTON']).default('COSTURA'),
  fecha_entrega_esperada: z.string().optional().or(z.literal('')),
  monto_base: z.coerce.number().min(0).default(0),
  adicional_movilidad: z.coerce.number().min(0).default(0),
  adicional_campana: z.coerce.number().min(0).default(0),
  es_campana: z.boolean().default(false),
  observaciones: z.string().optional().or(z.literal('')),
  cuidados: z.string().optional().or(z.literal('')),
  consideraciones: z.string().optional().or(z.literal('')),
});

export async function crearOS(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = osSchema.parse({
      corte_id: fd.get('corte_id') || '',
      ot_id: fd.get('ot_id'),
      taller_id: fd.get('taller_id'),
      proceso: fd.get('proceso') || 'COSTURA',
      fecha_entrega_esperada: fd.get('fecha_entrega_esperada') || '',
      monto_base: fd.get('monto_base') || 0,
      adicional_movilidad: fd.get('adicional_movilidad') || 0,
      adicional_campana: fd.get('adicional_campana') || 0,
      es_campana: fd.get('es_campana') === 'on',
      observaciones: fd.get('observaciones') || '',
      cuidados: fd.get('cuidados') || '',
      consideraciones: fd.get('consideraciones') || '',
    });
    const { sb, userId } = await requireUser();
    const { data: nro } = await sb.rpc('next_correlativo', { p_clave: 'OS', p_padding: 6 });
    const { data: row, error } = await sb.from('ordenes_servicio').insert({
      numero: `OS-${nro}`,
      corte_id: data.corte_id || null,
      ot_id: data.ot_id,
      taller_id: data.taller_id,
      proceso: data.proceso,
      fecha_entrega_esperada: data.fecha_entrega_esperada || null,
      monto_base: data.monto_base,
      adicional_movilidad: data.adicional_movilidad,
      adicional_campana: data.adicional_campana,
      es_campana: data.es_campana,
      observaciones: data.observaciones || null,
      cuidados: data.cuidados || null,
      consideraciones: data.consideraciones || null,
      creado_por: userId,
      estado: 'EMITIDA',
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok && r.data) {
    await bumpPaths('/servicios');
    redirect(`/servicios/${r.data.id}`);
  }
  return r;
}

export async function cambiarEstadoOS(osId: string, nuevoEstado: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const update: { estado: string; fecha_recepcion?: string } = { estado: nuevoEstado };
    if (nuevoEstado === 'RECEPCIONADA') update.fecha_recepcion = new Date().toISOString().slice(0, 10);
    const { error } = await sb.from('ordenes_servicio').update(update).eq('id', osId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/servicios/${osId}`, '/servicios');
  return r;
}
