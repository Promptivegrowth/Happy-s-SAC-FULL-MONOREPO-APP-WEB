'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const corteSchema = z.object({
  ot_id: z.string().uuid(),
  // producto_id es opcional: si no viene, se infiere de ot_lineas (caso normal:
  // OTs generadas desde plan tienen 1 producto). Solo es requerido si la OT
  // tiene varios productos y hay que desambiguar.
  producto_id: z.string().uuid().optional().or(z.literal('')),
  responsable_operario_id: z.string().uuid().optional().or(z.literal('')),
  capas_tendidas: z.coerce.number().int().min(0).default(0),
  metros_consumidos: z.coerce.number().min(0).default(0),
  merma_metros: z.coerce.number().min(0).default(0),
  observacion: z.string().optional().or(z.literal('')),
});

export async function crearCorte(_prev: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = corteSchema.parse({
      ot_id: fd.get('ot_id'),
      producto_id: fd.get('producto_id') || '',
      responsable_operario_id: fd.get('responsable_operario_id') || '',
      capas_tendidas: fd.get('capas_tendidas') || 0,
      metros_consumidos: fd.get('metros_consumidos') || 0,
      merma_metros: fd.get('merma_metros') || 0,
      observacion: fd.get('observacion') || '',
    });
    const { sb } = await requireUser();

    // Si no vino producto_id, inferir de ot_lineas. Si la OT tiene 1 solo
    // producto, lo usamos directo. Si tiene varios, exigimos el campo.
    let productoId = data.producto_id;
    if (!productoId) {
      const { data: lineas } = await sb
        .from('ot_lineas')
        .select('producto_id')
        .eq('ot_id', data.ot_id);
      const productos = Array.from(new Set((lineas ?? []).map((l) => l.producto_id as string)));
      if (productos.length === 0) {
        throw new Error('La OT seleccionada no tiene líneas planificadas — no se puede crear un corte sobre ella.');
      }
      if (productos.length > 1) {
        throw new Error('La OT tiene varios productos; tenés que indicar cuál se está cortando.');
      }
      productoId = productos[0]!;
    }

    const { data: nro } = await sb.rpc('next_correlativo', { p_clave: 'CORTE', p_padding: 6 });
    const { data: row, error } = await sb.from('ot_corte').insert({
      numero: `COR-${nro}`,
      ot_id: data.ot_id,
      producto_id: productoId,
      responsable_operario_id: data.responsable_operario_id || null,
      capas_tendidas: data.capas_tendidas,
      metros_consumidos: data.metros_consumidos,
      merma_metros: data.merma_metros,
      observacion: data.observacion || null,
      estado: 'ABIERTO',
      fecha_inicio: new Date().toISOString(),
    }).select('id').single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });
  if (r.ok && r.data) await bumpPaths('/corte');
  return r;
}

const lineaCorteSchema = z.object({
  corte_id: z.string().uuid(),
  talla: z.enum(TALLAS),
  cantidad_teorica: z.coerce.number().int().min(1, 'Cantidad teórica debe ser > 0'),
  cantidad_real: z.coerce.number().int().min(0).optional().or(z.literal('')),
});

export async function agregarLineaCorte(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = lineaCorteSchema.parse({
      corte_id: fd.get('corte_id'),
      talla: fd.get('talla'),
      cantidad_teorica: fd.get('cantidad_teorica'),
      cantidad_real: fd.get('cantidad_real') || '',
    });
    const { sb } = await requireUser();
    // merma por talla quedó deprecada — la merma del corte se carga en metros
    // a nivel cabecera (ot_corte.merma_metros). Insertamos 0 para no romper
    // la columna existente.
    const { error } = await sb.from('ot_corte_lineas').insert({
      corte_id: data.corte_id,
      talla: data.talla,
      cantidad_teorica: data.cantidad_teorica,
      cantidad_real: data.cantidad_real === '' ? null : Number(data.cantidad_real),
      merma: 0,
    });
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/corte/${fd.get('corte_id')}`);
  return r;
}

/**
 * Cierra un corte ATÓMICAMENTE: sincroniza ot_lineas.cantidad_cortada y
 * marca el corte como COMPLETADO en una sola transacción PL/pgSQL
 * (función close_corte_atomic — migración 32).
 * Si algo falla, ROLLBACK total — ninguna línea queda actualizada parcial.
 */
export async function cerrarCorte(corteId: string): Promise<ActionResult<{ ot_lineas_sync: number }>> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as unknown as { rpc: (fn: string, args: any) => any })
      .rpc('close_corte_atomic', { p_corte_id: corteId });
    if (error) throw new Error(error.message);
    const synced = (data as { ot_lineas_sync?: number } | null)?.ot_lineas_sync ?? 0;
    return { ot_lineas_sync: synced };
  });
  if (r.ok) await bumpPaths(`/corte/${corteId}`, '/corte', '/ot');
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
  // Adicionales en S/ POR UNIDAD enviada (no es un total). El total se
  // calcula al guardar = por_unidad * unidades_enviadas.
  movilidad_por_unidad: z.coerce.number().min(0).default(0),
  campana_por_unidad: z.coerce.number().min(0).default(0),
  es_campana: z.boolean().default(false),
  observaciones: z.string().optional().or(z.literal('')),
  cuidados: z.string().optional().or(z.literal('')),
  consideraciones: z.string().optional().or(z.literal('')),
});

/**
 * Pobla automáticamente las líneas y los avíos de una OS recién creada
 * a partir del corte vinculado.
 *
 * - Si tallasFiltro está definido (no vacío), solo se incluyen esas tallas
 *   → permite DIVIDIR un corte en 2+ OSs (mandar T2-T4 a un taller y
 *   T6-T8 a otro en campañas).
 *
 * - Avíos: por cada línea de receta con sale_a_servicio=true, la cantidad
 *   enviada al taller = (cantidad_unitaria - cantidad_almacen) × cantidad
 *   a producir. cantidad_almacen es la parte que QUEDA en planta para
 *   decoración manual u otros procesos internos.
 *
 * Si no hay receta activa, no falla — solo no genera avíos.
 */
async function poblarLineasYAviosOS(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  osId: string,
  corteId: string,
  tallasFiltro?: string[],
): Promise<{ lineas: number; avios: number }> {
  // 1) Cargar el corte y sus líneas no vacías
  const { data: corte, error: errC } = await sb
    .from('ot_corte')
    .select('producto_id, ot_corte_lineas(talla, cantidad_real)')
    .eq('id', corteId)
    .single();
  if (errC) throw new Error(`corte: ${errC.message}`);
  if (!corte) return { lineas: 0, avios: 0 };

  const productoId = corte.producto_id as string;
  type LC = { talla: string; cantidad_real: number | null };
  const lineasTodas = ((corte as unknown as { ot_corte_lineas?: LC[] }).ot_corte_lineas ?? []).filter(
    (l) => Number(l.cantidad_real ?? 0) > 0,
  );
  const filtroSet = tallasFiltro && tallasFiltro.length > 0 ? new Set(tallasFiltro) : null;
  const lineasCorte = filtroSet ? lineasTodas.filter((l) => filtroSet.has(l.talla)) : lineasTodas;

  if (lineasCorte.length === 0) return { lineas: 0, avios: 0 };

  // 2) Insertar líneas en ordenes_servicio_lineas
  const filasLineas = lineasCorte.map((l) => ({
    os_id: osId,
    producto_id: productoId,
    talla: l.talla as 'T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD',
    cantidad: Number(l.cantidad_real),
  }));
  const { error: errL } = await sb.from('ordenes_servicio_lineas').insert(filasLineas);
  if (errL) throw new Error(`OS lineas: ${errL.message}`);

  // 3) Calcular avíos: receta activa × cantidad por talla
  // Considera cantidad_almacen para dividir avíos (parte va al taller, parte queda en planta).
  const { data: receta } = await sb
    .from('recetas')
    .select('id')
    .eq('producto_id', productoId)
    .eq('activa', true)
    .maybeSingle();
  if (!receta) {
    return { lineas: filasLineas.length, avios: 0 };
  }

  const tallasNecesarias = lineasCorte.map((l) => l.talla as 'T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD');
  const { data: lineasReceta } = await sb
    .from('recetas_lineas')
    .select('material_id, talla, cantidad, cantidad_almacen')
    .eq('receta_id', receta.id)
    .eq('sale_a_servicio', true)
    .in('talla', tallasNecesarias);

  const cantPorTalla = new Map<string, number>();
  for (const l of lineasCorte) cantPorTalla.set(l.talla, Number(l.cantidad_real));

  const aviosMap = new Map<string, number>();
  for (const lr of lineasReceta ?? []) {
    const cantUnidades = cantPorTalla.get(lr.talla as string) ?? 0;
    if (cantUnidades <= 0) continue;
    // Cantidad efectiva al taller = cantidad por unidad - lo que queda en almacén.
    // Si cantidad_almacen >= cantidad, no se manda nada al taller (todo queda en planta).
    const cantAlTaller = Math.max(0, Number(lr.cantidad) - Number(lr.cantidad_almacen ?? 0));
    if (cantAlTaller <= 0) continue;
    const cantAvios = cantAlTaller * cantUnidades;
    const matId = lr.material_id as string;
    aviosMap.set(matId, (aviosMap.get(matId) ?? 0) + cantAvios);
  }

  if (aviosMap.size > 0) {
    const filasAvios = [...aviosMap.entries()].map(([material_id, cantidad_enviada]) => ({
      os_id: osId,
      material_id,
      cantidad_enviada,
    }));
    const { error: errA } = await sb.from('ordenes_servicio_avios').insert(filasAvios);
    if (errA) throw new Error(`OS avios: ${errA.message}`);
  }

  return { lineas: filasLineas.length, avios: aviosMap.size };
}

/**
 * Variante: poblar líneas de OS directamente desde ot_lineas (sin corte
 * vinculado). Usa cantidad_cortada si > 0, sino cantidad_planificada.
 * Acepta filtro opcional de tallas. NO genera avíos porque eso requiere
 * el flujo del corte que coordina con almacén.
 */
async function poblarLineasOSDesdeOT(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  osId: string,
  otId: string,
  tallasFiltro?: string[],
): Promise<{ lineas: number; avios: number }> {
  const { data: lineasOt, error: errL } = await sb
    .from('ot_lineas')
    .select('producto_id, talla, cantidad_planificada, cantidad_cortada')
    .eq('ot_id', otId);
  if (errL) throw new Error(`ot_lineas: ${errL.message}`);
  const filtroSet = tallasFiltro && tallasFiltro.length > 0 ? new Set(tallasFiltro) : null;
  const candidatas = (lineasOt ?? [])
    .map((l) => ({
      producto_id: l.producto_id as string,
      talla: l.talla as 'T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD',
      cantidad: Number(l.cantidad_cortada ?? 0) > 0 ? Number(l.cantidad_cortada) : Number(l.cantidad_planificada ?? 0),
    }))
    .filter((l) => l.cantidad > 0 && (!filtroSet || filtroSet.has(l.talla)));
  if (candidatas.length === 0) return { lineas: 0, avios: 0 };
  const { error: errIns } = await sb.from('ordenes_servicio_lineas').insert(
    candidatas.map((c) => ({ os_id: osId, producto_id: c.producto_id, talla: c.talla, cantidad: c.cantidad })),
  );
  if (errIns) throw new Error(`OS lineas (OT): ${errIns.message}`);
  return { lineas: candidatas.length, avios: 0 };
}

export async function crearOS(
  _prev: unknown,
  fd: FormData,
): Promise<ActionResult<{ id: string; lineas: number; avios: number }>> {
  const r = await runAction(async () => {
    const data = osSchema.parse({
      corte_id: fd.get('corte_id') || '',
      ot_id: fd.get('ot_id'),
      taller_id: fd.get('taller_id'),
      proceso: fd.get('proceso') || 'COSTURA',
      fecha_entrega_esperada: fd.get('fecha_entrega_esperada') || '',
      monto_base: fd.get('monto_base') || 0,
      movilidad_por_unidad: fd.get('movilidad_por_unidad') || 0,
      campana_por_unidad: fd.get('campana_por_unidad') || 0,
      es_campana: fd.get('es_campana') === 'on',
      observaciones: fd.get('observaciones') || '',
      cuidados: fd.get('cuidados') || '',
      consideraciones: fd.get('consideraciones') || '',
    });
    const { sb, userId } = await requireUser();
    const { data: nro } = await sb.rpc('next_correlativo', { p_clave: 'OS', p_padding: 6 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny.from('ordenes_servicio').insert({
      numero: `OS-${nro}`,
      corte_id: data.corte_id || null,
      ot_id: data.ot_id,
      taller_id: data.taller_id,
      proceso: data.proceso,
      fecha_entrega_esperada: data.fecha_entrega_esperada || null,
      monto_base: data.monto_base,
      // Inicialmente dejamos los totales en 0 — se recalculan tras poblar
      // las líneas (ya conocemos las unidades efectivamente enviadas).
      adicional_movilidad: 0,
      adicional_campana: 0,
      movilidad_por_unidad: data.movilidad_por_unidad,
      campana_por_unidad: data.campana_por_unidad,
      es_campana: data.es_campana,
      observaciones: data.observaciones || null,
      cuidados: data.cuidados || null,
      consideraciones: data.consideraciones || null,
      creado_por: userId,
      estado: 'EMITIDA',
    }).select('id').single();
    if (error) throw new Error(error.message);

    // Poblar líneas:
    //   - Si hay corte_id → líneas + avíos del BOM (flujo completo).
    //   - Sino → líneas desde ot_lineas con filtro de tallas (sin avíos).
    let extras = { lineas: 0, avios: 0 };
    const tallasFiltro = fd.getAll('tallas_seleccionadas').map((v) => String(v)).filter(Boolean);
    if (data.corte_id) {
      try {
        extras = await poblarLineasYAviosOS(
          sb,
          row.id as string,
          data.corte_id,
          tallasFiltro.length > 0 ? tallasFiltro : undefined,
        );
      } catch (e) {
        await sb.from('ordenes_servicio').delete().eq('id', row.id);
        throw new Error(`No se pudieron poblar líneas/avíos: ${(e as Error).message}`);
      }
    } else if (data.ot_id && tallasFiltro.length > 0) {
      try {
        extras = await poblarLineasOSDesdeOT(sb, row.id as string, data.ot_id, tallasFiltro);
      } catch (e) {
        await sb.from('ordenes_servicio').delete().eq('id', row.id);
        throw new Error(`No se pudieron poblar líneas desde OT: ${(e as Error).message}`);
      }
    }

    // Recalcular adicionales totales en función de las unidades enviadas.
    const { data: lineasOs } = await sb
      .from('ordenes_servicio_lineas')
      .select('cantidad')
      .eq('os_id', row.id);
    const totalUnidades = (lineasOs ?? []).reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
    const totalMovilidad = Math.round(data.movilidad_por_unidad * totalUnidades * 100) / 100;
    const totalCampana = Math.round(data.campana_por_unidad * totalUnidades * 100) / 100;
    if (totalMovilidad > 0 || totalCampana > 0) {
      await sbAny.from('ordenes_servicio')
        .update({ adicional_movilidad: totalMovilidad, adicional_campana: totalCampana })
        .eq('id', row.id);
    }

    return { id: row.id as string, ...extras };
  });
  // Sin redirect server-side: el cliente navega después de mostrar el toast
  // con el resumen (líneas + avíos cargados). Patrón consistente con
  // crearCorte y eliminarTaller — evita que el redirect interrumpa el
  // useTransition antes de que el toast se renderice.
  if (r.ok) await bumpPaths('/servicios');
  return r;
}

/**
 * Máquina de estados de la OS (server-side).
 * EMITIDA → DESPACHADA → EN_PROCESO → RECEPCIONADA → CERRADA
 * ANULADA es accesible desde cualquier estado activo (no desde finales).
 */
const FLOW_OS: Record<string, string[]> = {
  EMITIDA:      ['DESPACHADA', 'ANULADA'],
  DESPACHADA:   ['EN_PROCESO', 'ANULADA'],
  EN_PROCESO:   ['RECEPCIONADA', 'ANULADA'],
  RECEPCIONADA: ['CERRADA', 'ANULADA'],
  CERRADA:      [],
  ANULADA:      [],
};

export async function cambiarEstadoOS(osId: string, nuevoEstado: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    const { data: actual } = await sb.from('ordenes_servicio').select('estado').eq('id', osId).single();
    if (!actual) throw new Error('OS no encontrada');

    const estadoActual = (actual.estado as string) ?? 'EMITIDA';
    const permitidos = FLOW_OS[estadoActual] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(
        `Transición no permitida: ${estadoActual.replace('_', ' ')} → ${nuevoEstado.replace('_', ' ')}. ` +
          `Desde ${estadoActual.replace('_', ' ')} solo se puede ir a: ${permitidos.length === 0 ? '(estado final)' : permitidos.join(', ')}.`,
      );
    }

    const update: { estado: string; fecha_recepcion?: string } = { estado: nuevoEstado };
    if (nuevoEstado === 'RECEPCIONADA') update.fecha_recepcion = new Date().toISOString().slice(0, 10);

    // Update con WHERE en estado actual para atomicidad
    const { error, count } = await sb
      .from('ordenes_servicio')
      .update(update, { count: 'exact' })
      .eq('id', osId)
      .eq('estado', estadoActual);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) {
      throw new Error('La OS cambió de estado mientras procesabas. Recargá la página.');
    }
    return null;
  });
  if (r.ok) await bumpPaths(`/servicios/${osId}`, '/servicios');
  return r;
}
