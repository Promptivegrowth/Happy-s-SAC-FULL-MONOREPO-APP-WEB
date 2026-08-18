'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, esGerente, type ActionResult } from './_helpers';
import { autoAvanzarEstadoOT } from './ot';
import { formatTallaChip } from '@happy/lib';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD', 'TU'] as const;

// Movilidad por defecto de la OS: S/ 0.10 por unidad enviada al taller.
// Modificar este valor exige autorización de gerencia (ver crearOS).
const MOVILIDAD_DEFAULT_OS = 0.1;

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
  motivo: z.string().optional().or(z.literal('')),
});

export async function agregarLineaCorte(_prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = lineaCorteSchema.parse({
      corte_id: fd.get('corte_id'),
      talla: fd.get('talla'),
      cantidad_teorica: fd.get('cantidad_teorica'),
      cantidad_real: fd.get('cantidad_real') || '',
      motivo: fd.get('motivo') || '',
    });
    const { sb, userId } = await requireUser();

    // No se puede ingresar más cantidades a cortar en un corte ya CERRADO o
    // ANULADO (pedido del cliente 22/07/2026).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbEstado = sb as unknown as { from: (t: string) => any };
    const { data: corteEstado } = await sbEstado.from('ot_corte').select('estado').eq('id', data.corte_id).maybeSingle();
    if (corteEstado?.estado === 'COMPLETADO' || corteEstado?.estado === 'ANULADO') {
      throw new Error('Este corte ya está cerrado: no se pueden ingresar más cantidades a cortar. Cree un corte nuevo si necesita cortar más.');
    }

    // AUTORIZACIÓN DE GERENCIA (pedido del cliente 21/07/2026): si la cantidad
    // REAL declarada difiere de la TEÓRICA (la del plan), hace falta que un
    // gerente lo autorice con motivo, y queda registrado. Igualar o dejar la
    // real vacía no pide nada.
    const real = data.cantidad_real === '' ? null : Number(data.cantidad_real);
    const difiere = real != null && real !== data.cantidad_teorica;
    const motivoLimpio = (data.motivo ?? '').trim();
    if (difiere) {
      if (!(await esGerente())) {
        throw new Error(
          `La cantidad real (${real}) difiere de la teórica del plan (${data.cantidad_teorica}). ` +
          `Este cambio requiere autorización de gerencia.`,
        );
      }
      if (!motivoLimpio) {
        throw new Error('Indique el motivo de la diferencia entre la cantidad real y la teórica.');
      }
    }

    // merma por talla quedó deprecada — la merma del corte se carga en metros
    // a nivel cabecera (ot_corte.merma_metros). Insertamos 0 para no romper
    // la columna existente.
    const { error } = await sb.from('ot_corte_lineas').insert({
      corte_id: data.corte_id,
      talla: data.talla,
      cantidad_teorica: data.cantidad_teorica,
      cantidad_real: real,
      merma: 0,
    });
    if (error) throw new Error(error.message);

    // La OT jala EN VIVO lo cortado (mig 70): recalcular cantidad_cortada de
    // la OT desde la suma de lo real de sus cortes. Así el "Cortado" de la OT
    // refleja lo declarado en el corte sin esperar al cierre.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcClient = sb as unknown as { from: (t: string) => any; rpc: (fn: string, args: any) => any };
    const { data: corteInfo } = await rpcClient
      .from('ot_corte')
      .select('ot_id, producto_id')
      .eq('id', data.corte_id)
      .maybeSingle();
    if (corteInfo?.ot_id && corteInfo?.producto_id) {
      await rpcClient.rpc('sync_ot_cortada', { p_ot_id: corteInfo.ot_id, p_producto_id: corteInfo.producto_id });
      // Con corte declarado, avanzar el estado de la OT a EN_CORTE si estaba antes.
      await autoAvanzarEstadoOT(rpcClient, corteInfo.ot_id as string);
    }

    // Registrar la autorización (auditoría). Se guarda como nota en la
    // observación del corte con marca de fecha; no hay tabla de eventos de
    // corte, así que dejamos rastro acá.
    if (difiere) {
      const fecha = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sbAny = sb as unknown as { from: (t: string) => any };
      const { data: corteRow } = await sbAny.from('ot_corte').select('observacion').eq('id', data.corte_id).maybeSingle();
      const nota =
        `[${fecha}] Talla ${formatTallaChip(data.talla)}: real ${real} vs teórica ${data.cantidad_teorica} ` +
        `(dif ${(real ?? 0) - data.cantidad_teorica >= 0 ? '+' : ''}${(real ?? 0) - data.cantidad_teorica}) — ` +
        `autorizado por gerencia. Motivo: ${motivoLimpio}`;
      await sbAny.from('ot_corte').update({
        observacion: corteRow?.observacion ? `${corteRow.observacion}\n${nota}` : nota,
      }).eq('id', data.corte_id);
      void userId;
    }
    return null;
  });
  if (r.ok) await bumpPaths(`/corte/${fd.get('corte_id')}`, '/ot');
  return r;
}

/**
 * Guarda los tiempos de TENDIDO / CORTE / HABILITADO por cada tela de la
 * receta (mig 69, pedido del cliente 21/07/2026). Reemplaza los tiempos del
 * corte con lo enviado (upsert por material).
 */
const tiempoTelaSchema = z.object({
  material_id: z.string().uuid(),
  tela_nombre: z.string().optional().or(z.literal('')),
  tiempo_tendido_min: z.coerce.number().min(0).default(0),
  tiempo_corte_min: z.coerce.number().min(0).default(0),
  tiempo_habilitado_min: z.coerce.number().min(0).default(0),
  // Fechas de ejecución por operación (mig 72). Opcionales.
  fecha_tendido: z.string().optional().or(z.literal('')),
  fecha_corte: z.string().optional().or(z.literal('')),
  fecha_habilitado: z.string().optional().or(z.literal('')),
  // Liquidación por tela (mig 76): capas, metros, merma y responsable.
  capas_tendidas: z.coerce.number().int().min(0).default(0),
  // Largo de paño (metros de un solo tendido). El consumo real total se calcula:
  // metros_consumidos = capas × largo_pano + merma (pedido del cliente 22/07/2026).
  largo_pano: z.coerce.number().min(0).default(0),
  merma_metros: z.coerce.number().min(0).default(0),
  responsable_operario_id: z.string().uuid().optional().or(z.literal('')),
});
// ============================================================================
// Consumo de material (stock) enganchado a los flujos de producción
// ============================================================================
// Modelo confirmado por el cliente (2026-08-16): la TELA se descuenta al cerrar
// el corte (consumo real: capas × largo + merma) y los AVÍOS al despachar la OS
// al taller; los avíos devueltos reingresan. Todos los hooks son BEST-EFFORT
// (envueltos en try/catch por el llamador) e IDEMPOTENTES: nunca bloquean el
// cierre del corte ni el despacho de la OS. Si no hay stock cargado, el stock
// puede quedar negativo (señal de que faltan cargar compras), pero el flujo de
// producción no se detiene.

/* eslint-disable @typescript-eslint/no-explicit-any */
async function almacenMateriaPrimaId(sbAny: { from: (t: string) => any }): Promise<string | null> {
  const { data } = await sbAny
    .from('almacenes')
    .select('id, codigo')
    .eq('tipo', 'MATERIA_PRIMA')
    .eq('activo', true)
    .order('codigo')
    .limit(1);
  return (data ?? [])[0]?.id ?? null;
}

/** Descuenta del almacén de MP el consumo real de tela de un corte cerrado. */
async function descontarTelaDeCorte(sbAny: { from: (t: string) => any }, corteId: string, userId: string): Promise<void> {
  const { data: ya } = await sbAny
    .from('kardex_movimientos').select('id')
    .eq('referencia_tipo', 'CORTE').eq('referencia_id', corteId).eq('tipo', 'SALIDA_PRODUCCION').limit(1);
  if ((ya ?? []).length > 0) return; // ya se descontó
  const almId = await almacenMateriaPrimaId(sbAny);
  if (!almId) return;
  const { data: corte } = await sbAny.from('ot_corte').select('numero').eq('id', corteId).maybeSingle();
  const { data: telas } = await sbAny
    .from('ot_corte_tiempos').select('material_id, metros_consumidos').eq('corte_id', corteId);
  const rows = ((telas ?? []) as { material_id: string | null; metros_consumidos: number | string | null }[])
    .filter((t) => t.material_id && Number(t.metros_consumidos ?? 0) > 0)
    .map((t) => ({
      tipo: 'SALIDA_PRODUCCION', almacen_id: almId, material_id: t.material_id,
      cantidad: Number(t.metros_consumidos), referencia_tipo: 'CORTE', referencia_id: corteId,
      usuario_id: userId, observacion: `Consumo de tela por corte ${corte?.numero ?? ''}`.trim(),
    }));
  if (rows.length > 0) await sbAny.from('kardex_movimientos').insert(rows);
}

/** Descuenta del almacén de MP los avíos enviados al taller al despachar la OS. */
async function descontarAviosOS(sbAny: { from: (t: string) => any }, osId: string, userId: string): Promise<void> {
  const { data: ya } = await sbAny
    .from('kardex_movimientos').select('id')
    .eq('referencia_tipo', 'OS').eq('referencia_id', osId).eq('tipo', 'SALIDA_TALLER_SERVICIO').limit(1);
  if ((ya ?? []).length > 0) return;
  const almId = await almacenMateriaPrimaId(sbAny);
  if (!almId) return;
  const { data: os } = await sbAny.from('ordenes_servicio').select('numero').eq('id', osId).maybeSingle();
  const { data: avios } = await sbAny
    .from('ordenes_servicio_avios').select('material_id, cantidad_enviada').eq('os_id', osId);
  const rows = ((avios ?? []) as { material_id: string | null; cantidad_enviada: number | string | null }[])
    .filter((a) => a.material_id && Number(a.cantidad_enviada ?? 0) > 0)
    .map((a) => ({
      tipo: 'SALIDA_TALLER_SERVICIO', almacen_id: almId, material_id: a.material_id,
      cantidad: Number(a.cantidad_enviada), referencia_tipo: 'OS', referencia_id: osId,
      usuario_id: userId, observacion: `Avíos enviados al taller · OS ${os?.numero ?? ''}`.trim(),
    }));
  if (rows.length > 0) await sbAny.from('kardex_movimientos').insert(rows);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function guardarTiemposCorte(
  corteId: string,
  tiempos: z.input<typeof tiempoTelaSchema>[],
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const parsed = tiempos.map((t) => tiempoTelaSchema.parse(t));
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    // Consumo real por tela = capas × largo de paño + merma.
    const consumoReal = (t: (typeof parsed)[number]) =>
      Math.round((Number(t.capas_tendidas || 0) * Number(t.largo_pano || 0) + Number(t.merma_metros || 0)) * 100) / 100;
    for (const t of parsed) {
      const { error } = await sbAny
        .from('ot_corte_tiempos')
        .upsert(
          {
            corte_id: corteId,
            material_id: t.material_id,
            tela_nombre: t.tela_nombre || null,
            tiempo_tendido_min: t.tiempo_tendido_min,
            tiempo_corte_min: t.tiempo_corte_min,
            tiempo_habilitado_min: t.tiempo_habilitado_min,
            fecha_tendido: t.fecha_tendido || null,
            fecha_corte: t.fecha_corte || null,
            fecha_habilitado: t.fecha_habilitado || null,
            capas_tendidas: t.capas_tendidas,
            largo_pano: t.largo_pano,
            merma_metros: t.merma_metros,
            metros_consumidos: consumoReal(t),
            responsable_operario_id: t.responsable_operario_id || null,
          },
          { onConflict: 'corte_id,material_id' },
        );
      if (error) throw new Error(error.message);
    }

    // Recomputar los TOTALES del corte (cabecera) = suma de todas las telas.
    // Así los listados y el resumen siguen mostrando el total correcto.
    const totalCapas = parsed.reduce((s, t) => s + Number(t.capas_tendidas || 0), 0);
    const totalMetros = Math.round(parsed.reduce((s, t) => s + consumoReal(t), 0) * 100) / 100;
    const totalMerma = Math.round(parsed.reduce((s, t) => s + Number(t.merma_metros || 0), 0) * 100) / 100;
    await sbAny
      .from('ot_corte')
      .update({ capas_tendidas: totalCapas, metros_consumidos: totalMetros, merma_metros: totalMerma })
      .eq('id', corteId);
    return null;
  });
  if (r.ok) await bumpPaths(`/corte/${corteId}`);
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
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any; rpc: (fn: string, args: any) => any };

    // No se puede cerrar el corte sin haber registrado los TIEMPOS de la
    // liquidación (pedido del cliente 22/07/2026): una vez cerrado no se pueden
    // modificar, y sin tiempos la OT no deja avanzar los demás procesos.
    const { data: tiempos } = await sbAny
      .from('ot_corte_tiempos')
      .select('tiempo_tendido_min, tiempo_corte_min, tiempo_habilitado_min')
      .eq('corte_id', corteId);
    const totalMin = ((tiempos ?? []) as { tiempo_tendido_min: number | string | null; tiempo_corte_min: number | string | null; tiempo_habilitado_min: number | string | null }[])
      .reduce((s, t) => s + Number(t.tiempo_tendido_min ?? 0) + Number(t.tiempo_corte_min ?? 0) + Number(t.tiempo_habilitado_min ?? 0), 0);
    if (totalMin <= 0) {
      throw new Error('Antes de cerrar el corte, registre los tiempos por tela (tendido, corte, habilitado) en la liquidación. Una vez cerrado ya no se podrán modificar.');
    }

    const { data, error } = await sbAny
      .rpc('close_corte_atomic', { p_corte_id: corteId });
    if (error) throw new Error(error.message);
    const synced = (data as { ot_lineas_sync?: number } | null)?.ot_lineas_sync ?? 0;

    // Descontar la tela consumida del almacén de materia prima (SALIDA_PRODUCCION).
    // Best-effort: si algo falla, NO revierte el cierre del corte.
    try { await descontarTelaDeCorte(sbAny, corteId, userId); } catch { /* no bloquea el cierre */ }

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
  fecha_envio: z.string().optional().or(z.literal('')),
  fecha_entrega_esperada: z.string().optional().or(z.literal('')),
  monto_base: z.coerce.number().min(0).default(0),
  // Adicionales en S/ POR UNIDAD enviada (no es un total). El total se
  // calcula al guardar = por_unidad * unidades_enviadas.
  movilidad_por_unidad: z.coerce.number().min(0).default(MOVILIDAD_DEFAULT_OS),
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
  proceso = 'COSTURA',
): Promise<{ lineas: number; avios: number }> {
  // 1) El corte aporta el vínculo producto/OT y dispara el cálculo de avíos
  //    del BOM. Las CANTIDADES salen de la OT (ot_lineas.cantidad_cortada),
  //    que es la fuente reconciliada — NO de ot_corte_lineas.cantidad_real
  //    (decisión del cliente 21/07/2026: la OS jala lo de la OT, no lo del
  //    corte, para que refleje las cantidades reales/ajustadas).
  const { data: corte, error: errC } = await sb
    .from('ot_corte')
    .select('producto_id, ot_id')
    .eq('id', corteId)
    .single();
  if (errC) throw new Error(`corte: ${errC.message}`);
  if (!corte) return { lineas: 0, avios: 0 };

  const productoId = corte.producto_id as string;
  const otId = (corte as { ot_id: string }).ot_id;

  const { data: lineasOtRaw } = await sb
    .from('ot_lineas')
    .select('talla, cantidad_cortada')
    .eq('ot_id', otId)
    .eq('producto_id', productoId);
  type LC = { talla: string; cantidad: number };
  const lineasTodas: LC[] = ((lineasOtRaw ?? []) as { talla: string; cantidad_cortada: number | null }[])
    .map((l) => ({ talla: l.talla, cantidad: Number(l.cantidad_cortada ?? 0) }))
    .filter((l) => l.cantidad > 0);
  const filtroSet = tallasFiltro && tallasFiltro.length > 0 ? new Set(tallasFiltro) : null;
  const lineasCorte = filtroSet ? lineasTodas.filter((l) => filtroSet.has(l.talla)) : lineasTodas;

  if (lineasCorte.length === 0) return { lineas: 0, avios: 0 };

  // 2) Insertar líneas en ordenes_servicio_lineas
  const filasLineas = lineasCorte.map((l) => ({
    os_id: osId,
    producto_id: productoId,
    talla: l.talla as 'T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD' | 'TU',
    cantidad: l.cantidad,
  }));
  const { error: errL } = await sb.from('ordenes_servicio_lineas').insert(filasLineas);
  if (errL) throw new Error(`OS lineas: ${errL.message}`);

  // 3) Calcular avíos del BOM (receta activa × cantidad por talla).
  const cantPorTalla = new Map<string, number>();
  for (const l of lineasCorte) cantPorTalla.set(l.talla, l.cantidad);
  const avios = await generarAviosOS(sb, osId, productoId, cantPorTalla, proceso);

  return { lineas: filasLineas.length, avios };
}

/**
 * Genera los avíos de una OS a partir de la receta activa del producto.
 * Por cada línea de receta con sale_a_servicio=true, la cantidad enviada al
 * taller = (cantidad_unitaria − cantidad_almacen) × unidades de esa talla.
 * cantidad_almacen es la parte que QUEDA en planta. Devuelve la cantidad de
 * materiales (avíos) insertados. Si no hay receta activa, no falla → 0.
 *
 * Se usa tanto en el flujo con corte vinculado como en el de OT directa, para
 * que los avíos siempre se muestren en la OS (pedido del cliente 21/07/2026).
 */
async function generarAviosOS(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  osId: string,
  productoId: string,
  cantPorTalla: Map<string, number>,
  proceso = 'COSTURA',
): Promise<number> {
  if (cantPorTalla.size === 0) return 0;
  const { data: receta } = await sb
    .from('recetas')
    .select('id')
    .eq('producto_id', productoId)
    .eq('activa', true)
    .maybeSingle();
  if (!receta) return 0;

  const tallasNecesarias = [...cantPorTalla.keys()] as ('T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD' | 'TU')[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  // Filtro por SERVICIO DESTINO (pedido del cliente 22/07/2026): la OS de OJAL
  // BOTÓN jala solo los materiales marcados "va al serv. botón" (los botones);
  // los demás servicios (confección incluida) jalan los "va al taller de conf."
  const esOjalBoton = proceso === 'OJAL_BOTON';
  const flagServicio = esOjalBoton ? 'sale_a_ojal_boton' : 'sale_a_servicio';
  const { data: lineasReceta } = await sbAny
    .from('recetas_lineas')
    .select('material_id, talla, cantidad, cantidad_almacen')
    .eq('receta_id', receta.id)
    .eq(flagServicio, true)
    .in('talla', tallasNecesarias);

  const aviosMap = new Map<string, number>();
  for (const lr of (lineasReceta ?? []) as { material_id: string; talla: string; cantidad: number; cantidad_almacen: number | null }[]) {
    const cantUnidades = cantPorTalla.get(lr.talla as string) ?? 0;
    if (cantUnidades <= 0) continue;
    const cantAlTaller = Math.max(0, Number(lr.cantidad) - Number(lr.cantidad_almacen ?? 0));
    if (cantAlTaller <= 0) continue;
    const matId = lr.material_id as string;
    aviosMap.set(matId, (aviosMap.get(matId) ?? 0) + cantAlTaller * cantUnidades);
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
  return aviosMap.size;
}

/**
 * Variante: poblar líneas de OS directamente desde ot_lineas (sin corte
 * vinculado). Usa cantidad_cortada si > 0, sino cantidad_planificada.
 * Acepta filtro opcional de tallas. Los avíos se generan igual desde la
 * receta activa del producto (pedido del cliente 21/07/2026: la OS debe
 * mostrar los avíos aunque se cree directo desde la OT, sin corte).
 */
async function poblarLineasOSDesdeOT(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  osId: string,
  otId: string,
  tallasFiltro?: string[],
  proceso = 'COSTURA',
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
      talla: l.talla as 'T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD' | 'TU',
      cantidad: Number(l.cantidad_cortada ?? 0) > 0 ? Number(l.cantidad_cortada) : Number(l.cantidad_planificada ?? 0),
    }))
    .filter((l) => l.cantidad > 0 && (!filtroSet || filtroSet.has(l.talla)));
  if (candidatas.length === 0) return { lineas: 0, avios: 0 };
  const { error: errIns } = await sb.from('ordenes_servicio_lineas').insert(
    candidatas.map((c) => ({ os_id: osId, producto_id: c.producto_id, talla: c.talla, cantidad: c.cantidad })),
  );
  if (errIns) throw new Error(`OS lineas (OT): ${errIns.message}`);

  // Avíos por producto (la OT puede tener varios): agrupamos cantidad por talla.
  const porProducto = new Map<string, Map<string, number>>();
  for (const c of candidatas) {
    const m = porProducto.get(c.producto_id) ?? new Map<string, number>();
    m.set(c.talla, (m.get(c.talla) ?? 0) + c.cantidad);
    porProducto.set(c.producto_id, m);
  }
  let avios = 0;
  for (const [productoId, cantPorTalla] of porProducto) {
    avios += await generarAviosOS(sb, osId, productoId, cantPorTalla, proceso);
  }
  return { lineas: candidatas.length, avios };
}

/**
 * Núcleo de creación de la OS (sin gate de gerencia): inserta la orden, puebla
 * líneas/avíos y recalcula totales. Se usa tanto desde crearOS (gerente directo)
 * como desde aprobarSolicitudOS (al aprobar una solicitud). `precioServAutoritativo`
 * fuerza el monto_base de servicios no-confección cuando aplica (no-gerente).
 */
async function insertarOSCore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  creadoPor: string,
  data: z.infer<typeof osSchema>,
  tallasFiltro: string[],
  precioServAutoritativo: number | null,
): Promise<{ id: string; lineas: number; avios: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const esConfeccion = data.proceso === 'COSTURA';
  const movUnit = esConfeccion ? data.movilidad_por_unidad : 0;
  const campanaUnit = esConfeccion && data.es_campana ? data.campana_por_unidad : 0;

  const { data: nro } = await sb.rpc('next_correlativo', { p_clave: 'OS', p_padding: 6 });
  const { data: row, error } = await sbAny.from('ordenes_servicio').insert({
    numero: `OS-${nro}`,
    corte_id: data.corte_id || null,
    ot_id: data.ot_id,
    taller_id: data.taller_id,
    proceso: data.proceso,
    fecha_envio: data.fecha_envio || null,
    fecha_entrega_esperada: data.fecha_entrega_esperada || null,
    monto_base: data.monto_base,
    adicional_movilidad: 0,
    adicional_campana: 0,
    movilidad_por_unidad: movUnit,
    campana_por_unidad: campanaUnit,
    es_campana: esConfeccion && data.es_campana,
    observaciones: data.observaciones || null,
    cuidados: data.cuidados || null,
    consideraciones: data.consideraciones || null,
    creado_por: creadoPor,
    estado: 'EMITIDA',
  }).select('id').single();
  if (error) throw new Error(error.message);

  let extras = { lineas: 0, avios: 0 };
  if (data.corte_id) {
    try {
      extras = await poblarLineasYAviosOS(sb, row.id as string, data.corte_id, tallasFiltro.length > 0 ? tallasFiltro : undefined, data.proceso);
    } catch (e) {
      await sb.from('ordenes_servicio').delete().eq('id', row.id);
      throw new Error(`No se pudieron poblar líneas/avíos: ${(e as Error).message}`);
    }
  } else if (data.ot_id && tallasFiltro.length > 0) {
    try {
      extras = await poblarLineasOSDesdeOT(sb, row.id as string, data.ot_id, tallasFiltro, data.proceso);
    } catch (e) {
      await sb.from('ordenes_servicio').delete().eq('id', row.id);
      throw new Error(`No se pudieron poblar líneas desde OT: ${(e as Error).message}`);
    }
  }

  const { data: lineasOs } = await sb.from('ordenes_servicio_lineas').select('cantidad').eq('os_id', row.id);
  const totalUnidades = (lineasOs ?? []).reduce((s: number, l: { cantidad: number | null }) => s + Number(l.cantidad ?? 0), 0);
  const totalMovilidad = Math.round(movUnit * totalUnidades * 100) / 100;
  const totalCampana = Math.round(campanaUnit * totalUnidades * 100) / 100;
  if (totalMovilidad > 0 || totalCampana > 0) {
    await sbAny.from('ordenes_servicio').update({ adicional_movilidad: totalMovilidad, adicional_campana: totalCampana }).eq('id', row.id);
  }
  if (!esConfeccion && precioServAutoritativo != null) {
    const montoAuto = Math.round(precioServAutoritativo * totalUnidades * 100) / 100;
    await sbAny.from('ordenes_servicio').update({ monto_base: montoAuto }).eq('id', row.id);
  }
  return { id: row.id as string, ...extras };
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
      fecha_envio: fd.get('fecha_envio') || '',
      fecha_entrega_esperada: fd.get('fecha_entrega_esperada') || '',
      monto_base: fd.get('monto_base') || 0,
      // Vacío ⇒ usa el default (S/ 0.10). No lo forzamos a 0 para no disparar
      // la validación de gerencia cuando el usuario simplemente lo deja en blanco.
      movilidad_por_unidad: (fd.get('movilidad_por_unidad') as string) || String(MOVILIDAD_DEFAULT_OS),
      campana_por_unidad: fd.get('campana_por_unidad') || 0,
      es_campana: fd.get('es_campana') === 'on',
      observaciones: fd.get('observaciones') || '',
      cuidados: fd.get('cuidados') || '',
      consideraciones: fd.get('consideraciones') || '',
    });
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const esGteFlag = await esGerente();

    // La MOVILIDAD y la CAMPAÑA solo aplican al proceso de CONFECCIÓN (COSTURA).
    // Para otros servicios (bordado, estampado, ojal-botón, etc.) el costo es
    // solo el precio por unidad (monto_base): sin movilidad ni campaña
    // (pedido del cliente 22/07/2026).
    const esConfeccion = data.proceso === 'COSTURA';
    const movUnit = esConfeccion ? data.movilidad_por_unidad : 0;
    const campanaUnit = esConfeccion && data.es_campana ? data.campana_por_unidad : 0;

    // AUTORIZACIÓN DE GERENCIA (solo confección): la movilidad sale S/ 0.10 por
    // unidad en automático. Cambiar ese valor —o cargar campaña— requiere gerente.
    if (esConfeccion) {
      const movModificada = Math.abs(movUnit - MOVILIDAD_DEFAULT_OS) > 0.001;
      const campanaAplicada = campanaUnit > 0;
      if ((movModificada || campanaAplicada) && !esGteFlag) {
        const que = [
          movModificada ? `la movilidad (S/ ${movUnit.toFixed(2)} en vez de S/ ${MOVILIDAD_DEFAULT_OS.toFixed(2)})` : null,
          campanaAplicada ? `el adicional de campaña (S/ ${campanaUnit.toFixed(2)})` : null,
        ].filter(Boolean).join(' y ');
        throw new Error(`Modificar ${que} requiere autorización de gerencia. Ingrese con un usuario gerente para continuar.`);
      }
    }

    // AUTORIZACIÓN DE GERENCIA (servicios NO confección): el precio por unidad
    // sale del tarifario del modelo. Solo gerencia puede fijar/override un precio
    // distinto (pedido cliente 2026-08-16). Para no-gerentes recalculamos el
    // monto_base con el precio del tarifario × unidades, ignorando lo enviado; si
    // no hay tarifa cargada, no se puede crear la OS.
    let precioServAutoritativo: number | null = null;
    if (!esConfeccion && !esGteFlag) {
      let prodId: string | null = null;
      if (data.corte_id) {
        const { data: c } = await sb.from('ot_corte').select('producto_id').eq('id', data.corte_id).maybeSingle();
        prodId = (c?.producto_id as string) ?? null;
      } else if (data.ot_id) {
        const { data: ol } = await sb.from('ot_lineas').select('producto_id').eq('ot_id', data.ot_id).limit(1).maybeSingle();
        prodId = (ol?.producto_id as string) ?? null;
      }
      const hoyISO = new Date().toISOString().slice(0, 10);
      const { data: tar } = await sbAny
        .from('tarifas_servicios')
        .select('precio_unitario, producto_id, talla, vigente_desde, vigente_hasta')
        .eq('proceso', data.proceso);
      const filas = ((tar ?? []) as { precio_unitario: number; producto_id: string | null; talla: string | null; vigente_desde: string | null; vigente_hasta: string | null }[])
        .filter((r) => (!r.vigente_desde || r.vigente_desde <= hoyISO) && (!r.vigente_hasta || r.vigente_hasta >= hoyISO));
      const delModelo = prodId ? filas.find((r) => r.producto_id === prodId && !r.talla) : undefined;
      const generica = filas.find((r) => !r.producto_id && !r.talla);
      const winner = delModelo ?? generica ?? null;
      if (!winner) {
        throw new Error('No hay tarifa configurada para este servicio/modelo. Pídele a gerencia que la cargue en Configuración → Tarifas de servicios, o que cree la OS con el precio.');
      }
      precioServAutoritativo = Number(winner.precio_unitario);
    }

    const tallasFiltro = fd.getAll('tallas_seleccionadas').map((v) => String(v)).filter(Boolean);
    return await insertarOSCore(sb, userId, data, tallasFiltro, precioServAutoritativo);
  });
  // Sin redirect server-side: el cliente navega después de mostrar el toast
  // con el resumen (líneas + avíos cargados). Patrón consistente con
  // crearCorte y eliminarTaller — evita que el redirect interrumpa el
  // useTransition antes de que el toast se renderice.
  if (r.ok) await bumpPaths('/servicios');
  return r;
}

// ============================================================================
// SOLICITUDES DE APROBACIÓN DE OS (campaña / movilidad) — flujo diferido
// ============================================================================
// Pedido del cliente 2026-08-17: un no-gerente puede ingresar el precio de
// campaña/movilidad, pero en vez de crear la OS envía una SOLICITUD. Gerencia
// recibe una notificación; al aprobar, la OS se genera automáticamente.

/** Un no-gerente envía una solicitud para crear una OS con campaña/movilidad. */
export async function solicitarAprobacionOS(
  _prev: unknown,
  fd: FormData,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = osSchema.parse({
      corte_id: fd.get('corte_id') || '',
      ot_id: fd.get('ot_id'),
      taller_id: fd.get('taller_id'),
      proceso: fd.get('proceso') || 'COSTURA',
      fecha_envio: fd.get('fecha_envio') || '',
      fecha_entrega_esperada: fd.get('fecha_entrega_esperada') || '',
      monto_base: fd.get('monto_base') || 0,
      movilidad_por_unidad: (fd.get('movilidad_por_unidad') as string) || String(MOVILIDAD_DEFAULT_OS),
      campana_por_unidad: fd.get('campana_por_unidad') || 0,
      es_campana: fd.get('es_campana') === 'on',
      observaciones: fd.get('observaciones') || '',
      cuidados: fd.get('cuidados') || '',
      consideraciones: fd.get('consideraciones') || '',
    });
    const motivo = ((fd.get('motivo_solicitud') as string) || '').trim();
    const tallasFiltro = fd.getAll('tallas_seleccionadas').map((v) => String(v)).filter(Boolean);
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const payload = { ...data, tallas_seleccionadas: tallasFiltro };
    const { data: sol, error } = await sbAny.from('solicitudes_os').insert({
      estado: 'PENDIENTE',
      solicitante_id: userId,
      ot_id: data.ot_id,
      taller_id: data.taller_id,
      proceso: data.proceso,
      monto_base: data.monto_base,
      movilidad_por_unidad: data.movilidad_por_unidad,
      campana_por_unidad: data.campana_por_unidad,
      es_campana: data.es_campana,
      payload,
      motivo_solicitud: motivo || null,
    }).select('id').single();
    if (error) throw new Error(error.message);

    // Notificar a gerencia (fan-out por usuario para leído individual)
    const { data: gerentes } = await sbAny.from('usuarios_roles').select('usuario_id').eq('rol', 'gerente');
    const ids = [...new Set(((gerentes ?? []) as { usuario_id: string }[]).map((g) => g.usuario_id))];
    const { data: perfil } = await sbAny.from('perfiles').select('nombre_completo').eq('id', userId).maybeSingle();
    const solicitante = (perfil as { nombre_completo?: string } | null)?.nombre_completo ?? 'Un usuario';
    const detalle = data.es_campana
      ? `campaña S/ ${Number(data.campana_por_unidad).toFixed(2)} por unidad`
      : `movilidad S/ ${Number(data.movilidad_por_unidad).toFixed(2)} por unidad`;
    if (ids.length > 0) {
      await sbAny.from('notificaciones').insert(ids.map((uid) => ({
        destinatario_usuario_id: uid,
        tipo: 'APROBACION_OS',
        titulo: 'Nueva solicitud de OS por aprobar',
        mensaje: `${solicitante} solicita crear una OS con ${detalle}${motivo ? ` · ${motivo}` : ''}.`,
        enlace: '/servicios/solicitudes',
        meta: { solicitud_id: sol.id },
      })));
    }
    return { id: sol.id as string };
  });
  if (r.ok) await bumpPaths('/servicios', '/servicios/solicitudes');
  return r;
}

/** Gerencia aprueba una solicitud: genera la OS automáticamente y avisa. */
export async function aprobarSolicitudOS(solicitudId: string): Promise<ActionResult<{ osId: string }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    if (!(await esGerente())) throw new Error('Solo gerencia puede aprobar solicitudes.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: sol } = await sbAny.from('solicitudes_os').select('*').eq('id', solicitudId).maybeSingle();
    if (!sol) throw new Error('Solicitud no encontrada');
    if (sol.estado !== 'PENDIENTE') throw new Error(`La solicitud ya está ${String(sol.estado).toLowerCase()}.`);

    const payload = sol.payload as z.input<typeof osSchema> & { tallas_seleccionadas?: string[] };
    const data = osSchema.parse(payload);
    const tallas = (payload.tallas_seleccionadas ?? []) as string[];

    // Crear la OS con los valores solicitados (ya autorizados por gerencia).
    const res = await insertarOSCore(sb, (sol.solicitante_id as string) ?? userId, data, tallas, null);

    // Marcar aprobada de forma atómica (evita doble aprobación).
    const { count } = await sbAny.from('solicitudes_os')
      .update({ estado: 'APROBADA', aprobador_id: userId, os_generada_id: res.id, resuelto_en: new Date().toISOString() }, { count: 'exact' })
      .eq('id', solicitudId).eq('estado', 'PENDIENTE');
    if ((count ?? 0) === 0) {
      await sbAny.from('ordenes_servicio').delete().eq('id', res.id);
      throw new Error('La solicitud fue resuelta por otra persona. Recargá la página.');
    }

    if (sol.solicitante_id) {
      await sbAny.from('notificaciones').insert({
        destinatario_usuario_id: sol.solicitante_id,
        tipo: 'APROBACION_OS',
        titulo: 'Tu solicitud de OS fue aprobada ✅',
        mensaje: 'Gerencia aprobó la solicitud y la orden de servicio se generó automáticamente.',
        enlace: `/servicios/${res.id}`,
        meta: { solicitud_id: solicitudId, os_id: res.id },
      });
    }
    return { osId: res.id };
  });
  if (r.ok) await bumpPaths('/servicios', '/servicios/solicitudes');
  return r;
}

/** Gerencia rechaza una solicitud y avisa al solicitante. */
export async function rechazarSolicitudOS(solicitudId: string, motivo: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    if (!(await esGerente())) throw new Error('Solo gerencia puede rechazar solicitudes.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: sol } = await sbAny.from('solicitudes_os').select('solicitante_id, estado').eq('id', solicitudId).maybeSingle();
    if (!sol) throw new Error('Solicitud no encontrada');
    if (sol.estado !== 'PENDIENTE') throw new Error(`La solicitud ya está ${String(sol.estado).toLowerCase()}.`);

    const { error } = await sbAny.from('solicitudes_os')
      .update({ estado: 'RECHAZADA', aprobador_id: userId, motivo_rechazo: motivo?.trim() || null, resuelto_en: new Date().toISOString() })
      .eq('id', solicitudId).eq('estado', 'PENDIENTE');
    if (error) throw new Error(error.message);

    if (sol.solicitante_id) {
      await sbAny.from('notificaciones').insert({
        destinatario_usuario_id: sol.solicitante_id,
        tipo: 'APROBACION_OS',
        titulo: 'Tu solicitud de OS fue rechazada',
        mensaje: motivo?.trim() ? `Motivo: ${motivo.trim()}` : 'La solicitud fue rechazada por gerencia.',
        enlace: '/servicios/solicitudes',
        meta: { solicitud_id: solicitudId },
      });
    }
    return null;
  });
  if (r.ok) await bumpPaths('/servicios/solicitudes');
  return r;
}

/**
 * Recalcula avíos y totales (movilidad/campaña) de una OS a partir de sus
 * líneas actuales. Se usa al editar una OS antes del despacho: borra los
 * avíos previos y los regenera con las nuevas cantidades, y recompone los
 * adicionales = por_unidad × unidades enviadas.
 */
async function recomputarAviosYTotalesOS(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  osId: string,
): Promise<void> {
  // Proceso de la OS (para filtrar los avíos por servicio destino).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbProc = sb as unknown as { from: (t: string) => any };
  const { data: osProc } = await sbProc.from('ordenes_servicio').select('proceso').eq('id', osId).maybeSingle();
  const procesoOS = (osProc?.proceso as string) || 'COSTURA';

  // 1) Líneas actuales agrupadas por producto/talla
  const { data: lineas } = await sb
    .from('ordenes_servicio_lineas')
    .select('producto_id, talla, cantidad')
    .eq('os_id', osId);
  const porProducto = new Map<string, Map<string, number>>();
  let totalUnidades = 0;
  for (const l of (lineas ?? []) as { producto_id: string; talla: string; cantidad: number }[]) {
    const cant = Number(l.cantidad ?? 0);
    totalUnidades += cant;
    if (cant <= 0) continue;
    const m = porProducto.get(l.producto_id) ?? new Map<string, number>();
    m.set(l.talla, (m.get(l.talla) ?? 0) + cant);
    porProducto.set(l.producto_id, m);
  }

  // 2) Regenerar avíos: borrar y recalcular desde la receta (según el proceso).
  await sb.from('ordenes_servicio_avios').delete().eq('os_id', osId);
  for (const [productoId, cantPorTalla] of porProducto) {
    await generarAviosOS(sb, osId, productoId, cantPorTalla, procesoOS);
  }

  // 3) Recomponer totales de adicionales con los por-unidad actuales
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: osRow } = await sbAny
    .from('ordenes_servicio')
    .select('movilidad_por_unidad, campana_por_unidad')
    .eq('id', osId)
    .maybeSingle();
  const movUnit = Number(osRow?.movilidad_por_unidad ?? 0);
  const campUnit = Number(osRow?.campana_por_unidad ?? 0);
  await sbAny
    .from('ordenes_servicio')
    .update({
      adicional_movilidad: Math.round(movUnit * totalUnidades * 100) / 100,
      adicional_campana: Math.round(campUnit * totalUnidades * 100) / 100,
    })
    .eq('id', osId);
}

/**
 * Edita una OS ANTES del despacho (estado EMITIDA): permite cambiar el taller,
 * la fecha de envío / entrega y las cantidades por línea (pedido del cliente
 * 21/07/2026). Al guardar, regenera avíos y recompone los totales. Una vez
 * despachada (o más adelante) ya no se puede editar por acá.
 */
const editarOSLineaSchema = z.object({
  id: z.string().uuid(),
  cantidad: z.coerce.number().int().min(0).default(0),
});
export async function editarOS(
  osId: string,
  payload: {
    tallerId: string;
    fechaEnvio: string;
    fechaEntrega: string;
    montoBase: number;
    lineas: z.input<typeof editarOSLineaSchema>[];
  },
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const tallerId = z.string().uuid().parse(payload.tallerId);
    const montoBase = z.coerce.number().min(0).parse(payload.montoBase);
    const lineas = payload.lineas.map((l) => editarOSLineaSchema.parse(l));
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: osRow } = await sbAny.from('ordenes_servicio').select('estado').eq('id', osId).maybeSingle();
    if (!osRow) throw new Error('OS no encontrada');
    if (osRow.estado !== 'EMITIDA') {
      throw new Error('Solo se puede modificar una OS que aún está EMITIDA (antes del despacho al taller).');
    }

    // Validar líneas contra las de la OS
    const { data: lineasOs } = await sbAny
      .from('ordenes_servicio_lineas')
      .select('id')
      .eq('os_id', osId);
    const idsOs = new Set(((lineasOs ?? []) as { id: string }[]).map((l) => l.id));
    for (const l of lineas) if (!idsOs.has(l.id)) throw new Error('Línea de OS no encontrada');

    // Cabecera: taller, fechas, monto base
    const { error: e1 } = await sbAny
      .from('ordenes_servicio')
      .update({
        taller_id: tallerId,
        fecha_envio: payload.fechaEnvio || null,
        fecha_entrega_esperada: payload.fechaEntrega || null,
        monto_base: montoBase,
      })
      .eq('id', osId);
    if (e1) throw new Error(e1.message);

    // Cantidades por línea
    for (const l of lineas) {
      const { error } = await sbAny
        .from('ordenes_servicio_lineas')
        .update({ cantidad: l.cantidad })
        .eq('id', l.id)
        .eq('os_id', osId);
      if (error) throw new Error(error.message);
    }

    // Regenerar avíos + totales con las nuevas cantidades
    await recomputarAviosYTotalesOS(sb, osId);
    return null;
  });
  if (r.ok) await bumpPaths(`/servicios/${osId}`, '/servicios');
  return r;
}

/**
 * Regenera los avíos de una OS existente desde la receta activa (backfill).
 * Útil para OS creadas antes de que el flujo directo-desde-OT generara avíos.
 * No toca cantidades ni estado — solo recompone avíos y totales.
 */
export async function regenerarAviosOS(osId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    await recomputarAviosYTotalesOS(sb, osId);
    return null;
  });
  if (r.ok) await bumpPaths(`/servicios/${osId}`);
  return r;
}

/**
 * Registra la RECEPCIÓN de la OS: fecha de retorno + unidades recepcionadas
 * (aprobadas) y falladas por línea. Marca la OS como RECEPCIONADA (pedido del
 * cliente 21/07/2026). Con esto se habilitan las operaciones post-confección
 * en la OT.
 */
const recepcionLineaSchema = z.object({
  id: z.string().uuid(),
  recepcionada: z.coerce.number().int().min(0).default(0),
  fallada: z.coerce.number().int().min(0).default(0),
});
export async function registrarRecepcionOS(
  osId: string,
  fechaRetorno: string,
  lineas: z.input<typeof recepcionLineaSchema>[],
  motivoFalla?: string,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const parsed = lineas.map((l) => recepcionLineaSchema.parse(l));
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    const { data: osRow } = await sbAny.from('ordenes_servicio').select('estado').eq('id', osId).maybeSingle();
    if (!osRow) throw new Error('OS no encontrada');
    if (osRow.estado === 'ANULADA') throw new Error('La OS está anulada.');

    // Validar contra lo enviado por línea (no se puede recibir más de lo enviado).
    const { data: lineasEnv } = await sbAny
      .from('ordenes_servicio_lineas')
      .select('id, cantidad')
      .eq('os_id', osId);
    const enviadoPorId = new Map<string, number>(
      ((lineasEnv ?? []) as { id: string; cantidad: number }[]).map((l) => [l.id, Number(l.cantidad ?? 0)]),
    );
    for (const l of parsed) {
      const env = enviadoPorId.get(l.id);
      if (env === undefined) throw new Error('Línea de OS no encontrada');
      if (l.recepcionada + l.fallada > env) {
        throw new Error(`Recepcionadas + falladas (${l.recepcionada + l.fallada}) no puede superar lo enviado (${env}).`);
      }
    }

    for (const l of parsed) {
      const { error } = await sbAny
        .from('ordenes_servicio_lineas')
        .update({ cantidad_recepcionada: l.recepcionada, cantidad_fallada: l.fallada })
        .eq('id', l.id)
        .eq('os_id', osId);
      if (error) throw new Error(error.message);
    }

    // ENTREGAS PARCIALES (pedido del cliente 21/07/2026): en campaña el taller
    // devuelve la mercadería en varias veces. El estado refleja si ya volvió
    // TODO (RECEPCIONADA) o solo una parte (RECEPCION_PARCIAL). Se compara el
    // total procesado (recepcionadas + falladas) contra el total enviado.
    const totalEnviado = [...enviadoPorId.values()].reduce((s, v) => s + v, 0);
    const totalProcesado = parsed.reduce((s, l) => s + l.recepcionada + l.fallada, 0);
    let nuevoEstado: string;
    if (['CERRADA', 'ANULADA'].includes(osRow.estado)) {
      nuevoEstado = osRow.estado;
    } else if (totalEnviado > 0 && totalProcesado >= totalEnviado) {
      nuevoEstado = 'RECEPCIONADA';
    } else if (totalProcesado > 0) {
      nuevoEstado = 'RECEPCION_PARCIAL';
    } else {
      nuevoEstado = osRow.estado; // nada recibido aún: no cambia
    }

    const hayFallas = parsed.some((l) => l.fallada > 0);
    const { error: e2 } = await sbAny
      .from('ordenes_servicio')
      .update({
        fecha_recepcion: fechaRetorno || null,
        estado: nuevoEstado,
        // Solo persistimos motivo si hay fallas; si no, lo limpiamos.
        motivo_falla: hayFallas ? (motivoFalla?.trim() || null) : null,
      })
      .eq('id', osId);
    if (e2) throw new Error(e2.message);
    return null;
  });
  // Refrescar OS + OT (para habilitar operaciones post-confección).
  if (r.ok) await bumpPaths(`/servicios/${osId}`, '/servicios', '/ot');
  return r;
}

/**
 * Registra los AVÍOS DEVUELTOS por el taller (pedido del cliente 22/07/2026):
 * cantidad devuelta + observación por cada avío enviado. No puede superar lo
 * enviado. Se visualiza en el reporte de "Avíos enviados" de la OS.
 */
const avioDevueltoSchema = z.object({
  id: z.string().uuid(),
  devuelto: z.coerce.number().min(0).default(0),
  observacion: z.string().optional().or(z.literal('')),
});
export async function registrarAviosDevueltos(
  osId: string,
  avios: z.input<typeof avioDevueltoSchema>[],
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const parsed = avios.map((a) => avioDevueltoSchema.parse(a));
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: enviados } = await sbAny
      .from('ordenes_servicio_avios')
      .select('id, material_id, cantidad_enviada, cantidad_devuelta')
      .eq('os_id', osId);
    type AvioRow = { id: string; material_id: string | null; cantidad_enviada: number; cantidad_devuelta: number | null };
    const envMap = new Map<string, number>(
      ((enviados ?? []) as AvioRow[]).map((e) => [e.id, Number(e.cantidad_enviada ?? 0)]),
    );
    const prevDevMap = new Map<string, number>(
      ((enviados ?? []) as AvioRow[]).map((e) => [e.id, Number(e.cantidad_devuelta ?? 0)]),
    );
    const matMap = new Map<string, string | null>(
      ((enviados ?? []) as AvioRow[]).map((e) => [e.id, e.material_id]),
    );
    for (const a of parsed) {
      const env = envMap.get(a.id);
      if (env === undefined) throw new Error('Avío no encontrado en esta OS');
      if (a.devuelto > env + 0.0001) {
        throw new Error(`La cantidad devuelta (${a.devuelto}) no puede superar lo enviado (${env}).`);
      }
      const { error } = await sbAny
        .from('ordenes_servicio_avios')
        .update({ cantidad_devuelta: a.devuelto, observacion: a.observacion?.trim() || null })
        .eq('id', a.id)
        .eq('os_id', osId);
      if (error) throw new Error(error.message);
    }

    // Reingresar al almacén de MP el DELTA de avíos devueltos (solo lo nuevo que
    // volvió desde la última vez). Best-effort: no bloquea el registro.
    try {
      const almId = await almacenMateriaPrimaId(sbAny);
      if (almId) {
        const { data: os } = await sbAny.from('ordenes_servicio').select('numero').eq('id', osId).maybeSingle();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const movs: any[] = [];
        for (const a of parsed) {
          const materialId = matMap.get(a.id);
          const delta = Number(a.devuelto) - Number(prevDevMap.get(a.id) ?? 0);
          if (!materialId || Math.abs(delta) < 0.0001) continue;
          movs.push({
            tipo: delta > 0 ? 'ENTRADA_DEVOLUCION_TALLER' : 'SALIDA_AJUSTE',
            almacen_id: almId,
            material_id: materialId,
            cantidad: Math.abs(delta),
            referencia_tipo: 'OS',
            referencia_id: osId,
            usuario_id: userId,
            observacion: `${delta > 0 ? 'Avíos devueltos del taller' : 'Corrección avíos devueltos'} · OS ${os?.numero ?? ''}`.trim(),
          });
        }
        if (movs.length > 0) await sbAny.from('kardex_movimientos').insert(movs);
      }
    } catch { /* no bloquea el registro de la devolución */ }

    return null;
  });
  if (r.ok) await bumpPaths(`/servicios/${osId}`);
  return r;
}

/**
 * Retorna al servicio (taller) las prendas identificadas con FALLA: crea una
 * NUEVA orden de servicio de RE-TRABAJO con las cantidades falladas por talla,
 * al mismo taller y proceso. No re-envía avíos (es solo reproceso de mano de
 * obra). Pedido del cliente 22/07/2026.
 */
export async function retornarFallasAlServicio(
  osId: string,
): Promise<ActionResult<{ id: string; numero: string; unidades: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any; rpc: (fn: string, args: any) => any };

    const { data: os } = await sbAny
      .from('ordenes_servicio')
      .select('numero, taller_id, ot_id, corte_id, proceso')
      .eq('id', osId)
      .maybeSingle();
    if (!os) throw new Error('OS no encontrada');

    const { data: lineas } = await sbAny
      .from('ordenes_servicio_lineas')
      .select('producto_id, talla, cantidad_fallada')
      .eq('os_id', osId);
    const conFalla = ((lineas ?? []) as { producto_id: string; talla: string; cantidad_fallada: number | null }[])
      .filter((l) => Number(l.cantidad_fallada ?? 0) > 0);
    if (conFalla.length === 0) throw new Error('Esta OS no tiene prendas falladas para retornar.');

    const { data: nro } = await sbAny.rpc('next_correlativo', { p_clave: 'OS', p_padding: 6 });
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: row, error } = await sbAny.from('ordenes_servicio').insert({
      numero: `OS-${nro}`,
      corte_id: os.corte_id || null,
      ot_id: os.ot_id,
      taller_id: os.taller_id,
      proceso: os.proceso,
      fecha_envio: hoy,
      monto_base: 0,
      adicional_movilidad: 0,
      adicional_campana: 0,
      movilidad_por_unidad: 0,
      campana_por_unidad: 0,
      es_campana: false,
      observaciones: `Re-trabajo de fallas de ${os.numero}`,
      creado_por: userId,
      estado: 'EMITIDA',
    }).select('id').single();
    if (error) throw new Error(error.message);

    const filas = conFalla.map((l) => ({
      os_id: row.id as string,
      producto_id: l.producto_id,
      talla: l.talla,
      cantidad: Number(l.cantidad_fallada ?? 0),
    }));
    const { error: errL } = await sbAny.from('ordenes_servicio_lineas').insert(filas);
    if (errL) throw new Error(errL.message);

    const unidades = filas.reduce((s, f) => s + f.cantidad, 0);
    return { id: row.id as string, numero: `OS-${nro}`, unidades };
  });
  if (r.ok) await bumpPaths('/servicios');
  return r;
}

/**
 * Máquina de estados de la OS (server-side).
 * EMITIDA → DESPACHADA → EN_PROCESO → RECEPCIONADA → CERRADA
 * ANULADA es accesible desde cualquier estado activo (no desde finales).
 */
const FLOW_OS: Record<string, string[]> = {
  EMITIDA:            ['DESPACHADA', 'ANULADA'],
  DESPACHADA:         ['EN_PROCESO', 'ANULADA'],
  EN_PROCESO:         ['RECEPCIONADA', 'ANULADA'],
  // Recepción parcial: la recepción se completa desde el editor; desde acá solo
  // se puede cerrar (si ya volvió todo) o anular.
  RECEPCION_PARCIAL:  ['RECEPCIONADA', 'CERRADA', 'ANULADA'],
  RECEPCIONADA:       ['CERRADA', 'ANULADA'],
  CERRADA:            [],
  ANULADA:            [],
};

export async function cambiarEstadoOS(osId: string, nuevoEstado: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
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

    const update: { estado: string; fecha_recepcion?: string; fecha_envio?: string } = { estado: nuevoEstado };
    if (nuevoEstado === 'RECEPCIONADA') update.fecha_recepcion = new Date().toISOString().slice(0, 10);
    // Al DESPACHAR, la fecha de envío al taller se actualiza a la fecha real de
    // despacho (pedido del cliente 22/07/2026): antes quedaba con la fecha de
    // creación de la OS aunque se despachara días después.
    if (nuevoEstado === 'DESPACHADA') update.fecha_envio = new Date().toISOString().slice(0, 10);

    // Cast: fecha_envio/motivo_falla son de migraciones recientes aún no
    // reflejadas en los tipos autogenerados.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    // Update con WHERE en estado actual para atomicidad
    const { error, count } = await sbAny
      .from('ordenes_servicio')
      .update(update, { count: 'exact' })
      .eq('id', osId)
      .eq('estado', estadoActual);
    if (error) throw new Error(error.message);
    if ((count ?? 0) === 0) {
      throw new Error('La OS cambió de estado mientras procesabas. Recargá la página.');
    }

    // Al DESPACHAR al taller, descontar los avíos enviados del almacén de MP
    // (SALIDA_TALLER_SERVICIO). Best-effort: no revierte el cambio de estado.
    if (nuevoEstado === 'DESPACHADA') {
      try { await descontarAviosOS(sbAny, osId, userId); } catch { /* no bloquea el despacho */ }
    }
    return null;
  });
  if (r.ok) await bumpPaths(`/servicios/${osId}`, '/servicios');
  return r;
}
