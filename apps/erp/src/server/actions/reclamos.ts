'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createServiceClient } from '@happy/db/service';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';
import {
  ESTADOS_RECLAMO,
  TIPOS_RECLAMO,
  TIPOS_DOC_RECLAMO,
  TIPOS_BIEN,
  TRANSICIONES_RECLAMO,
  type EstadoReclamo,
  type TipoReclamo,
} from './reclamos-helpers';

/**
 * Módulo de Libro de Reclamaciones (Ley 29571 — Indecopi).
 *
 * - El listado / detalle / respuesta / cambio de estado lo usa el staff
 *   (requireUser).
 * - `crearReclamoPublico` se invoca desde la web pública sin sesión:
 *   usa createServiceClient() (bypassa RLS) y captura IP + user-agent
 *   automáticamente desde las cabeceras del request.
 * - El correlativo se genera vía RPC `generar_numero_reclamo` (REC-YYMMDD-NNNN
 *   por día) que ya existe en el schema. Si falla, fallback a `next_correlativo`
 *   con clave 'RECLAMACION' y prefijo 'REC-'.
 * - El PDF de comprobante NO se genera en server (jspdf vive en el cliente);
 *   la action `exportarReclamoPDF` devuelve los datos crudos del reclamo y el
 *   componente cliente arma el PDF con jspdf + jspdf-autotable, siguiendo el
 *   patrón de `plan-maestro/[id]/descargar-pdf-button.tsx`.
 */

// ---------- Tipos públicos ----------

export type ReclamoRow = {
  id: string;
  numero: string;
  fecha: string;
  tipo: TipoReclamo;
  estado: EstadoReclamo;
  cliente_nombre: string;
  cliente_documento_tipo: string;
  cliente_documento_numero: string;
  descripcion: string;
  monto_reclamado: number | null;
  dias_transcurridos: number;
};

export type ReclamoDetalle = {
  id: string;
  numero: string;
  fecha: string;
  tipo: TipoReclamo;
  estado: EstadoReclamo;
  tipo_bien: string | null;
  monto_reclamado: number | null;
  // Consumidor
  cliente_nombre: string;
  cliente_documento_tipo: string;
  cliente_documento_numero: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_direccion: string | null;
  cliente_ubigeo: string | null;
  es_menor_edad: boolean;
  apoderado_nombre: string | null;
  apoderado_documento: string | null;
  // Detalle
  descripcion: string;
  pedido_consumidor: string | null;
  // Vinculaciones
  venta_id: string | null;
  venta_numero: string | null;
  comprobante_id: string | null;
  comprobante_numero: string | null;
  pedido_web_id: string | null;
  pedido_web_numero: string | null;
  // Respuesta
  respuesta: string | null;
  fecha_respuesta: string | null;
  respondido_por: string | null;
  respondido_por_email: string | null;
  // Tracking
  ip_consumidor: string | null;
  user_agent: string | null;
  acepta_terminos: boolean;
  pdf_url: string | null;
  created_at: string;
};

export type ReclamosStats = {
  nuevos: number;
  en_revision: number;
  resueltos_mes: number;
  vencidos: number;
  total: number;
};

// ---------- Listar reclamos ----------

const listarSchema = z.object({
  estado: z.enum(ESTADOS_RECLAMO).optional().or(z.literal('')),
  tipo: z.enum(TIPOS_RECLAMO).optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  q: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type ReclamosFiltros = z.input<typeof listarSchema>;

type ReclamoRaw = {
  id: string;
  numero: string;
  fecha: string;
  tipo: TipoReclamo;
  estado: EstadoReclamo;
  cliente_nombre: string;
  cliente_documento_tipo: string;
  cliente_documento_numero: string;
  descripcion: string;
  monto_reclamado: string | number | null;
};

export async function listarReclamos(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{
    rows: ReclamoRow[];
    total: number;
    pagina: number;
    por_pagina: number;
    stats: ReclamosStats;
  }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('reclamos')
      .select(
        'id, numero, fecha, tipo, estado, cliente_nombre, cliente_documento_tipo, cliente_documento_numero, descripcion, monto_reclamado',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false });

    if (data.estado) q = q.eq('estado', data.estado);
    if (data.tipo) q = q.eq('tipo', data.tipo);
    if (data.desde) q = q.gte('fecha', `${data.desde}T00:00:00`);
    if (data.hasta) q = q.lte('fecha', `${data.hasta}T23:59:59`);
    if (data.q && data.q.trim()) {
      const term = data.q.trim().replace(/[%,]/g, ' ');
      // Buscar por nombre o documento o número de reclamo.
      q = q.or(
        `cliente_nombre.ilike.%${term}%,cliente_documento_numero.ilike.%${term}%,numero.ilike.%${term}%`,
      );
    }

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const ahora = Date.now();
    const mapped: ReclamoRow[] = ((rows ?? []) as unknown as ReclamoRaw[]).map((r) => ({
      id: r.id,
      numero: r.numero,
      fecha: r.fecha,
      tipo: r.tipo,
      estado: r.estado,
      cliente_nombre: r.cliente_nombre,
      cliente_documento_tipo: r.cliente_documento_tipo,
      cliente_documento_numero: r.cliente_documento_numero,
      descripcion: r.descripcion,
      monto_reclamado: r.monto_reclamado != null ? Number(r.monto_reclamado) : null,
      dias_transcurridos: Math.floor(
        (ahora - new Date(r.fecha).getTime()) / (1000 * 60 * 60 * 24),
      ),
    }));

    // Stats globales (independientes del filtro, para mostrar arriba del listado).
    const stats = await calcularStats(sb);

    return {
      rows: mapped,
      total: Number(count ?? 0),
      pagina: data.pagina,
      por_pagina: data.por_pagina,
      stats,
    };
  });
}

type SbAny = Awaited<ReturnType<typeof requireUser>>['sb'];

async function calcularStats(sb: SbAny): Promise<ReclamosStats> {
  // Total
  const { count: total } = await sb
    .from('reclamos')
    .select('id', { count: 'exact', head: true });
  // Nuevos
  const { count: nuevos } = await sb
    .from('reclamos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'NUEVO');
  // En revisión
  const { count: enRevision } = await sb
    .from('reclamos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'EN_REVISION');
  // Resueltos en el mes actual
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  const { count: resueltosMes } = await sb
    .from('reclamos')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'RESUELTO')
    .gte('fecha_respuesta', inicioMes.toISOString());
  // Vencidos: NUEVO/EN_REVISION cuya fecha es > 15 días.
  const hace15 = new Date();
  hace15.setDate(hace15.getDate() - 15);
  const { count: vencidos } = await sb
    .from('reclamos')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['NUEVO', 'EN_REVISION'])
    .lt('fecha', hace15.toISOString());

  return {
    nuevos: Number(nuevos ?? 0),
    en_revision: Number(enRevision ?? 0),
    resueltos_mes: Number(resueltosMes ?? 0),
    vencidos: Number(vencidos ?? 0),
    total: Number(total ?? 0),
  };
}

// ---------- Obtener detalle ----------

type DetalleRaw = {
  id: string;
  numero: string;
  fecha: string;
  tipo: TipoReclamo;
  estado: EstadoReclamo;
  tipo_bien: string | null;
  monto_reclamado: string | number | null;
  cliente_nombre: string;
  cliente_documento_tipo: string;
  cliente_documento_numero: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_direccion: string | null;
  cliente_ubigeo: string | null;
  es_menor_edad: boolean | null;
  apoderado_nombre: string | null;
  apoderado_documento: string | null;
  descripcion: string;
  pedido_consumidor: string | null;
  venta_id: string | null;
  comprobante_id: string | null;
  pedido_web_id: string | null;
  respuesta: string | null;
  fecha_respuesta: string | null;
  respondido_por: string | null;
  ip_consumidor: unknown;
  user_agent: string | null;
  acepta_terminos: boolean | null;
  pdf_url: string | null;
  created_at: string;
};

export async function obtenerReclamo(
  id: string,
): Promise<ActionResult<ReclamoDetalle>> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data, error } = await sb
      .from('reclamos')
      .select(
        'id, numero, fecha, tipo, estado, tipo_bien, monto_reclamado, ' +
          'cliente_nombre, cliente_documento_tipo, cliente_documento_numero, cliente_telefono, cliente_email, cliente_direccion, cliente_ubigeo, ' +
          'es_menor_edad, apoderado_nombre, apoderado_documento, descripcion, pedido_consumidor, ' +
          'venta_id, comprobante_id, pedido_web_id, ' +
          'respuesta, fecha_respuesta, respondido_por, ' +
          'ip_consumidor, user_agent, acepta_terminos, pdf_url, created_at',
      )
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Reclamo no encontrado');

    const r = data as unknown as DetalleRaw;

    // Lookups opcionales (no críticos; si fallan, se muestra solo el id).
    let venta_numero: string | null = null;
    let comprobante_numero: string | null = null;
    let pedido_web_numero: string | null = null;
    let respondido_por_email: string | null = null;

    if (r.venta_id) {
      const { data: v } = await sb
        .from('ventas')
        .select('numero')
        .eq('id', r.venta_id)
        .maybeSingle();
      venta_numero = (v as { numero?: string } | null)?.numero ?? null;
    }
    if (r.comprobante_id) {
      const { data: c } = await sb
        .from('comprobantes')
        .select('numero_completo, serie, numero')
        .eq('id', r.comprobante_id)
        .maybeSingle();
      const cc = c as { numero_completo?: string; serie?: string; numero?: number } | null;
      comprobante_numero = cc
        ? cc.numero_completo ?? `${cc.serie ?? ''}-${cc.numero ?? ''}`
        : null;
    }
    if (r.pedido_web_id) {
      const { data: p } = await sb
        .from('pedidos_web')
        .select('numero')
        .eq('id', r.pedido_web_id)
        .maybeSingle();
      pedido_web_numero = (p as { numero?: string } | null)?.numero ?? null;
    }
    if (r.respondido_por) {
      // perfiles.nombre_completo (no hay columna email; el email vive en auth.users).
      const { data: u } = await sb
        .from('perfiles')
        .select('nombre_completo')
        .eq('id', r.respondido_por)
        .maybeSingle();
      respondido_por_email =
        (u as { nombre_completo?: string } | null)?.nombre_completo ?? null;
    }

    const detalle: ReclamoDetalle = {
      id: r.id,
      numero: r.numero,
      fecha: r.fecha,
      tipo: r.tipo,
      estado: r.estado,
      tipo_bien: r.tipo_bien,
      monto_reclamado: r.monto_reclamado != null ? Number(r.monto_reclamado) : null,
      cliente_nombre: r.cliente_nombre,
      cliente_documento_tipo: r.cliente_documento_tipo,
      cliente_documento_numero: r.cliente_documento_numero,
      cliente_telefono: r.cliente_telefono,
      cliente_email: r.cliente_email,
      cliente_direccion: r.cliente_direccion,
      cliente_ubigeo: r.cliente_ubigeo,
      es_menor_edad: Boolean(r.es_menor_edad),
      apoderado_nombre: r.apoderado_nombre,
      apoderado_documento: r.apoderado_documento,
      descripcion: r.descripcion,
      pedido_consumidor: r.pedido_consumidor,
      venta_id: r.venta_id,
      venta_numero,
      comprobante_id: r.comprobante_id,
      comprobante_numero,
      pedido_web_id: r.pedido_web_id,
      pedido_web_numero,
      respuesta: r.respuesta,
      fecha_respuesta: r.fecha_respuesta,
      respondido_por: r.respondido_por,
      respondido_por_email,
      ip_consumidor: r.ip_consumidor != null ? String(r.ip_consumidor) : null,
      user_agent: r.user_agent,
      acepta_terminos: Boolean(r.acepta_terminos),
      pdf_url: r.pdf_url,
      created_at: r.created_at,
    };

    return detalle;
  });
}

// ---------- Responder reclamo ----------

const responderSchema = z.object({
  respuesta: z.string().min(10, 'La respuesta debe tener al menos 10 caracteres'),
  nuevo_estado: z.enum(['RESUELTO', 'DESESTIMADO']),
});

export type ResponderReclamoInput = z.input<typeof responderSchema>;

export async function responderReclamo(
  id: string,
  input: ResponderReclamoInput,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const data = responderSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Verificar estado actual y validar transición.
    const { data: cur, error: errCur } = await sb
      .from('reclamos')
      .select('estado')
      .eq('id', id)
      .single();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error('Reclamo no encontrado');

    const estadoActual = cur.estado as EstadoReclamo;
    const permitidos = TRANSICIONES_RECLAMO[estadoActual] ?? [];
    if (!permitidos.includes(data.nuevo_estado)) {
      throw new Error(
        `No se puede pasar de ${estadoActual} a ${data.nuevo_estado}. Estados permitidos: ${permitidos.join(', ') || '(ninguno)'}`,
      );
    }

    const { error } = await sb
      .from('reclamos')
      .update({
        respuesta: data.respuesta.trim(),
        estado: data.nuevo_estado,
        fecha_respuesta: new Date().toISOString(),
        respondido_por: userId,
      })
      .eq('id', id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/reclamos', `/reclamos/${id}`);
  return r;
}

// ---------- Cambiar estado (sin responder, ej. pasar a EN_REVISION) ----------

const cambiarEstadoSchema = z.enum(ESTADOS_RECLAMO);

export async function cambiarEstadoReclamo(
  id: string,
  nuevoEstado: EstadoReclamo,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const estadoNuevo = cambiarEstadoSchema.parse(nuevoEstado);
    const { sb } = await requireUser();

    const { data: cur, error: errCur } = await sb
      .from('reclamos')
      .select('estado')
      .eq('id', id)
      .single();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error('Reclamo no encontrado');

    const estadoActual = cur.estado as EstadoReclamo;
    const permitidos = TRANSICIONES_RECLAMO[estadoActual] ?? [];
    if (!permitidos.includes(estadoNuevo)) {
      throw new Error(
        `No se puede pasar de ${estadoActual} a ${estadoNuevo}. Estados permitidos: ${permitidos.join(', ') || '(ninguno)'}`,
      );
    }

    const { error } = await sb
      .from('reclamos')
      .update({ estado: estadoNuevo })
      .eq('id', id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/reclamos', `/reclamos/${id}`);
  return r;
}

// ---------- Crear reclamo público (desde web) ----------

const crearPublicoSchema = z.object({
  tipo: z.enum(TIPOS_RECLAMO),
  cliente_nombre: z.string().min(2, 'Nombre requerido').max(200),
  cliente_documento_tipo: z.enum(TIPOS_DOC_RECLAMO),
  cliente_documento_numero: z.string().min(6, 'Documento inválido').max(20),
  cliente_telefono: z.string().min(6, 'Teléfono requerido').max(20),
  cliente_email: z.string().email('Email inválido'),
  cliente_direccion: z.string().min(5, 'Dirección requerida').max(300),
  cliente_ubigeo: z.string().max(10).optional().or(z.literal('')),
  es_menor_edad: z.boolean().default(false),
  apoderado_nombre: z.string().max(200).optional().or(z.literal('')),
  apoderado_documento: z.string().max(20).optional().or(z.literal('')),
  tipo_bien: z.enum(TIPOS_BIEN),
  monto_reclamado: z.coerce.number().min(0).optional(),
  venta_id: z.string().uuid().optional().or(z.literal('')),
  pedido_web_id: z.string().uuid().optional().or(z.literal('')),
  comprobante_id: z.string().uuid().optional().or(z.literal('')),
  descripcion: z.string().min(10, 'La descripción debe tener al menos 10 caracteres').max(4000),
  pedido_consumidor: z.string().min(5, 'Indique qué solución espera').max(2000),
  acepta_terminos: z.literal(true, {
    errorMap: () => ({ message: 'Debe aceptar los términos para continuar' }),
  }),
});

export type CrearReclamoPublicoInput = z.input<typeof crearPublicoSchema>;

/**
 * Inserta el reclamo en BD. Pensada para llamarse desde la web pública sin
 * sesión: usa service client (bypass RLS) y captura IP + UA automáticamente.
 *
 * Si la regla de negocio cambia y se quiere exigir login, basta con sustituir
 * createServiceClient() por createClient() de '@happy/db/server'.
 */
export async function crearReclamoPublico(
  input: CrearReclamoPublicoInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  return runAction(async () => {
    const data = crearPublicoSchema.parse(input);

    // Validación adicional: si es menor de edad, exigir apoderado.
    if (data.es_menor_edad) {
      if (!data.apoderado_nombre || data.apoderado_nombre.trim().length < 2) {
        throw new Error('Si el consumidor es menor de edad, debe indicar el nombre del apoderado');
      }
    }

    const sb = createServiceClient();
    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip')?.trim() ??
      null;
    const ua = h.get('user-agent') ?? null;

    // Correlativo: primero intentamos el RPC dedicado (REC-YYMMDD-NNNN). Si no
    // existe / falla, fallback a next_correlativo con clave 'RECLAMACION' y
    // formato REC-NNNNNN (clave distinta a 'REC_OC' que usan las recepciones).
    let numero: string | null = null;
    const { data: nro1, error: errNro1 } = await sb.rpc('generar_numero_reclamo');
    if (!errNro1 && typeof nro1 === 'string' && nro1.length > 0) {
      numero = nro1;
    } else {
      const { data: nro2, error: errNro2 } = await sb.rpc('next_correlativo', {
        p_clave: 'RECLAMACION',
        p_padding: 6,
      });
      if (errNro2) {
        throw new Error(`No se pudo generar número de reclamo: ${errNro2.message}`);
      }
      numero = `REC-${nro2}`;
    }
    if (!numero) numero = `REC-${Date.now()}`;

    const insert = {
      numero,
      tipo: data.tipo,
      cliente_nombre: data.cliente_nombre.trim(),
      cliente_documento_tipo: data.cliente_documento_tipo,
      cliente_documento_numero: data.cliente_documento_numero.trim(),
      cliente_telefono: data.cliente_telefono.trim(),
      cliente_email: data.cliente_email.trim().toLowerCase(),
      cliente_direccion: data.cliente_direccion.trim(),
      cliente_ubigeo: data.cliente_ubigeo?.trim() || null,
      es_menor_edad: data.es_menor_edad,
      apoderado_nombre: data.apoderado_nombre?.trim() || null,
      apoderado_documento: data.apoderado_documento?.trim() || null,
      tipo_bien: data.tipo_bien,
      monto_reclamado: data.monto_reclamado ?? null,
      venta_id: data.venta_id || null,
      pedido_web_id: data.pedido_web_id || null,
      comprobante_id: data.comprobante_id || null,
      descripcion: data.descripcion.trim(),
      pedido_consumidor: data.pedido_consumidor.trim(),
      acepta_terminos: true,
      ip_consumidor: ip,
      user_agent: ua,
      estado: 'NUEVO' as const,
    };

    const { data: row, error } = await sb
      .from('reclamos')
      .insert(insert)
      .select('id, numero')
      .single();
    if (error) throw new Error(error.message);

    // Bump del listado de staff por si está en pantalla.
    await bumpPaths('/reclamos');

    return { id: row.id as string, numero: row.numero as string };
  });
}

// ---------- Datos para exportación PDF ----------

/**
 * Devuelve los datos del reclamo para que el cliente arme el PDF con jspdf.
 * No se genera server-side porque jspdf vive en el bundle del cliente y el
 * patrón del repo (plan-maestro/descargar-pdf-button) ya lo hace así.
 *
 * Esta acción es también usable desde el flujo público de "Descargar
 * comprobante" tras enviar el reclamo — por eso usa service client (no
 * requireUser): el consumidor recién creado no tiene sesión.
 */
export async function exportarReclamoPDF(
  id: string,
): Promise<ActionResult<ReclamoDetalle>> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const sb = createServiceClient();

    const { data, error } = await sb
      .from('reclamos')
      .select(
        'id, numero, fecha, tipo, estado, tipo_bien, monto_reclamado, ' +
          'cliente_nombre, cliente_documento_tipo, cliente_documento_numero, cliente_telefono, cliente_email, cliente_direccion, cliente_ubigeo, ' +
          'es_menor_edad, apoderado_nombre, apoderado_documento, descripcion, pedido_consumidor, ' +
          'venta_id, comprobante_id, pedido_web_id, ' +
          'respuesta, fecha_respuesta, respondido_por, ' +
          'ip_consumidor, user_agent, acepta_terminos, pdf_url, created_at',
      )
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Reclamo no encontrado');

    const r = data as unknown as DetalleRaw;
    const detalle: ReclamoDetalle = {
      id: r.id,
      numero: r.numero,
      fecha: r.fecha,
      tipo: r.tipo,
      estado: r.estado,
      tipo_bien: r.tipo_bien,
      monto_reclamado: r.monto_reclamado != null ? Number(r.monto_reclamado) : null,
      cliente_nombre: r.cliente_nombre,
      cliente_documento_tipo: r.cliente_documento_tipo,
      cliente_documento_numero: r.cliente_documento_numero,
      cliente_telefono: r.cliente_telefono,
      cliente_email: r.cliente_email,
      cliente_direccion: r.cliente_direccion,
      cliente_ubigeo: r.cliente_ubigeo,
      es_menor_edad: Boolean(r.es_menor_edad),
      apoderado_nombre: r.apoderado_nombre,
      apoderado_documento: r.apoderado_documento,
      descripcion: r.descripcion,
      pedido_consumidor: r.pedido_consumidor,
      venta_id: r.venta_id,
      venta_numero: null,
      comprobante_id: r.comprobante_id,
      comprobante_numero: null,
      pedido_web_id: r.pedido_web_id,
      pedido_web_numero: null,
      respuesta: r.respuesta,
      fecha_respuesta: r.fecha_respuesta,
      respondido_por: r.respondido_por,
      respondido_por_email: null,
      ip_consumidor: r.ip_consumidor != null ? String(r.ip_consumidor) : null,
      user_agent: r.user_agent,
      acepta_terminos: Boolean(r.acepta_terminos),
      pdf_url: r.pdf_url,
      created_at: r.created_at,
    };
    return detalle;
  });
}
