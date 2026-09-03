'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { runAction, requireUser, bumpPaths, esGerente, type ActionResult } from './_helpers';
import { formatTallaChip } from '@happy/lib';

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

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD', 'TU'] as const;

const agregarLineaSchema = z.object({
  producto_id: z.string().uuid(),
  talla: z.enum(TALLAS),
  cantidad_planificada: z.coerce.number().int().min(1),
  motivo: z.string().optional().or(z.literal('')),
});

export async function agregarLineaOT(otId: string, _prev: unknown, fd: FormData): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = agregarLineaSchema.parse({
      producto_id: fd.get('producto_id'),
      talla: fd.get('talla'),
      cantidad_planificada: fd.get('cantidad_planificada'),
      motivo: fd.get('motivo') || '',
    });
    const { sb, userId } = await requireUser();

    // Verificar que la OT no esté cerrada.
    const { data: ot } = await sb.from('ot').select('estado').eq('id', otId).single();
    if (!ot) throw new Error('OT no encontrada');
    if (ot.estado === 'COMPLETADA' || ot.estado === 'CANCELADA') {
      throw new Error('No se pueden agregar líneas a una OT cerrada');
    }

    // AUTORIZACIÓN DE GERENCIA (pedido del cliente 22/07/2026): agregar tallas a
    // una OT que ya salió de BORRADOR (ya está planificada / en producción) es
    // una excepción al plan — requiere gerente y un motivo, y queda en bitácora.
    if (ot.estado !== 'BORRADOR') {
      if (!(await esGerente())) {
        throw new Error('Agregar una talla a una OT ya planificada requiere autorización de gerencia.');
      }
      if (!(data.motivo ?? '').trim()) {
        throw new Error('Indique el motivo para agregar esta talla a la OT.');
      }
    }

    // Regla de negocio: una OT corresponde a UN solo producto. Si ya tiene
    // líneas con otro producto, rechazamos. Para producir otro producto del
    // mismo plan, crear una OT distinta.
    const { data: existentes } = await sb
      .from('ot_lineas')
      .select('producto_id')
      .eq('ot_id', otId)
      .limit(1);
    const productoExistente = (existentes ?? [])[0]?.producto_id as string | undefined;
    if (productoExistente && productoExistente !== data.producto_id) {
      throw new Error(
        'Esta OT ya tiene líneas de otro producto. Una OT corresponde a un solo producto: para producir otro, generá una OT separada en el mismo plan.',
      );
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

    // Registrar en bitácora la talla agregada fuera del plan (con motivo).
    if (ot.estado !== 'BORRADOR') {
      await sb.from('ot_eventos').insert({
        ot_id: otId,
        tipo: 'AUTORIZACION_CANTIDAD',
        usuario_id: userId,
        detalle: `Talla ${formatTallaChip(data.talla)} agregada (${data.cantidad_planificada} u) con autorización de gerencia. Motivo: ${(data.motivo ?? '').trim()}`,
      });
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
    // No se puede eliminar una línea que ya tiene corte declarado: borrarla
    // dejaría stock cortado sin trazabilidad y descuadraría el consumo real
    // (pedido cliente 2026-08-16). Primero hay que revertir el corte.
    const { data: linea } = await sb
      .from('ot_lineas')
      .select('talla, cantidad_cortada')
      .eq('id', lineaId)
      .maybeSingle();
    const cortada = Number((linea as { cantidad_cortada: number | null } | null)?.cantidad_cortada ?? 0);
    if (cortada > 0) {
      const talla = (linea as { talla: string } | null)?.talla ?? '';
      throw new Error(
        `No se puede eliminar la talla ${formatTallaChip(talla)}: ya tiene ${cortada} unidad(es) cortada(s). ` +
        'Anula o corrige el corte de esa talla antes de eliminar la línea.',
      );
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

    // COMPLETADA NO se marca por acá: solo se llega a COMPLETADA cerrando la OT
    // (cerrarOT → close_ot_atomic), que es lo que genera el ingreso a almacén,
    // los lotes PT y el kardex. Marcarla directo dejaba la OT "completada" sin
    // stock (bug reportado 21/07/2026).
    if (nuevoEstado === 'COMPLETADA') {
      throw new Error(
        'Para completar la OT use el botón "Cerrar OT" (genera el ingreso a almacén). ' +
        'No se puede marcar COMPLETADA sin cerrar.',
      );
    }

    // No se puede CANCELAR una OT que ya tiene trabajo registrado (pedido del
    // cliente 22/07/2026): corte declarado o cualquier proceso/tiempo registrado.
    if (nuevoEstado === 'CANCELADA') {
      const { data: lineasC } = await sb.from('ot_lineas').select('cantidad_cortada').eq('ot_id', otId);
      const cortado = ((lineasC ?? []) as { cantidad_cortada: number | null }[]).reduce((s, l) => s + Number(l.cantidad_cortada ?? 0), 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sbAnyC = sb as unknown as { from: (t: string) => any };
      const { count: regs } = await sbAnyC.from('ot_registros_tiempo').select('id', { count: 'exact', head: true }).eq('ot_id', otId);
      if (cortado > 0 || (regs ?? 0) > 0) {
        throw new Error(
          `No se puede cancelar: la OT ya tiene trabajo registrado` +
          `${cortado > 0 ? ` (${cortado} unidad(es) cortada(s))` : ''}` +
          `${(regs ?? 0) > 0 ? ` y ${regs} registro(s) de proceso/tiempo` : ''}. ` +
          'Solo se puede cancelar una OT sin corte ni procesos declarados.',
        );
      }
    }

    const permitidos = FLOW_ESTADOS[estadoActual] ?? [];
    if (!permitidos.includes(nuevoEstado)) {
      throw new Error(
        `Transición no permitida: ${estadoActual.replace('_', ' ')} → ${nuevoEstado.replace('_', ' ')}. ` +
          `Desde ${estadoActual.replace('_', ' ')} solo se puede ir a: ${permitidos.length === 0 ? '(estado final)' : permitidos.map((p) => p.replace('_', ' ')).join(', ')}.`,
      );
    }

    // Reglas de avance: no se puede pasar a un estado de PROCESAMIENTO POSTERIOR
    // al corte (habilitado/servicio/decorado/CC/completada) si no hay UNA SOLA
    // unidad cortada todavía. Sin corte físico no hay piezas para procesar —
    // permitirlo lleva a registros de tiempo y costos sobre nada.
    // CANCELADA y EN_CORTE no requieren corte previo (la primera es escape, la
    // segunda es PARA cortar).
    const requiereCorte: EstadoOT[] = ['EN_HABILITADO', 'EN_SERVICIO', 'EN_DECORADO', 'EN_CONTROL_CALIDAD', 'COMPLETADA'];
    if (requiereCorte.includes(nuevoEstado)) {
      const { data: lineas } = await sb
        .from('ot_lineas')
        .select('cantidad_cortada')
        .eq('ot_id', otId);
      const totalCortado = ((lineas ?? []) as { cantidad_cortada: number | null }[])
        .reduce((s, l) => s + Number(l.cantidad_cortada ?? 0), 0);
      if (totalCortado === 0) {
        throw new Error(
          `No podés pasar a "${nuevoEstado.replace('_', ' ')}" porque ninguna línea de esta OT tiene unidades cortadas. ` +
          `Generá la orden de corte y registrá las cantidades cortadas antes de avanzar.`,
        );
      }
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

export async function declararProduccion(
  otId: string,
  lineaId: string,
  cantidadCortada: number,
  cantidadFallas: number,
  /** Justificación obligatoria cuando lo cortado difiere del plan (requiere gerencia). */
  motivo?: string,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    if (cantidadCortada < 0 || cantidadFallas < 0) {
      throw new Error('Las cantidades no pueden ser negativas');
    }
    if (cantidadFallas > cantidadCortada) {
      throw new Error('Las fallas no pueden superar la cantidad cortada');
    }
    const { sb, userId } = await requireUser();

    // Validar contra la línea de la OT + estado de la OT
    const { data: linea } = await sb
      .from('ot_lineas')
      .select('cantidad_planificada, cantidad_cortada, ot:ot_id(estado)')
      .eq('id', lineaId)
      .single();
    if (!linea) throw new Error('Línea de OT no encontrada');
    const ot = (linea as unknown as { ot?: { estado: string } | null }).ot;
    if (ot?.estado === 'COMPLETADA' || ot?.estado === 'CANCELADA') {
      throw new Error('No se puede declarar producción en una OT cerrada');
    }

    // FUENTE DE VERDAD = módulo Corte (decisión del cliente 21/07/2026: la
    // cantidad cortada de la OT viene del corte). Cambiarla acá es un AJUSTE
    // que solo gerencia puede hacer, con motivo, y queda en la bitácora.
    // Actualizar solo las fallas (sin tocar lo cortado) no requiere nada.
    const planificada = Number(linea.cantidad_planificada ?? 0);
    const cortadaActual = Number(linea.cantidad_cortada ?? 0);
    const ajustaCortada = cantidadCortada !== cortadaActual;
    const motivoLimpio = (motivo ?? '').trim();
    if (ajustaCortada) {
      if (!(await esGerente())) {
        throw new Error(
          `La cantidad cortada (${cortadaActual}) viene del módulo Corte. Ajustarla requiere autorización de gerencia.`,
        );
      }
      if (!motivoLimpio) {
        throw new Error('Indique el motivo del ajuste de la cantidad cortada para registrar la autorización.');
      }
    }

    const { error } = await sb.from('ot_lineas').update({
      cantidad_cortada: cantidadCortada,
      cantidad_fallas: cantidadFallas,
    }).eq('id', lineaId);
    if (error) throw new Error(error.message);

    // Registrar el ajuste autorizado en la bitácora de la OT (auditoría)
    if (ajustaCortada) {
      const signo = cantidadCortada > cortadaActual ? '+' : '';
      await sb.from('ot_eventos').insert({
        ot_id: otId,
        tipo: 'AUTORIZACION_CANTIDAD',
        usuario_id: userId,
        detalle:
          `Ajuste de cantidad cortada autorizado por gerencia: ${cortadaActual} → ${cantidadCortada} ` +
          `(${signo}${cantidadCortada - cortadaActual}, plan ${planificada}). Motivo: ${motivoLimpio}`,
        contexto: {
          linea_id: lineaId,
          cantidad_planificada: planificada,
          cortada_anterior: cortadaActual,
          cortada_nueva: cantidadCortada,
          diferencia: cantidadCortada - cortadaActual,
          motivo: motivoLimpio,
        },
      });
    }
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
/**
 * Operaciones (proceso × talla) que aún no tienen NINGÚN registro de tiempo
 * declarado en la OT. Se usa para bloquear el cierre (pedido del cliente
 * 21/07/2026: "que no permita cerrar si faltan declarar procesos").
 *
 * Reglas (actualizadas 22/07/2026):
 *  - NO cuentan los procesos tercerizados (van por orden de servicio).
 *  - NO cuentan los procesos del área de CORTE (se declaran en la orden de
 *    corte / liquidación, no en registros de tiempo de la OT).
 *  - NO cuentan los procesos cubiertos por una ORDEN DE SERVICIO de esta OT
 *    (el servicio ya fue enviado/declarado al taller).
 *  - Una operación cuenta como "declarada" si tiene al menos 1 registro para
 *    esa talla. Solo tallas con cantidad_cortada > 0.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function procesosPendientesDeOT(sbAny: { from: (t: string) => any }, otId: string) {
  const [{ data: lineas }, { data: regs }, { data: osRows }] = await Promise.all([
    sbAny.from('ot_lineas').select('producto_id, talla, cantidad_cortada').eq('ot_id', otId),
    sbAny.from('ot_registros_tiempo').select('proceso_id, talla').eq('ot_id', otId),
    sbAny.from('ordenes_servicio').select('proceso').eq('ot_id', otId).neq('estado', 'ANULADA'),
  ]);
  const lineasArr = (lineas ?? []) as { producto_id: string; talla: string; cantidad_cortada: number | null }[];
  const prodIds = Array.from(new Set(lineasArr.map((l) => l.producto_id)));
  if (prodIds.length === 0) return [] as { operacion: string; talla: string }[];

  // Procesos que ya tienen una OS (servicio enviado al taller) — no se exigen
  // por registro de tiempo en la OT.
  const procesosConOS = new Set(((osRows ?? []) as { proceso: string | null }[]).map((o) => String(o.proceso ?? '')));

  const { data: procs } = await sbAny
    .from('productos_procesos')
    .select('id, producto_id, proceso, descripcion_operativa, es_tercerizado, areas_produccion(codigo)')
    .in('producto_id', prodIds)
    .eq('activo', true);
  const procsArr = (procs ?? []) as {
    id: string; producto_id: string; proceso: string; descripcion_operativa: string | null; es_tercerizado: boolean;
    areas_produccion: { codigo: string } | null;
  }[];

  const declarado = new Set(
    ((regs ?? []) as { proceso_id: string; talla: string }[]).map((r) => `${r.proceso_id}::${r.talla}`),
  );

  const pendientes: { operacion: string; talla: string }[] = [];
  for (const p of procsArr) {
    if (p.es_tercerizado) continue;
    if (p.areas_produccion?.codigo === 'CORTE') continue; // corte se declara en la orden de corte
    if (procesosConOS.has(p.proceso)) continue; // servicio cubierto por una OS
    const nombre = (p.descripcion_operativa ?? '').trim() || p.proceso.replace(/_/g, ' ');
    for (const l of lineasArr) {
      if (l.producto_id !== p.producto_id) continue;
      if (Number(l.cantidad_cortada ?? 0) <= 0) continue;
      if (!declarado.has(`${p.id}::${l.talla}`)) {
        pendientes.push({ operacion: nombre, talla: l.talla });
      }
    }
  }
  return pendientes;
}

/** Resumen de operaciones pendientes para la UI (antes de intentar cerrar). */
export async function contarProcesosPendientesOT(
  otId: string,
): Promise<{ pendientes: number; resumen: string }> {
  const { sb } = await requireUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const lista = await procesosPendientesDeOT(sbAny, otId);
  // Agrupar por operación → cantidad de tallas, para un mensaje corto
  const porOp = new Map<string, number>();
  for (const p of lista) porOp.set(p.operacion, (porOp.get(p.operacion) ?? 0) + 1);
  const nombres = Array.from(porOp.keys());
  const resumen =
    nombres.slice(0, 4).join(', ') + (nombres.length > 4 ? ` y ${nombres.length - 4} más` : '');
  return { pendientes: lista.length, resumen };
}

export async function cerrarOT(
  otId: string,
  almacenDestinoId: string,
  /** Solo gerencia: cerrar aunque falten operaciones por declarar. */
  forzar = false,
): Promise<ActionResult<{ lotes: number }>> {
  const r = await runAction(async () => {
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any; rpc: (fn: string, args: any) => any };

    // GUARD: no cerrar si faltan operaciones por declarar (pedido 21/07/2026).
    const pendientes = await procesosPendientesDeOT(sbAny, otId);
    if (pendientes.length > 0) {
      const porOp = new Map<string, number>();
      for (const p of pendientes) porOp.set(p.operacion, (porOp.get(p.operacion) ?? 0) + 1);
      const nombres = Array.from(porOp.keys());
      const resumen = nombres.slice(0, 5).join(', ') + (nombres.length > 5 ? '…' : '');
      if (!forzar) {
        throw new Error(
          `No se puede cerrar: faltan declarar ${pendientes.length} operación(es) en producción ` +
          `(${resumen}). Regístrelas en "Tiempos & costo MO" antes de cerrar la OT.`,
        );
      }
      // Cierre forzado: solo gerencia, y queda registrado en la bitácora.
      if (!(await esGerente())) {
        throw new Error(
          `Faltan declarar ${pendientes.length} operación(es) y solo gerencia puede cerrar en ese estado.`,
        );
      }
      await sbAny.from('ot_eventos').insert({
        ot_id: otId,
        tipo: 'CIERRE_FORZADO',
        usuario_id: userId,
        detalle:
          `OT cerrada por gerencia con ${pendientes.length} operación(es) sin declarar: ${resumen}`,
        contexto: { pendientes: pendientes.slice(0, 50) },
      });
    }

    const { data, error } = await sbAny.rpc(
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

/**
 * Upsert del tiempo real de una operación (proceso × talla) en una OT.
 * Si tiempoRealMin es null/NaN o vacío, ELIMINA el override (vuelve al
 * tiempo estándar). Esto evita filas-cero que confundan los cálculos.
 */
const tiempoRealSchema = z.object({
  proceso_id: z.string().uuid(),
  talla: z.string().min(1).max(10),
  tiempo_real_min: z.coerce.number().nonnegative().nullable().optional(),
  notas: z.string().max(500).optional().nullable(),
});

export async function upsertTiempoRealOT(
  otId: string,
  input: z.input<typeof tiempoRealSchema>,
): Promise<ActionResult> {
  const r = await runAction(async () => {
    const data = tiempoRealSchema.parse(input);
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const valor = typeof data.tiempo_real_min === 'number' && !Number.isNaN(data.tiempo_real_min)
      ? data.tiempo_real_min
      : null;
    // Borrar override si el valor es null/vacío.
    if (valor === null) {
      const { error } = await sbAny
        .from('ot_tiempos_reales')
        .delete()
        .eq('ot_id', otId)
        .eq('proceso_id', data.proceso_id)
        .eq('talla', data.talla);
      if (error) throw new Error(error.message);
      return null;
    }
    const { error } = await sbAny
      .from('ot_tiempos_reales')
      .upsert(
        {
          ot_id: otId,
          proceso_id: data.proceso_id,
          talla: data.talla,
          tiempo_real_min: valor,
          notas: data.notas ?? null,
          registrado_por: userId,
        },
        { onConflict: 'ot_id,proceso_id,talla' },
      );
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

/**
 * Crea un registro de avance de tiempo para una operación en la OT (mig 43).
 * Acepta dos modos:
 *   - Intervalo: fecha_inicio + fecha_fin → calcula tiempo_total_min.
 *   - Directo: tiempo_total_min directo (sin fechas).
 * Permite múltiples registros por (ot, proceso, talla).
 */
const registroTiempoSchema = z.object({
  proceso_id: z.string().uuid(),
  talla: z.string().min(1).max(10),
  fecha_inicio: z.string().optional().or(z.literal('')),
  fecha_fin: z.string().optional().or(z.literal('')),
  tiempo_total_min: z.coerce.number().nonnegative().optional(),
  /** Fecha en que se REALIZÓ el trabajo (modo "tiempo directo"). Sin esto el
   *  registro solo tenía created_at, o sea la fecha en que se cargó al
   *  sistema, no la de producción (reporte del cliente 21/07/2026). */
  fecha_trabajo: z.string().optional().or(z.literal('')),
  unidades_procesadas: z.coerce.number().int().nonnegative().nullable().optional(),
  operario_id: z.string().uuid().optional().or(z.literal('')),
  notas: z.string().max(500).optional().nullable(),
});

/**
 * Auto-avanza el estado de la OT según lo REALMENTE declarado (pedido del
 * cliente 22/07/2026: "el botón de estado debe actualizarse solo de acuerdo a
 * los registros de proceso y tiempos"). Solo avanza hacia adelante y nunca a
 * COMPLETADA/CANCELADA (esos son manuales). Mapea el área de las operaciones
 * declaradas — y el corte declarado — al estado correspondiente.
 */
const ORDEN_ESTADOS_OT = ['BORRADOR','PLANIFICADA','EN_CORTE','EN_HABILITADO','EN_SERVICIO','EN_DECORADO','EN_CONTROL_CALIDAD'] as const;
function estadoDeArea(cod: string): EstadoOT {
  if (cod === 'CORTE') return 'EN_CORTE';
  if (cod === 'COSTURA') return 'EN_SERVICIO';
  if (['BORDADO','ESTAMPADO','SUBLIMADO','DECORADO','PLISADO'].includes(cod)) return 'EN_DECORADO';
  if (['ACABADO','PLANCHADO'].includes(cod)) return 'EN_CONTROL_CALIDAD';
  return 'PLANIFICADA';
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoAvanzarEstadoOT(sbAny: { from: (t: string) => any }, otId: string): Promise<void> {
  const { data: ot } = await sbAny.from('ot').select('estado').eq('id', otId).maybeSingle();
  if (!ot) return;
  const estadoActual = ot.estado as EstadoOT;
  // No tocar estados finales ni CC (a partir de CC el avance es manual: cierre).
  if (['COMPLETADA', 'CANCELADA', 'EN_CONTROL_CALIDAD'].includes(estadoActual)) return;

  const idxEstado = (e: string) => (ORDEN_ESTADOS_OT as readonly string[]).indexOf(e);
  let objetivoIdx = idxEstado(estadoActual);
  if (objetivoIdx < 0) return;

  // Corte declarado (cantidad_cortada > 0) → al menos EN_CORTE.
  const { data: lineas } = await sbAny.from('ot_lineas').select('cantidad_cortada').eq('ot_id', otId);
  const cortado = ((lineas ?? []) as { cantidad_cortada: number | null }[]).reduce((s, l) => s + Number(l.cantidad_cortada ?? 0), 0);
  if (cortado > 0) objetivoIdx = Math.max(objetivoIdx, idxEstado('EN_CORTE'));

  // Áreas de las operaciones con tiempo declarado.
  const { data: regs } = await sbAny.from('ot_registros_tiempo').select('proceso_id').eq('ot_id', otId);
  const procesoIds = Array.from(new Set(((regs ?? []) as { proceso_id: string }[]).map((r) => r.proceso_id)));
  if (procesoIds.length > 0) {
    const { data: procs } = await sbAny
      .from('productos_procesos')
      .select('id, areas_produccion(codigo)')
      .in('id', procesoIds);
    for (const p of (procs ?? []) as { areas_produccion: { codigo: string } | null }[]) {
      const cod = p.areas_produccion?.codigo;
      if (cod) objetivoIdx = Math.max(objetivoIdx, idxEstado(estadoDeArea(cod)));
    }
  }

  // Órdenes de servicio ya retornadas del taller (confección/decorado
  // tercerizado): su retorno ES la declaración de que ese proceso se ejecutó.
  // Sin esto la OT se quedaba en EN_CORTE aunque la OS de confección estuviera
  // recepcionada/cerrada (pedido cliente 2026-09-02). `proceso` es el código de
  // área (COSTURA, BORDADO, …) → estadoDeArea.
  const { data: oss } = await sbAny
    .from('ordenes_servicio')
    .select('proceso, estado')
    .eq('ot_id', otId)
    .in('estado', ['RECEPCION_PARCIAL', 'RECEPCIONADA', 'CERRADA']);
  for (const os of (oss ?? []) as { proceso: string | null }[]) {
    if (os.proceso) objetivoIdx = Math.max(objetivoIdx, idxEstado(estadoDeArea(os.proceso)));
  }

  const objetivo = ORDEN_ESTADOS_OT[objetivoIdx];
  if (objetivo && objetivo !== estadoActual) {
    await sbAny.from('ot').update({ estado: objetivo }).eq('id', otId);
    await sbAny.from('ot_eventos').insert({
      ot_id: otId,
      tipo: 'ESTADO_CAMBIO',
      estado_anterior: estadoActual,
      estado_nuevo: objetivo,
      detalle: 'Estado actualizado automáticamente según las declaraciones de proceso/tiempo',
    });
  }
}

export async function crearRegistroTiempoOT(
  otId: string,
  input: z.input<typeof registroTiempoSchema>,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = registroTiempoSchema.parse(input);
    const { sb, userId } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };

    let tiempoTotal: number;
    let inicio: string | null = null;
    let fin: string | null = null;
    if (data.fecha_inicio && data.fecha_fin) {
      const ti = new Date(data.fecha_inicio).getTime();
      const tf = new Date(data.fecha_fin).getTime();
      if (Number.isNaN(ti) || Number.isNaN(tf)) throw new Error('Fechas inválidas');
      if (tf < ti) throw new Error('La fecha de fin no puede ser anterior al inicio');
      tiempoTotal = Math.round(((tf - ti) / 1000 / 60) * 100) / 100;
      inicio = data.fecha_inicio;
      fin = data.fecha_fin;
    } else if (typeof data.tiempo_total_min === 'number' && data.tiempo_total_min > 0) {
      tiempoTotal = data.tiempo_total_min;
      // Tiempo directo: guardamos la fecha de producción en fecha_inicio
      // (fecha_fin queda null porque no hay intervalo). Así los reportes
      // usan la fecha real del trabajo y no la de digitación.
      if (data.fecha_trabajo) {
        const tt = new Date(data.fecha_trabajo).getTime();
        if (Number.isNaN(tt)) throw new Error('Fecha de trabajo inválida');
        inicio = data.fecha_trabajo;
      }
    } else {
      throw new Error('Ingresá fecha inicio + fin O tiempo directo (> 0)');
    }

    // Producto + área del proceso (para el gate de corte y el tope de unidades).
    const { data: procRow } = await sbAny
      .from('productos_procesos')
      .select('producto_id, areas_produccion(codigo)')
      .eq('id', data.proceso_id)
      .maybeSingle();
    const productoId = procRow?.producto_id as string | undefined;
    const areaCod = (procRow?.areas_produccion as { codigo?: string } | null)?.codigo ?? null;

    let cortadaTalla = 0;
    if (productoId) {
      const { data: linea } = await sbAny
        .from('ot_lineas')
        .select('cantidad_cortada, cantidad_planificada')
        .eq('ot_id', otId)
        .eq('producto_id', productoId)
        .eq('talla', data.talla)
        .maybeSingle();
      cortadaTalla = Number(linea?.cantidad_cortada ?? 0);
      const planificada = Number(linea?.cantidad_planificada ?? 0);

      // GATE (pedido cliente 2026-09-02, por talla): no registrar operaciones
      // aguas abajo si el corte de esa talla NO está culminado: cortado ≥
      // planificado y sin cortes abiertos para la talla. No aplica al área CORTE
      // (sus tiempos se declaran en la liquidación del corte).
      if (areaCod !== 'CORTE') {
        if (planificada > 0 && cortadaTalla < planificada) {
          throw new Error(
            `El corte de la talla ${formatTallaChip(data.talla)} no está completo ` +
            `(cortadas ${cortadaTalla} de ${planificada} planificadas). Termina el corte antes de registrar esta operación.`,
          );
        }
        const { data: cortes } = await sbAny
          .from('ot_corte')
          .select('id')
          .eq('ot_id', otId)
          .eq('producto_id', productoId)
          .in('estado', ['ABIERTO', 'EN_PROCESO']);
        const cortesIds = ((cortes ?? []) as { id: string }[]).map((c) => c.id);
        if (cortesIds.length > 0) {
          const { data: lin } = await sbAny
            .from('ot_corte_lineas')
            .select('id')
            .in('corte_id', cortesIds)
            .eq('talla', data.talla)
            .limit(1);
          if ((lin ?? []).length > 0) {
            throw new Error(
              `Hay un corte sin cerrar para la talla ${formatTallaChip(data.talla)}. ` +
              `Cierra (liquida) el corte antes de registrar esta operación.`,
            );
          }
        }
      }
    }

    // Tope de unidades: no exceder lo cortado para esa (talla, producto). Sin
    // esta guarda se podrían ingresar valores imposibles (ej. 700 cuando se
    // cortaron 70).
    if (data.unidades_procesadas != null && data.unidades_procesadas > 0 && productoId && cortadaTalla > 0) {
      const { data: previos } = await sbAny
        .from('ot_registros_tiempo')
        .select('unidades_procesadas')
        .eq('ot_id', otId)
        .eq('proceso_id', data.proceso_id)
        .eq('talla', data.talla);
      const yaRegistrado = ((previos ?? []) as { unidades_procesadas: number | null }[])
        .reduce((s, r) => s + Number(r.unidades_procesadas ?? 0), 0);
      const disponible = cortadaTalla - yaRegistrado;
      if (data.unidades_procesadas > disponible) {
        throw new Error(
          `No puedes registrar ${data.unidades_procesadas} unidades en talla ${formatTallaChip(data.talla)}: ` +
          `se cortaron ${cortadaTalla} y ya hay ${yaRegistrado} registradas (quedan ${Math.max(0, disponible)}).`,
        );
      }
    }

    const { data: row, error } = await sbAny
      .from('ot_registros_tiempo')
      .insert({
        ot_id: otId,
        proceso_id: data.proceso_id,
        talla: data.talla,
        fecha_inicio: inicio,
        fecha_fin: fin,
        tiempo_total_min: tiempoTotal,
        unidades_procesadas: data.unidades_procesadas ?? null,
        operario_id: data.operario_id || null,
        notas: data.notas || null,
        registrado_por: userId,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    // Auto-avanzar el estado de la OT según lo declarado (forward-only).
    await autoAvanzarEstadoOT(sbAny, otId);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}

export async function eliminarRegistroTiempoOT(otId: string, registroId: string): Promise<ActionResult> {
  const r = await runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { error } = await sbAny.from('ot_registros_tiempo').delete().eq('id', registroId);
    if (error) throw new Error(error.message);
    return null;
  });
  if (r.ok) await bumpPaths(`/ot/${otId}`);
  return r;
}
