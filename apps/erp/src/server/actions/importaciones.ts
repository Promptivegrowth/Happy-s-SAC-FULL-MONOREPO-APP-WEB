'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Módulo de Importaciones Internacionales (importaciones).
 *
 * Una importación es un EMBARQUE que agrupa N órdenes de compra a proveedores
 * extranjeros. La cabecera (importaciones) lleva flete, seguro, aduanas, otros
 * costos y los pagos adelantados; cada OC vinculada apunta a la importación
 * mediante `oc.importacion_id`.
 *
 * Numeración: usamos `next_correlativo` con la clave dedicada 'IMP_OC' (no se
 * usa una clave 'IMPORTACION' para evitar colisiones con futuras numeraciones
 * por año o tipo; el formato pedido es plano IMP-NNNNNN).
 *
 * Estados (máquina de transiciones):
 *   PREPARACION  → EN_TRANSITO, CANCELADA
 *   EN_TRANSITO  → EN_ADUANAS, CANCELADA
 *   EN_ADUANAS   → LIBERADA, CANCELADA
 *   LIBERADA     → RECIBIDA, CANCELADA
 *   RECIBIDA     → (final)
 *   CANCELADA    → (final)
 *
 * No se hace prorrateo de costos adicionales sobre los materiales de las OCs
 * en esta versión — queda pendiente para una v2 (debe interactuar con kardex
 * y materiales_precios_historico).
 */

// ---------- Tipos públicos ----------

import { ESTADOS_IMPORTACION, TRANSICIONES_IMPORTACION, type EstadoImportacion } from './importaciones-helpers';
export type { EstadoImportacion } from './importaciones-helpers';

const TRANSICIONES = TRANSICIONES_IMPORTACION;

export type ImportacionRow = {
  id: string;
  numero: string;
  fecha_embarque: string | null;
  fecha_arribo_real: string | null;
  fecha_arribo_esperada: string | null;
  proveedor_razon_social: string;
  pais_origen: string | null;
  moneda: string;
  costo_total_adicional: number;
  estado: EstadoImportacion;
  oc_count: number;
};

export type ImportacionDetalle = {
  id: string;
  numero: string;
  proveedor_id: string | null;
  proveedor_razon_social: string;
  pais_origen: string | null;
  moneda: string;
  tipo_cambio: number | null;
  fecha_embarque: string | null;
  fecha_arribo_esperada: string | null;
  fecha_arribo_real: string | null;
  flete: number;
  seguro: number;
  aduanas: number;
  otros_costos: number;
  costo_total_adicional: number;
  adelanto: number;
  estado: EstadoImportacion;
  observacion: string | null;
  cif_prorrateado_en: string | null;
  cif_total_distribuido: number;
  created_at: string;
  updated_at: string;
};

export type OCVinculada = {
  id: string;
  numero: string;
  estado: string;
  total: number;
  moneda: string;
  proveedor_razon_social: string;
  fecha: string;
};

export type OCDisponible = {
  id: string;
  numero: string;
  fecha: string;
  estado: string;
  total: number;
  moneda: string;
  proveedor_id: string;
  proveedor_razon_social: string;
};

// ---------- Listar ----------

const listarSchema = z.object({
  estado: z.string().optional().or(z.literal('')),
  proveedor: z.string().uuid().optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type ImportacionesFiltros = z.input<typeof listarSchema>;

type ImpRaw = {
  id: string;
  numero: string;
  fecha_embarque: string | null;
  fecha_arribo_real: string | null;
  fecha_arribo_esperada: string | null;
  pais_origen: string | null;
  moneda: string | null;
  costo_total_adicional: string | number | null;
  estado: string;
  proveedor: { razon_social: string } | null;
};

export async function listarImportaciones(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{ rows: ImportacionRow[]; total: number; pagina: number; por_pagina: number }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('importaciones')
      .select(
        'id, numero, fecha_embarque, fecha_arribo_real, fecha_arribo_esperada, pais_origen, moneda, costo_total_adicional, estado, ' +
          'proveedor:proveedor_id(razon_social)',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false });

    if (data.estado) q = q.eq('estado', data.estado);
    if (data.proveedor) q = q.eq('proveedor_id', data.proveedor);
    if (data.desde) q = q.gte('fecha_embarque', data.desde);
    if (data.hasta) q = q.lte('fecha_embarque', data.hasta);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const baseRows = (rows ?? []) as unknown as ImpRaw[];

    // Conteo de OCs vinculadas por importación (una sola query separada).
    const ids = baseRows.map((r) => r.id);
    const ocCounts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: ocs, error: errOcs } = await sb
        .from('oc')
        .select('id, importacion_id')
        .in('importacion_id', ids);
      if (errOcs) throw new Error(errOcs.message);
      for (const o of ocs ?? []) {
        const k = (o as { importacion_id: string | null }).importacion_id;
        if (!k) continue;
        ocCounts.set(k, (ocCounts.get(k) ?? 0) + 1);
      }
    }

    const mapped: ImportacionRow[] = baseRows.map((r) => ({
      id: r.id,
      numero: r.numero,
      fecha_embarque: r.fecha_embarque,
      fecha_arribo_real: r.fecha_arribo_real,
      fecha_arribo_esperada: r.fecha_arribo_esperada,
      proveedor_razon_social: r.proveedor?.razon_social ?? '—',
      pais_origen: r.pais_origen,
      moneda: r.moneda ?? 'USD',
      costo_total_adicional: Number(r.costo_total_adicional ?? 0),
      estado: r.estado as EstadoImportacion,
      oc_count: ocCounts.get(r.id) ?? 0,
    }));

    return {
      rows: mapped,
      total: Number(count ?? 0),
      pagina: data.pagina,
      por_pagina: data.por_pagina,
    };
  });
}

// ---------- Obtener detalle ----------

type DetRaw = {
  id: string;
  numero: string;
  proveedor_id: string | null;
  pais_origen: string | null;
  moneda: string | null;
  tipo_cambio: string | number | null;
  fecha_embarque: string | null;
  fecha_arribo_esperada: string | null;
  fecha_arribo_real: string | null;
  flete: string | number | null;
  seguro: string | number | null;
  aduanas: string | number | null;
  otros_costos: string | number | null;
  costo_total_adicional: string | number | null;
  adelanto: string | number | null;
  estado: string;
  observacion: string | null;
  created_at: string;
  updated_at: string;
  proveedor: { razon_social: string } | null;
};

type OCRaw = {
  id: string;
  numero: string;
  estado: string;
  total: string | number | null;
  moneda: string | null;
  fecha: string;
  proveedor: { razon_social: string } | null;
};

export async function obtenerImportacion(
  id: string,
): Promise<ActionResult<{ importacion: ImportacionDetalle; ocs_vinculadas: OCVinculada[] }>> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('importaciones')
      .select(
        'id, numero, proveedor_id, pais_origen, moneda, tipo_cambio, ' +
          'fecha_embarque, fecha_arribo_esperada, fecha_arribo_real, ' +
          'flete, seguro, aduanas, otros_costos, costo_total_adicional, adelanto, ' +
          'estado, observacion, created_at, updated_at, ' +
          'cif_prorrateado_en, cif_total_distribuido, ' +
          'proveedor:proveedor_id(razon_social)',
      )
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!cab) throw new Error('Importación no encontrada');

    const c = cab as unknown as DetRaw;

    const { data: ocs, error: errOcs } = await sb
      .from('oc')
      .select('id, numero, estado, total, moneda, fecha, proveedor:proveedor_id(razon_social)')
      .eq('importacion_id', id)
      .order('fecha', { ascending: false });
    if (errOcs) throw new Error(errOcs.message);

    const importacion: ImportacionDetalle = {
      id: c.id,
      numero: c.numero,
      proveedor_id: c.proveedor_id,
      proveedor_razon_social: c.proveedor?.razon_social ?? '—',
      pais_origen: c.pais_origen,
      moneda: c.moneda ?? 'USD',
      tipo_cambio: c.tipo_cambio != null ? Number(c.tipo_cambio) : null,
      fecha_embarque: c.fecha_embarque,
      fecha_arribo_esperada: c.fecha_arribo_esperada,
      fecha_arribo_real: c.fecha_arribo_real,
      flete: Number(c.flete ?? 0),
      seguro: Number(c.seguro ?? 0),
      aduanas: Number(c.aduanas ?? 0),
      otros_costos: Number(c.otros_costos ?? 0),
      costo_total_adicional: Number(c.costo_total_adicional ?? 0),
      adelanto: Number(c.adelanto ?? 0),
      estado: c.estado as EstadoImportacion,
      observacion: c.observacion,
      cif_prorrateado_en: (c as unknown as { cif_prorrateado_en: string | null }).cif_prorrateado_en ?? null,
      cif_total_distribuido: Number((c as unknown as { cif_total_distribuido: number | null }).cif_total_distribuido ?? 0),
      created_at: c.created_at,
      updated_at: c.updated_at,
    };

    const ocs_vinculadas: OCVinculada[] = ((ocs ?? []) as unknown as OCRaw[]).map((o) => ({
      id: o.id,
      numero: o.numero,
      estado: o.estado,
      total: Number(o.total ?? 0),
      moneda: o.moneda ?? 'PEN',
      fecha: o.fecha,
      proveedor_razon_social: o.proveedor?.razon_social ?? '—',
    }));

    return { importacion, ocs_vinculadas };
  });
}

// ---------- Crear ----------

const crearSchema = z
  .object({
    proveedor_id: z.string().uuid('Proveedor inválido'),
    pais_origen: z.string().max(80).optional().or(z.literal('')),
    moneda: z.string().min(3).max(8).default('USD'),
    tipo_cambio: z.coerce.number().min(0).optional(),
    fecha_embarque: z.string().optional().or(z.literal('')),
    fecha_arribo_esperada: z.string().optional().or(z.literal('')),
    flete: z.coerce.number().min(0).default(0),
    seguro: z.coerce.number().min(0).default(0),
    aduanas: z.coerce.number().min(0).default(0),
    otros_costos: z.coerce.number().min(0).default(0),
    observacion: z.string().max(1000).optional().or(z.literal('')),
  })
  .superRefine((d, ctx) => {
    if (d.moneda !== 'PEN' && (!d.tipo_cambio || d.tipo_cambio <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tipo_cambio'],
        message: 'Tipo de cambio requerido y > 0 cuando la moneda no es PEN',
      });
    }
  });

export type CrearImportacionInput = z.input<typeof crearSchema>;

export async function crearImportacion(
  input: CrearImportacionInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const r = await runAction(async () => {
    const data = crearSchema.parse(input);
    const { sb } = await requireUser();

    // Generar correlativo IMP-NNNNNN. Usamos clave dedicada IMP_OC.
    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', {
      p_clave: 'IMP_OC',
      p_padding: 6,
    });
    if (errNro) throw new Error(`No se pudo generar número: ${errNro.message}`);
    const numero = `IMP-${nro}`;

    const insert = {
      numero,
      proveedor_id: data.proveedor_id,
      pais_origen: data.pais_origen?.trim() || null,
      moneda: data.moneda,
      tipo_cambio: data.moneda === 'PEN' ? data.tipo_cambio ?? 1 : data.tipo_cambio,
      fecha_embarque: data.fecha_embarque || null,
      fecha_arribo_esperada: data.fecha_arribo_esperada || null,
      flete: data.flete,
      seguro: data.seguro,
      aduanas: data.aduanas,
      otros_costos: data.otros_costos,
      estado: 'PREPARACION' as const,
      observacion: data.observacion?.trim() || null,
    };

    const { data: row, error } = await sb
      .from('importaciones')
      .insert(insert)
      .select('id, numero')
      .single();
    if (error) throw new Error(error.message);

    return { id: row.id as string, numero: row.numero as string };
  });

  if (r.ok) {
    await bumpPaths('/compras/importaciones');
  }
  return r;
}

// ---------- Actualizar ----------

const patchSchema = z
  .object({
    pais_origen: z.string().max(80).nullable().optional(),
    moneda: z.string().min(3).max(8).optional(),
    tipo_cambio: z.coerce.number().min(0).nullable().optional(),
    fecha_embarque: z.string().nullable().optional(),
    fecha_arribo_esperada: z.string().nullable().optional(),
    fecha_arribo_real: z.string().nullable().optional(),
    flete: z.coerce.number().min(0).optional(),
    seguro: z.coerce.number().min(0).optional(),
    aduanas: z.coerce.number().min(0).optional(),
    otros_costos: z.coerce.number().min(0).optional(),
    adelanto: z.coerce.number().min(0).optional(),
    observacion: z.string().max(1000).nullable().optional(),
  })
  .strict();

export type ActualizarImportacionPatch = z.input<typeof patchSchema>;

export async function actualizarImportacion(
  id: string,
  patch: ActualizarImportacionPatch,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const data = patchSchema.parse(patch);
    const { sb } = await requireUser();

    const { data: cur, error: errCur } = await sb
      .from('importaciones')
      .select('estado, moneda, tipo_cambio')
      .eq('id', id)
      .single();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error('Importación no encontrada');

    const estado = cur.estado as EstadoImportacion;
    if (estado === 'RECIBIDA' || estado === 'CANCELADA') {
      throw new Error(`No se puede editar una importación ${estado}`);
    }

    // Validar tipo_cambio si moneda final no es PEN.
    const monedaFinal = (data.moneda ?? (cur.moneda as string | null) ?? 'USD') as string;
    if (monedaFinal !== 'PEN') {
      const tcFinal =
        data.tipo_cambio !== undefined
          ? data.tipo_cambio
          : cur.tipo_cambio != null
            ? Number(cur.tipo_cambio)
            : null;
      if (tcFinal === null || tcFinal === undefined || tcFinal <= 0) {
        throw new Error('Tipo de cambio requerido y > 0 cuando la moneda no es PEN');
      }
    }

    type ImportacionUpdate = {
      pais_origen?: string | null;
      moneda?: string;
      tipo_cambio?: number | null;
      fecha_embarque?: string | null;
      fecha_arribo_esperada?: string | null;
      fecha_arribo_real?: string | null;
      flete?: number;
      seguro?: number;
      aduanas?: number;
      otros_costos?: number;
      adelanto?: number;
      observacion?: string | null;
    };
    const updatePayload: ImportacionUpdate = {};
    if (data.pais_origen !== undefined) {
      updatePayload.pais_origen = data.pais_origen === '' ? null : data.pais_origen;
    }
    if (data.moneda !== undefined) updatePayload.moneda = data.moneda;
    if (data.tipo_cambio !== undefined) updatePayload.tipo_cambio = data.tipo_cambio;
    if (data.fecha_embarque !== undefined) {
      updatePayload.fecha_embarque = data.fecha_embarque === '' ? null : data.fecha_embarque;
    }
    if (data.fecha_arribo_esperada !== undefined) {
      updatePayload.fecha_arribo_esperada =
        data.fecha_arribo_esperada === '' ? null : data.fecha_arribo_esperada;
    }
    if (data.fecha_arribo_real !== undefined) {
      updatePayload.fecha_arribo_real =
        data.fecha_arribo_real === '' ? null : data.fecha_arribo_real;
    }
    if (data.flete !== undefined) updatePayload.flete = data.flete;
    if (data.seguro !== undefined) updatePayload.seguro = data.seguro;
    if (data.aduanas !== undefined) updatePayload.aduanas = data.aduanas;
    if (data.otros_costos !== undefined) updatePayload.otros_costos = data.otros_costos;
    if (data.adelanto !== undefined) updatePayload.adelanto = data.adelanto;
    if (data.observacion !== undefined) {
      updatePayload.observacion = data.observacion === '' ? null : data.observacion;
    }

    if (Object.keys(updatePayload).length === 0) {
      return { ok: true as const };
    }

    const { error } = await sb.from('importaciones').update(updatePayload).eq('id', id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/compras/importaciones', `/compras/importaciones/${id}`);
  }
  return r;
}

// ---------- Vincular / Desvincular OC ----------

export async function vincularOCaImportacion(
  importacionId: string,
  ocId: string,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!importacionId || !ocId) throw new Error('Importación y OC requeridas');
    const { sb } = await requireUser();

    const { data: imp, error: errImp } = await sb
      .from('importaciones')
      .select('id, estado')
      .eq('id', importacionId)
      .single();
    if (errImp) throw new Error(errImp.message);
    if (!imp) throw new Error('Importación no encontrada');
    const estado = imp.estado as EstadoImportacion;
    if (estado === 'RECIBIDA' || estado === 'CANCELADA') {
      throw new Error(`No se puede vincular OCs a una importación ${estado}`);
    }

    const { data: oc, error: errOc } = await sb
      .from('oc')
      .select('id, importacion_id, estado')
      .eq('id', ocId)
      .single();
    if (errOc) throw new Error(errOc.message);
    if (!oc) throw new Error('OC no encontrada');
    if (oc.importacion_id && oc.importacion_id !== importacionId) {
      throw new Error('La OC ya está vinculada a otra importación');
    }

    const { error } = await sb
      .from('oc')
      .update({ importacion_id: importacionId })
      .eq('id', ocId);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths(
      '/compras/importaciones',
      `/compras/importaciones/${importacionId}`,
      '/oc',
      `/oc/${ocId}`,
    );
  }
  return r;
}

export async function desvincularOCdeImportacion(
  ocId: string,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!ocId) throw new Error('OC requerida');
    const { sb } = await requireUser();

    const { data: oc, error: errOc } = await sb
      .from('oc')
      .select('id, importacion_id')
      .eq('id', ocId)
      .single();
    if (errOc) throw new Error(errOc.message);
    if (!oc) throw new Error('OC no encontrada');
    if (!oc.importacion_id) {
      throw new Error('La OC no está vinculada a ninguna importación');
    }

    const { data: imp, error: errImp } = await sb
      .from('importaciones')
      .select('id, estado')
      .eq('id', oc.importacion_id as string)
      .single();
    if (errImp) throw new Error(errImp.message);
    if ((imp?.estado as EstadoImportacion) === 'RECIBIDA') {
      throw new Error('No se puede desvincular una OC de una importación RECIBIDA');
    }

    const { error } = await sb.from('oc').update({ importacion_id: null }).eq('id', ocId);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/compras/importaciones', '/oc', `/oc/${ocId}`);
  }
  return r;
}

// ---------- Cambiar estado ----------

const estadoSchema = z.enum(ESTADOS_IMPORTACION);

export async function cambiarEstadoImportacion(
  id: string,
  nuevoEstado: EstadoImportacion,
): Promise<ActionResult<{ ok: true; estado: EstadoImportacion }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const nuevo = estadoSchema.parse(nuevoEstado);
    const { sb } = await requireUser();

    const { data: cur, error: errCur } = await sb
      .from('importaciones')
      .select('estado, fecha_arribo_real')
      .eq('id', id)
      .single();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error('Importación no encontrada');

    const actual = cur.estado as EstadoImportacion;
    const permitidos = TRANSICIONES[actual] ?? [];
    if (!permitidos.includes(nuevo)) {
      throw new Error(
        `Transición ${actual} → ${nuevo} no permitida. Estados válidos: ${permitidos.join(', ') || '(ninguno, estado final)'}`,
      );
    }

    const update: { estado: EstadoImportacion; fecha_arribo_real?: string } = { estado: nuevo };
    if (nuevo === 'RECIBIDA' && !cur.fecha_arribo_real) {
      update.fecha_arribo_real = new Date().toISOString().slice(0, 10);
    }

    const { error } = await sb.from('importaciones').update(update).eq('id', id);
    if (error) throw new Error(error.message);

    return { ok: true as const, estado: nuevo };
  });

  if (r.ok) {
    await bumpPaths('/compras/importaciones', `/compras/importaciones/${id}`);
  }
  return r;
}

// ---------- Eliminar (solo PREPARACION sin OCs) ----------

export async function eliminarImportacion(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cur, error: errCur } = await sb
      .from('importaciones')
      .select('estado')
      .eq('id', id)
      .single();
    if (errCur) throw new Error(errCur.message);
    if (!cur) throw new Error('Importación no encontrada');

    if ((cur.estado as EstadoImportacion) !== 'PREPARACION') {
      throw new Error('Solo se pueden eliminar importaciones en estado PREPARACION');
    }

    const { count, error: errCnt } = await sb
      .from('oc')
      .select('id', { count: 'exact', head: true })
      .eq('importacion_id', id);
    if (errCnt) throw new Error(errCnt.message);
    if ((count ?? 0) > 0) {
      throw new Error('No se puede eliminar: tiene OCs vinculadas. Desvincúlalas primero.');
    }

    const { error } = await sb.from('importaciones').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/compras/importaciones');
  }
  return r;
}

// ---------- Listar OCs disponibles para vincular ----------

type OCDispRaw = {
  id: string;
  numero: string;
  fecha: string;
  estado: string;
  total: string | number | null;
  moneda: string | null;
  proveedor_id: string;
  proveedor: { razon_social: string } | null;
};

export async function listarOCsDisponiblesParaImportacion(): Promise<ActionResult<OCDisponible[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();

    // OCs sin importación, en estado BORRADOR o APROBADA (las que aún no se
    // recibieron y pueden agruparse en un embarque).
    const { data, error } = await sb
      .from('oc')
      .select(
        'id, numero, fecha, estado, total, moneda, proveedor_id, proveedor:proveedor_id(razon_social)',
      )
      .is('importacion_id', null)
      .in('estado', ['BORRADOR', 'APROBADA'])
      .order('fecha', { ascending: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as OCDispRaw[]).map((o) => ({
      id: o.id,
      numero: o.numero,
      fecha: o.fecha,
      estado: o.estado,
      total: Number(o.total ?? 0),
      moneda: o.moneda ?? 'PEN',
      proveedor_id: o.proveedor_id,
      proveedor_razon_social: o.proveedor?.razon_social ?? '—',
    }));
  });
}

// ---------- Helper: listar proveedores activos para selector ----------

type ProvRaw = {
  id: string;
  razon_social: string;
  numero_documento: string;
  es_importacion: boolean | null;
};

export type ProveedorOption = {
  id: string;
  razon_social: string;
  numero_documento: string;
  es_importacion: boolean;
};

export async function listarProveedoresParaImportacion(): Promise<ActionResult<ProveedorOption[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('proveedores')
      .select('id, razon_social, numero_documento, es_importacion')
      .eq('activo', true)
      .order('razon_social', { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ProvRaw[]).map((p) => ({
      id: p.id,
      razon_social: p.razon_social,
      numero_documento: p.numero_documento,
      es_importacion: !!p.es_importacion,
    }));
  });
}

// ---------- Prorrateo CIF ----------

export type ProrrateoCIFResultado = {
  ok: boolean;
  lineas_actualizadas: number;
  costo_total_distribuido: number;
  valor_fob_total?: number;
  materiales_actualizados?: number;
  mensaje: string;
};

/**
 * Llama a la función SQL `prorratear_cif_importacion` que distribuye los
 * costos adicionales (flete + seguro + aduanas + otros) proporcionalmente al
 * valor FOB de cada línea recibida vinculada a esta importación.
 *
 * Es IDEMPOTENTE: se puede llamar varias veces. Si después de prorratear se
 * ajustan los costos adicionales, basta con volver a invocar para recalcular.
 *
 * NO modifica el kardex_movimientos (histórico FOB). Sí actualiza
 * materiales.precio_unitario con el costo CIF más reciente para reportes.
 */
export async function prorratearCIFImportacion(
  importacionId: string,
): Promise<ActionResult<ProrrateoCIFResultado>> {
  return runAction(async () => {
    if (!importacionId) throw new Error('Id requerido');
    const { sb } = await requireUser();

    // RPC nueva (migración 48) — aún no está en los types autogenerados de Supabase.
    const { data, error } = await (sb as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    }).rpc('prorratear_cif_importacion', { p_imp_id: importacionId });
    if (error) throw new Error(error.message);

    const result = data as unknown as ProrrateoCIFResultado;
    if (!result?.ok) {
      throw new Error(result?.mensaje ?? 'No se pudo prorratear');
    }

    await bumpPaths('/compras/importaciones', `/compras/importaciones/${importacionId}`, '/reportes/stock-valorizado');
    return result;
  });
}
