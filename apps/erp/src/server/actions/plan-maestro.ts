'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

function isoSemana(d: Date): { semana: number; anio: number } {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { semana: week, anio: target.getUTCFullYear() };
}

const planSchema = z.object({
  fecha_inicio: z.string().min(8),
  fecha_fin: z.string().min(8),
  notas: z.string().optional().or(z.literal('')),
});

export async function crearPlan(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = planSchema.parse({
      fecha_inicio: fd.get('fecha_inicio'),
      fecha_fin: fd.get('fecha_fin'),
      notas: fd.get('notas') || '',
    });
    const { sb, userId } = await requireUser();
    const { semana, anio } = isoSemana(new Date(data.fecha_inicio));
    const { data: nro } = await sb.rpc('next_correlativo', { p_clave: `PM_${anio}`, p_padding: 3 });
    const codigo = `PM-${anio}-S${String(semana).padStart(2, '0')}-${nro}`;
    const { data: row, error } = await sb.from('plan_maestro').insert({
      codigo, semana, anio,
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
      notas: data.notas || null,
      creado_por: userId,
      estado: 'BORRADOR',
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok && r.data) {
    await bumpPaths('/plan-maestro');
    redirect(`/plan-maestro/${r.data.id}`);
  }
  return r;
}

const lineaSchema = z.object({
  plan_id: z.string().uuid(),
  producto_id: z.string().uuid(),
  talla: z.enum(TALLAS),
  cantidad_planificada: z.coerce.number().int().min(1),
  prioridad: z.coerce.number().int().min(0).default(100),
  campana_id: z.string().uuid().optional().or(z.literal('')),
});

export async function agregarLineaPlan(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = lineaSchema.parse({
      plan_id: fd.get('plan_id'),
      producto_id: fd.get('producto_id'),
      talla: fd.get('talla'),
      cantidad_planificada: fd.get('cantidad_planificada'),
      prioridad: fd.get('prioridad') || 100,
      campana_id: fd.get('campana_id') || '',
    });
    const { sb } = await requireUser();
    const { error } = await sb.from('plan_maestro_lineas').insert({
      plan_id: data.plan_id,
      producto_id: data.producto_id,
      talla: data.talla,
      cantidad_planificada: data.cantidad_planificada,
      prioridad: data.prioridad,
      campana_id: data.campana_id || null,
    });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/plan-maestro/${fd.get('plan_id')}`);
  return r;
}

/**
 * Agrega varias tallas de un producto en una sola operación.
 * Acepta un array de { talla, cantidad } y crea N líneas atómicamente.
 */
const tallasBatchSchema = z.object({
  plan_id: z.string().uuid(),
  producto_id: z.string().uuid(),
  prioridad: z.coerce.number().int().min(0).default(100),
  campana_id: z.string().uuid().optional().or(z.literal('')),
  tallas: z
    .array(
      z.object({
        talla: z.enum(TALLAS),
        cantidad: z.coerce.number().int().min(1),
      }),
    )
    .min(1, 'Selecciona al menos una talla con cantidad'),
});

export type TallaCantidad = { talla: (typeof TALLAS)[number]; cantidad: number };

export async function agregarLineasPlanBatch(input: {
  plan_id: string;
  producto_id: string;
  prioridad?: number;
  campana_id?: string;
  tallas: TallaCantidad[];
}): Promise<ActionResult<{ insertadas: number; duplicadas: number }>> {
  const r = await runAction(async () => {
    const data = tallasBatchSchema.parse({
      plan_id: input.plan_id,
      producto_id: input.producto_id,
      prioridad: input.prioridad ?? 100,
      campana_id: input.campana_id ?? '',
      tallas: input.tallas,
    });
    const { sb } = await requireUser();

    // Trae las líneas existentes para detectar duplicados (UNIQUE en plan_id+producto_id+talla).
    const { data: existentes } = await sb
      .from('plan_maestro_lineas')
      .select('talla')
      .eq('plan_id', data.plan_id)
      .eq('producto_id', data.producto_id);
    const yaExisten = new Set((existentes ?? []).map((e) => e.talla));

    const aInsertar = data.tallas
      .filter((t) => !yaExisten.has(t.talla))
      .map((t) => ({
        plan_id: data.plan_id,
        producto_id: data.producto_id,
        talla: t.talla,
        cantidad_planificada: t.cantidad,
        prioridad: data.prioridad,
        campana_id: data.campana_id || null,
      }));

    const duplicadas = data.tallas.length - aInsertar.length;
    if (aInsertar.length === 0) {
      throw new Error(`Todas las tallas ya existían en el plan (${duplicadas} duplicadas)`);
    }

    const { error } = await sb.from('plan_maestro_lineas').insert(aInsertar);
    if (error) throw new Error(error.message);

    return { insertadas: aInsertar.length, duplicadas };
  });
  if (r.ok) await bumpPaths(`/plan-maestro/${input.plan_id}`, '/plan-maestro');
  return r;
}

export async function eliminarLineaPlan(id: string, planId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('plan_maestro_lineas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/plan-maestro/${planId}`);
  return r;
}

export async function aprobarPlan(planId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { error } = await sb.from('plan_maestro').update({ estado: 'APROBADO' }).eq('id', planId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/plan-maestro/${planId}`);
  return r;
}

/** Genera una OT por cada producto del plan y las marca el plan como EN_EJECUCION. */
export async function generarOTsDelPlan(planId: string): Promise<ActionResult<{ otsCreadas: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    const { data: lineas } = await sb.from('plan_maestro_lineas')
      .select('producto_id, talla, cantidad_planificada, prioridad, campana_id')
      .eq('plan_id', planId);
    if (!lineas || lineas.length === 0) throw new Error('El plan no tiene líneas');

    // Agrupar por producto
    const porProducto = new Map<string, typeof lineas>();
    for (const l of lineas) {
      const arr = porProducto.get(l.producto_id) ?? [];
      arr.push(l);
      porProducto.set(l.producto_id, arr);
    }

    // Almacén de producción default
    const { data: alm } = await sb.from('almacenes').select('id').eq('codigo', 'ALM-SB').maybeSingle();

    let count = 0;
    for (const [productoId, items] of porProducto) {
      const { data: nro } = await sb.rpc('generar_numero_ot');
      const { data: ot, error: errOt } = await sb.from('ot').insert({
        numero: nro as string,
        plan_id: planId,
        campana_id: items[0]!.campana_id ?? null,
        es_campana: items[0]!.campana_id !== null,
        estado: 'PLANIFICADA',
        almacen_produccion: alm?.id ?? null,
        responsable_usuario_id: userId,
        prioridad: Math.min(...items.map((i) => i.prioridad ?? 100)),
        observacion: `Generada desde plan ${planId.slice(0, 8)}`,
      }).select('id').single();
      if (errOt) throw new Error(errOt.message);

      const ot_lineas = items.map((i) => ({
        ot_id: ot.id,
        producto_id: productoId,
        talla: i.talla,
        cantidad_planificada: i.cantidad_planificada,
      }));
      await sb.from('ot_lineas').insert(ot_lineas);

      // Evento
      await sb.from('ot_eventos').insert({
        ot_id: ot.id,
        tipo: 'CREACION',
        estado_nuevo: 'PLANIFICADA',
        usuario_id: userId,
        detalle: `Generada desde plan maestro`,
      });
      count++;
    }

    await sb.from('plan_maestro').update({ estado: 'EN_EJECUCION' }).eq('id', planId);
    return { otsCreadas: count };
  });
  if (r.ok) await bumpPaths(`/plan-maestro/${planId}`, '/ot');
  return r;
}

/** Devuelve la explosión de materiales del plan (vista SQL). */
export async function explosionMateriales(planId: string) {
  const { sb } = await requireUser();
  const { data, error } = await sb.rpc('explosion_materiales_plan', { p_plan: planId });
  if (error) throw new Error(error.message);
  return data ?? [];
}
