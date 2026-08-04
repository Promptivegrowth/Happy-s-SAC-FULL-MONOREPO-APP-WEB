'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, esGerente, type ActionResult } from './_helpers';
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
});
export async function guardarTiemposCorte(
  corteId: string,
  tiempos: z.input<typeof tiempoTelaSchema>[],
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const parsed = tiempos.map((t) => tiempoTelaSchema.parse(t));
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
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
          },
          { onConflict: 'corte_id,material_id' },
        );
      if (error) throw new Error(error.message);
    }
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
  const avios = await generarAviosOS(sb, osId, productoId, cantPorTalla);

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
  const { data: lineasReceta } = await sb
    .from('recetas_lineas')
    .select('material_id, talla, cantidad, cantidad_almacen')
    .eq('receta_id', receta.id)
    .eq('sale_a_servicio', true)
    .in('talla', tallasNecesarias);

  const aviosMap = new Map<string, number>();
  for (const lr of lineasReceta ?? []) {
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
    avios += await generarAviosOS(sb, osId, productoId, cantPorTalla);
  }
  return { lineas: candidatas.length, avios };
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

    // CAMPAÑA solo aplica si el check "Es campaña" está en SÍ (pedido del
    // cliente 21/07/2026). Si no es campaña, el adicional se fuerza a 0 aunque
    // venga un valor en el campo.
    const campanaUnit = data.es_campana ? data.campana_por_unidad : 0;

    // AUTORIZACIÓN DE GERENCIA (pedido del cliente 21/07/2026): la movilidad
    // sale S/ 0.10 por unidad en automático. Cambiar ese valor —o cargar
    // cualquier monto de campaña— requiere que el usuario sea gerente.
    const movModificada = Math.abs(data.movilidad_por_unidad - MOVILIDAD_DEFAULT_OS) > 0.001;
    const campanaAplicada = campanaUnit > 0;
    if ((movModificada || campanaAplicada) && !(await esGerente())) {
      const que = [
        movModificada ? `la movilidad (S/ ${data.movilidad_por_unidad.toFixed(2)} en vez de S/ ${MOVILIDAD_DEFAULT_OS.toFixed(2)})` : null,
        campanaAplicada ? `el adicional de campaña (S/ ${campanaUnit.toFixed(2)})` : null,
      ].filter(Boolean).join(' y ');
      throw new Error(`Modificar ${que} requiere autorización de gerencia. Ingrese con un usuario gerente para continuar.`);
    }

    const { data: nro } = await sb.rpc('next_correlativo', { p_clave: 'OS', p_padding: 6 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: row, error } = await sbAny.from('ordenes_servicio').insert({
      numero: `OS-${nro}`,
      corte_id: data.corte_id || null,
      ot_id: data.ot_id,
      taller_id: data.taller_id,
      proceso: data.proceso,
      fecha_envio: data.fecha_envio || null,
      fecha_entrega_esperada: data.fecha_entrega_esperada || null,
      monto_base: data.monto_base,
      // Inicialmente dejamos los totales en 0 — se recalculan tras poblar
      // las líneas (ya conocemos las unidades efectivamente enviadas).
      adicional_movilidad: 0,
      adicional_campana: 0,
      movilidad_por_unidad: data.movilidad_por_unidad,
      campana_por_unidad: campanaUnit,
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
    const totalCampana = Math.round(campanaUnit * totalUnidades * 100) / 100;
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
 * Recalcula avíos y totales (movilidad/campaña) de una OS a partir de sus
 * líneas actuales. Se usa al editar una OS antes del despacho: borra los
 * avíos previos y los regenera con las nuevas cantidades, y recompone los
 * adicionales = por_unidad × unidades enviadas.
 */
async function recomputarAviosYTotalesOS(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  osId: string,
): Promise<void> {
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

  // 2) Regenerar avíos: borrar y recalcular desde la receta
  await sb.from('ordenes_servicio_avios').delete().eq('os_id', osId);
  for (const [productoId, cantPorTalla] of porProducto) {
    await generarAviosOS(sb, osId, productoId, cantPorTalla);
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
