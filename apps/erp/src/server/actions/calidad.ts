'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Módulo de Control de Calidad.
 *
 * Cabecera (controles_calidad) + detalle (controles_calidad_detalle).
 * Los controles se registran cerrados (no hay estado borrador). Al crear:
 *   - Se calcula automáticamente cantidad_falla = SUM(detalle.cantidad).
 *   - Se desglosa por acción (reproceso/segunda/merma) sumando detalle.
 *   - cantidad_ok = cantidad_revisada - cantidad_falla.
 *
 * Correlativo: 'CC-NNNNNN' vía next_correlativo({p_clave:'CONTROL_CALIDAD', p_padding:6}).
 *
 * Catálogo de defectos: CRUD básico con soft-delete (campo `activo`).
 */

// ---------- Constantes y tipos comunes ----------

const TALLAS = ['T0', 'T2', 'T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16', 'TS', 'TAD'] as const;
const ACCIONES = ['REPROCESO', 'SEGUNDA', 'MERMA', 'DEVOLVER_TALLER'] as const;
const SEVERIDADES = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;

export type AccionDefecto = (typeof ACCIONES)[number];
export type SeveridadDefecto = (typeof SEVERIDADES)[number];
export type TallaPrenda = (typeof TALLAS)[number];

// ---------- Tipos públicos ----------

export type ControlRow = {
  id: string;
  numero: string;
  fecha: string;
  ot_id: string | null;
  ot_numero: string | null;
  os_id: string | null;
  os_numero: string | null;
  producto_id: string | null;
  producto_codigo: string | null;
  producto_nombre: string | null;
  revisor_id: string | null;
  revisor_nombre: string | null;
  cantidad_revisada: number;
  cantidad_ok: number;
  cantidad_falla: number;
  cantidad_segunda: number;
  cantidad_reproceso: number;
  cantidad_merma: number;
  tasa_calidad: number; // 0..100
  responsable_taller_nombre: string | null;
  responsable_operario_nombre: string | null;
};

export type ControlDetalle = {
  id: string;
  numero: string;
  fecha: string;
  ot_id: string | null;
  ot_numero: string | null;
  os_id: string | null;
  os_numero: string | null;
  ingreso_pt_id: string | null;
  ingreso_pt_numero: string | null;
  producto_id: string | null;
  producto_codigo: string | null;
  producto_nombre: string | null;
  revisor_id: string | null;
  revisor_nombre: string | null;
  cantidad_revisada: number;
  cantidad_ok: number;
  cantidad_falla: number;
  cantidad_reproceso: number;
  cantidad_segunda: number;
  cantidad_merma: number;
  responsable_taller_id: string | null;
  responsable_taller_nombre: string | null;
  responsable_operario_id: string | null;
  responsable_operario_nombre: string | null;
  descuento_aplicado: number;
  observacion: string | null;
};

export type ControlLineaDetalle = {
  id: string;
  defecto_id: string | null;
  defecto_codigo: string | null;
  defecto_nombre: string;
  defecto_severidad: SeveridadDefecto | null;
  cantidad: number;
  talla: TallaPrenda | null;
  accion: AccionDefecto | null;
  observacion: string | null;
};

export type DefectoRow = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  severidad: SeveridadDefecto | null;
  accion_default: AccionDefecto | null;
  activo: boolean;
};

// ---------- Helper: nombre de revisor desde perfiles ----------

async function obtenerNombresUsuarios(
  sb: Awaited<ReturnType<typeof requireUser>>['sb'],
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const limpios = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const out = new Map<string, string>();
  if (limpios.length === 0) return out;
  const { data } = await sb
    .from('perfiles')
    .select('id, nombre_completo')
    .in('id', limpios);
  for (const p of data ?? []) {
    out.set(p.id as string, ((p.nombre_completo as string | null) ?? '').trim() || '—');
  }
  return out;
}

// ---------- Listar controles ----------

const listarSchema = z.object({
  ot_id: z.string().uuid().optional().or(z.literal('')),
  os_id: z.string().uuid().optional().or(z.literal('')),
  producto_id: z.string().uuid().optional().or(z.literal('')),
  revisor_id: z.string().uuid().optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type ControlesFiltros = z.input<typeof listarSchema>;

type CabRaw = {
  id: string;
  numero: string;
  fecha: string;
  ot_id: string | null;
  os_id: string | null;
  producto_id: string | null;
  revisor_usuario_id: string | null;
  cantidad_revisada: number | string;
  cantidad_ok: number | string | null;
  cantidad_falla: number | string | null;
  cantidad_segunda: number | string | null;
  cantidad_reproceso: number | string | null;
  cantidad_merma: number | string | null;
  ot: { numero: string } | null;
  os: { numero: string } | null;
  producto: { codigo: string; nombre: string } | null;
  responsable_taller: { nombre: string } | null;
  responsable_operario: { nombres: string; apellido_paterno: string | null } | null;
};

export async function listarControles(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{ rows: ControlRow[]; total: number; pagina: number; por_pagina: number }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('controles_calidad')
      .select(
        'id, numero, fecha, ot_id, os_id, producto_id, revisor_usuario_id, ' +
          'cantidad_revisada, cantidad_ok, cantidad_falla, cantidad_segunda, cantidad_reproceso, cantidad_merma, ' +
          'ot:ot_id(numero), ' +
          'os:os_id(numero), ' +
          'producto:producto_id(codigo, nombre), ' +
          'responsable_taller:responsable_taller_id(nombre), ' +
          'responsable_operario:responsable_operario_id(nombres, apellido_paterno)',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false });

    if (data.ot_id) q = q.eq('ot_id', data.ot_id);
    if (data.os_id) q = q.eq('os_id', data.os_id);
    if (data.producto_id) q = q.eq('producto_id', data.producto_id);
    if (data.revisor_id) q = q.eq('revisor_usuario_id', data.revisor_id);
    if (data.desde) q = q.gte('fecha', `${data.desde}T00:00:00`);
    if (data.hasta) q = q.lte('fecha', `${data.hasta}T23:59:59`);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const raws = (rows ?? []) as unknown as CabRaw[];
    const nombres = await obtenerNombresUsuarios(
      sb,
      raws.map((r) => r.revisor_usuario_id),
    );

    const mapped: ControlRow[] = raws.map((r) => {
      const revisada = Number(r.cantidad_revisada ?? 0);
      const ok = Number(r.cantidad_ok ?? 0);
      const tasa = revisada > 0 ? Math.round((ok / revisada) * 1000) / 10 : 0;
      const opNombre = r.responsable_operario
        ? `${r.responsable_operario.nombres ?? ''} ${r.responsable_operario.apellido_paterno ?? ''}`.trim()
        : null;
      return {
        id: r.id,
        numero: r.numero,
        fecha: r.fecha,
        ot_id: r.ot_id,
        ot_numero: r.ot?.numero ?? null,
        os_id: r.os_id,
        os_numero: r.os?.numero ?? null,
        producto_id: r.producto_id,
        producto_codigo: r.producto?.codigo ?? null,
        producto_nombre: r.producto?.nombre ?? null,
        revisor_id: r.revisor_usuario_id,
        revisor_nombre: r.revisor_usuario_id
          ? (nombres.get(r.revisor_usuario_id) ?? '—')
          : null,
        cantidad_revisada: revisada,
        cantidad_ok: ok,
        cantidad_falla: Number(r.cantidad_falla ?? 0),
        cantidad_segunda: Number(r.cantidad_segunda ?? 0),
        cantidad_reproceso: Number(r.cantidad_reproceso ?? 0),
        cantidad_merma: Number(r.cantidad_merma ?? 0),
        tasa_calidad: tasa,
        responsable_taller_nombre: r.responsable_taller?.nombre ?? null,
        responsable_operario_nombre: opNombre,
      };
    });

    return {
      rows: mapped,
      total: Number(count ?? 0),
      pagina: data.pagina,
      por_pagina: data.por_pagina,
    };
  });
}

// ---------- Obtener control ----------

type CabDetalleRaw = {
  id: string;
  numero: string;
  fecha: string;
  ot_id: string | null;
  os_id: string | null;
  producto_id: string | null;
  ingreso_pt_id: string | null;
  revisor_usuario_id: string | null;
  cantidad_revisada: number | string;
  cantidad_ok: number | string | null;
  cantidad_falla: number | string | null;
  cantidad_reproceso: number | string | null;
  cantidad_segunda: number | string | null;
  cantidad_merma: number | string | null;
  responsable_taller_id: string | null;
  responsable_operario_id: string | null;
  descuento_aplicado: number | string | null;
  observacion: string | null;
  ot: { numero: string } | null;
  os: { numero: string } | null;
  ingreso_pt: { numero: string } | null;
  producto: { codigo: string; nombre: string } | null;
  responsable_taller: { nombre: string } | null;
  responsable_operario: { nombres: string; apellido_paterno: string | null } | null;
};

type LineaDetRaw = {
  id: string;
  defecto_id: string | null;
  cantidad: number | string;
  talla: string | null;
  accion: string | null;
  observacion: string | null;
  defecto: {
    codigo: string;
    nombre: string;
    severidad: string | null;
  } | null;
};

export async function obtenerControl(
  id: string,
): Promise<ActionResult<{ control: ControlDetalle; detalle: ControlLineaDetalle[] }>> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('controles_calidad')
      .select(
        'id, numero, fecha, ot_id, os_id, producto_id, ingreso_pt_id, revisor_usuario_id, ' +
          'cantidad_revisada, cantidad_ok, cantidad_falla, cantidad_reproceso, cantidad_segunda, cantidad_merma, ' +
          'responsable_taller_id, responsable_operario_id, descuento_aplicado, observacion, ' +
          'ot:ot_id(numero), ' +
          'os:os_id(numero), ' +
          'ingreso_pt:ingreso_pt_id(numero), ' +
          'producto:producto_id(codigo, nombre), ' +
          'responsable_taller:responsable_taller_id(nombre), ' +
          'responsable_operario:responsable_operario_id(nombres, apellido_paterno)',
      )
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!cab) throw new Error('Control no encontrado');

    const c = cab as unknown as CabDetalleRaw;

    const { data: detRaw, error: errDet } = await sb
      .from('controles_calidad_detalle')
      .select(
        'id, defecto_id, cantidad, talla, accion, observacion, ' +
          'defecto:defecto_id(codigo, nombre, severidad)',
      )
      .eq('control_id', id);
    if (errDet) throw new Error(errDet.message);

    const detalle: ControlLineaDetalle[] = ((detRaw ?? []) as unknown as LineaDetRaw[]).map(
      (l) => ({
        id: l.id,
        defecto_id: l.defecto_id,
        defecto_codigo: l.defecto?.codigo ?? null,
        defecto_nombre: l.defecto?.nombre ?? '—',
        defecto_severidad: (l.defecto?.severidad as SeveridadDefecto | null) ?? null,
        cantidad: Number(l.cantidad ?? 0),
        talla: (l.talla as TallaPrenda | null) ?? null,
        accion: (l.accion as AccionDefecto | null) ?? null,
        observacion: l.observacion,
      }),
    );

    const nombres = await obtenerNombresUsuarios(sb, [c.revisor_usuario_id]);
    const opNombre = c.responsable_operario
      ? `${c.responsable_operario.nombres ?? ''} ${c.responsable_operario.apellido_paterno ?? ''}`.trim()
      : null;

    const control: ControlDetalle = {
      id: c.id,
      numero: c.numero,
      fecha: c.fecha,
      ot_id: c.ot_id,
      ot_numero: c.ot?.numero ?? null,
      os_id: c.os_id,
      os_numero: c.os?.numero ?? null,
      ingreso_pt_id: c.ingreso_pt_id,
      ingreso_pt_numero: c.ingreso_pt?.numero ?? null,
      producto_id: c.producto_id,
      producto_codigo: c.producto?.codigo ?? null,
      producto_nombre: c.producto?.nombre ?? null,
      revisor_id: c.revisor_usuario_id,
      revisor_nombre: c.revisor_usuario_id
        ? (nombres.get(c.revisor_usuario_id) ?? '—')
        : null,
      cantidad_revisada: Number(c.cantidad_revisada ?? 0),
      cantidad_ok: Number(c.cantidad_ok ?? 0),
      cantidad_falla: Number(c.cantidad_falla ?? 0),
      cantidad_reproceso: Number(c.cantidad_reproceso ?? 0),
      cantidad_segunda: Number(c.cantidad_segunda ?? 0),
      cantidad_merma: Number(c.cantidad_merma ?? 0),
      responsable_taller_id: c.responsable_taller_id,
      responsable_taller_nombre: c.responsable_taller?.nombre ?? null,
      responsable_operario_id: c.responsable_operario_id,
      responsable_operario_nombre: opNombre,
      descuento_aplicado: Number(c.descuento_aplicado ?? 0),
      observacion: c.observacion,
    };

    return { control, detalle };
  });
}

// ---------- Crear control ----------

const lineaSchema = z.object({
  defecto_id: z.string().uuid('Defecto inválido'),
  cantidad: z.coerce.number().int('Cantidad debe ser entera').positive('Cantidad debe ser > 0'),
  talla: z.enum(TALLAS).optional().or(z.literal('')),
  accion: z.enum(ACCIONES),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

const crearSchema = z
  .object({
    ot_id: z.string().uuid().optional().or(z.literal('')),
    os_id: z.string().uuid().optional().or(z.literal('')),
    producto_id: z.string().uuid().optional().or(z.literal('')),
    ingreso_pt_id: z.string().uuid().optional().or(z.literal('')),
    cantidad_revisada: z.coerce
      .number()
      .int('Cantidad revisada debe ser entera')
      .positive('Cantidad revisada debe ser > 0'),
    responsable_taller_id: z.string().uuid().optional().or(z.literal('')),
    responsable_operario_id: z.string().uuid().optional().or(z.literal('')),
    descuento_aplicado: z.coerce.number().min(0).optional(),
    observacion: z.string().max(500).optional().or(z.literal('')),
    detalle: z.array(lineaSchema).default([]),
  })
  .refine(
    (d) => !!(d.ot_id || d.os_id || d.producto_id),
    {
      message: 'Debe indicar al menos una OT, OS o producto',
      path: ['ot_id'],
    },
  );

export type CrearControlInput = z.input<typeof crearSchema>;

export async function crearControl(
  input: CrearControlInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const r = await runAction(async () => {
    const data = crearSchema.parse(input);
    const { sb, userId } = await requireUser();

    // 1) Calcular agregados a partir del detalle.
    const totalFalla = data.detalle.reduce((s, l) => s + l.cantidad, 0);
    if (totalFalla > data.cantidad_revisada) {
      throw new Error(
        `Total de fallas (${totalFalla}) no puede superar la cantidad revisada (${data.cantidad_revisada})`,
      );
    }
    const cantidadOk = data.cantidad_revisada - totalFalla;

    const sumaPorAccion = (acc: AccionDefecto) =>
      data.detalle.filter((l) => l.accion === acc).reduce((s, l) => s + l.cantidad, 0);
    const cantidadReproceso = sumaPorAccion('REPROCESO');
    const cantidadSegunda = sumaPorAccion('SEGUNDA');
    const cantidadMerma = sumaPorAccion('MERMA');
    // DEVOLVER_TALLER no tiene columna dedicada — queda contado en cantidad_falla.

    // 2) Generar correlativo CC-NNNNNN.
    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', {
      p_clave: 'CONTROL_CALIDAD',
      p_padding: 6,
    });
    if (errNro) throw new Error(`No se pudo generar número: ${errNro.message}`);
    const numero = `CC-${nro}`;

    // 3) Insertar cabecera.
    const { data: cab, error: errCab } = await sb
      .from('controles_calidad')
      .insert({
        numero,
        ot_id: data.ot_id || null,
        os_id: data.os_id || null,
        producto_id: data.producto_id || null,
        ingreso_pt_id: data.ingreso_pt_id || null,
        revisor_usuario_id: userId,
        cantidad_revisada: data.cantidad_revisada,
        cantidad_ok: cantidadOk,
        cantidad_falla: totalFalla,
        cantidad_reproceso: cantidadReproceso,
        cantidad_segunda: cantidadSegunda,
        cantidad_merma: cantidadMerma,
        responsable_taller_id: data.responsable_taller_id || null,
        responsable_operario_id: data.responsable_operario_id || null,
        descuento_aplicado: data.descuento_aplicado ?? 0,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errCab) throw new Error(errCab.message);
    const controlId = cab.id as string;

    // 4) Insertar detalle (si hay).
    if (data.detalle.length > 0) {
      const lineas = data.detalle.map((l) => ({
        control_id: controlId,
        defecto_id: l.defecto_id,
        cantidad: l.cantidad,
        talla: l.talla ? (l.talla as TallaPrenda) : null,
        accion: l.accion,
        observacion: l.observacion?.trim() || null,
      }));
      const { error: errDet } = await sb.from('controles_calidad_detalle').insert(lineas);
      if (errDet) {
        // Rollback manual de la cabecera si fallan las líneas.
        await sb.from('controles_calidad').delete().eq('id', controlId);
        throw new Error(`No se pudo insertar el detalle: ${errDet.message}`);
      }
    }

    return { id: controlId, numero };
  });

  if (r.ok) {
    await bumpPaths('/calidad');
  }
  return r;
}

// ---------- Eliminar control ----------

export async function eliminarControl(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    // RLS filtra acceso por rol; si el usuario no tiene permiso, la query falla.
    const { error } = await sb.from('controles_calidad').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/calidad', `/calidad/${id}`);
  }
  return r;
}

// ---------- Catálogo de defectos ----------

export async function listarDefectos(
  incluirInactivos = false,
): Promise<ActionResult<DefectoRow[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    let q = sb
      .from('defectos')
      .select('id, codigo, nombre, descripcion, severidad, accion_default, activo')
      .order('codigo');
    if (!incluirInactivos) q = q.eq('activo', true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as DefectoRow[]).map((d) => ({
      id: d.id,
      codigo: d.codigo,
      nombre: d.nombre,
      descripcion: d.descripcion ?? null,
      severidad: (d.severidad as SeveridadDefecto | null) ?? null,
      accion_default: (d.accion_default as AccionDefecto | null) ?? null,
      activo: !!d.activo,
    }));
  });
}

const crearDefectoSchema = z.object({
  codigo: z.string().trim().min(1, 'Código requerido').max(40),
  nombre: z.string().trim().min(2, 'Nombre requerido').max(120),
  descripcion: z.string().max(500).optional().or(z.literal('')),
  severidad: z.enum(SEVERIDADES),
  accion_default: z.enum(ACCIONES).optional().or(z.literal('')),
});

export type CrearDefectoInput = z.input<typeof crearDefectoSchema>;

export async function crearDefecto(
  input: CrearDefectoInput,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    const data = crearDefectoSchema.parse(input);
    const { sb } = await requireUser();

    const { data: row, error } = await sb
      .from('defectos')
      .insert({
        codigo: data.codigo,
        nombre: data.nombre,
        descripcion: data.descripcion?.trim() || null,
        severidad: data.severidad,
        accion_default: data.accion_default || null,
        activo: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
  if (r.ok) await bumpPaths('/calidad/defectos', '/calidad/nuevo');
  return r;
}

const patchDefectoSchema = crearDefectoSchema.partial();

export async function actualizarDefecto(
  id: string,
  patch: z.input<typeof patchDefectoSchema>,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const data = patchDefectoSchema.parse(patch);
    const { sb } = await requireUser();

    const update: {
      codigo?: string;
      nombre?: string;
      descripcion?: string | null;
      severidad?: SeveridadDefecto;
      accion_default?: AccionDefecto | null;
    } = {};
    if (data.codigo !== undefined) update.codigo = data.codigo;
    if (data.nombre !== undefined) update.nombre = data.nombre;
    if (data.descripcion !== undefined) update.descripcion = data.descripcion?.trim() || null;
    if (data.severidad !== undefined) update.severidad = data.severidad;
    if (data.accion_default !== undefined)
      update.accion_default = data.accion_default ? (data.accion_default as AccionDefecto) : null;

    if (Object.keys(update).length === 0) return { ok: true as const };

    const { error } = await sb.from('defectos').update(update).eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
  if (r.ok) await bumpPaths('/calidad/defectos', '/calidad/nuevo');
  return r;
}

export async function desactivarDefecto(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();
    const { error } = await sb.from('defectos').update({ activo: false }).eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
  if (r.ok) await bumpPaths('/calidad/defectos', '/calidad/nuevo');
  return r;
}

export async function reactivarDefecto(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();
    const { error } = await sb.from('defectos').update({ activo: true }).eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
  if (r.ok) await bumpPaths('/calidad/defectos', '/calidad/nuevo');
  return r;
}

// ---------- Estadísticas ----------

const estadSchema = z.object({
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  producto_id: z.string().uuid().optional().or(z.literal('')),
});

export type EstadisticasCalidad = {
  total_revisados: number;
  total_ok: number;
  total_falla: number;
  total_controles: number;
  tasa_calidad: number;
  top_defectos: Array<{
    defecto_id: string;
    defecto_nombre: string;
    severidad: SeveridadDefecto | null;
    total_cantidad: number;
    controles_count: number;
  }>;
  por_taller: Array<{
    taller_id: string;
    taller_nombre: string;
    revisados: number;
    falla: number;
    tasa: number;
  }>;
};

export async function estadisticasCalidad(
  input: z.input<typeof estadSchema>,
): Promise<ActionResult<EstadisticasCalidad>> {
  return runAction(async () => {
    const data = estadSchema.parse(input);
    const { sb } = await requireUser();

    // Cabeceras filtradas (necesarias para totales globales y agregado por taller).
    let qCab = sb
      .from('controles_calidad')
      .select(
        'id, producto_id, cantidad_revisada, cantidad_ok, cantidad_falla, responsable_taller_id, ' +
          'responsable_taller:responsable_taller_id(nombre)',
      );
    if (data.desde) qCab = qCab.gte('fecha', `${data.desde}T00:00:00`);
    if (data.hasta) qCab = qCab.lte('fecha', `${data.hasta}T23:59:59`);
    if (data.producto_id) qCab = qCab.eq('producto_id', data.producto_id);

    const { data: cabs, error: errCab } = await qCab;
    if (errCab) throw new Error(errCab.message);

    type CabAgg = {
      id: string;
      cantidad_revisada: number | string;
      cantidad_ok: number | string | null;
      cantidad_falla: number | string | null;
      responsable_taller_id: string | null;
      responsable_taller: { nombre: string } | null;
    };
    const cabsTyped = (cabs ?? []) as unknown as CabAgg[];

    const totalRevisados = cabsTyped.reduce((s, c) => s + Number(c.cantidad_revisada ?? 0), 0);
    const totalOk = cabsTyped.reduce((s, c) => s + Number(c.cantidad_ok ?? 0), 0);
    const totalFalla = cabsTyped.reduce((s, c) => s + Number(c.cantidad_falla ?? 0), 0);
    const tasaCalidad = totalRevisados > 0 ? Math.round((totalOk / totalRevisados) * 1000) / 10 : 0;

    // Agregado por taller.
    const porTallerMap = new Map<
      string,
      { taller_id: string; taller_nombre: string; revisados: number; falla: number }
    >();
    for (const c of cabsTyped) {
      if (!c.responsable_taller_id) continue;
      const cur = porTallerMap.get(c.responsable_taller_id) ?? {
        taller_id: c.responsable_taller_id,
        taller_nombre: c.responsable_taller?.nombre ?? '—',
        revisados: 0,
        falla: 0,
      };
      cur.revisados += Number(c.cantidad_revisada ?? 0);
      cur.falla += Number(c.cantidad_falla ?? 0);
      porTallerMap.set(c.responsable_taller_id, cur);
    }
    const porTaller = Array.from(porTallerMap.values())
      .map((t) => ({
        ...t,
        tasa: t.revisados > 0 ? Math.round(((t.revisados - t.falla) / t.revisados) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.falla - a.falla)
      .slice(0, 10);

    // Top defectos: traemos el detalle restringido a los controles ya filtrados.
    const cabIds = cabsTyped.map((c) => c.id);
    let topDefectos: EstadisticasCalidad['top_defectos'] = [];
    if (cabIds.length > 0) {
      const { data: det, error: errDet } = await sb
        .from('controles_calidad_detalle')
        .select(
          'control_id, defecto_id, cantidad, defecto:defecto_id(nombre, severidad)',
        )
        .in('control_id', cabIds);
      if (errDet) throw new Error(errDet.message);

      type DetAgg = {
        control_id: string;
        defecto_id: string | null;
        cantidad: number | string;
        defecto: { nombre: string; severidad: string | null } | null;
      };
      const detTyped = (det ?? []) as unknown as DetAgg[];

      const agg = new Map<
        string,
        {
          defecto_id: string;
          defecto_nombre: string;
          severidad: SeveridadDefecto | null;
          total_cantidad: number;
          controles: Set<string>;
        }
      >();
      for (const d of detTyped) {
        if (!d.defecto_id) continue;
        const cur = agg.get(d.defecto_id) ?? {
          defecto_id: d.defecto_id,
          defecto_nombre: d.defecto?.nombre ?? '—',
          severidad: (d.defecto?.severidad as SeveridadDefecto | null) ?? null,
          total_cantidad: 0,
          controles: new Set<string>(),
        };
        cur.total_cantidad += Number(d.cantidad ?? 0);
        cur.controles.add(d.control_id);
        agg.set(d.defecto_id, cur);
      }
      topDefectos = Array.from(agg.values())
        .map((a) => ({
          defecto_id: a.defecto_id,
          defecto_nombre: a.defecto_nombre,
          severidad: a.severidad,
          total_cantidad: a.total_cantidad,
          controles_count: a.controles.size,
        }))
        .sort((a, b) => b.total_cantidad - a.total_cantidad)
        .slice(0, 10);
    }

    return {
      total_revisados: totalRevisados,
      total_ok: totalOk,
      total_falla: totalFalla,
      total_controles: cabsTyped.length,
      tasa_calidad: tasaCalidad,
      top_defectos: topDefectos,
      por_taller: porTaller,
    };
  });
}

// ---------- Loaders para selectores del formulario ----------

export type OTLookup = {
  id: string;
  numero: string;
  estado: string;
  producto_id: string | null;
  producto_codigo: string | null;
  producto_nombre: string | null;
};

export type OSLookup = {
  id: string;
  numero: string;
  estado: string;
  ot_id: string | null;
  ot_numero: string | null;
  producto_id: string | null;
  producto_codigo: string | null;
  producto_nombre: string | null;
};

export type ProductoLookup = {
  id: string;
  codigo: string;
  nombre: string;
};

export type TallerLookup = { id: string; codigo: string; nombre: string };
export type OperarioLookup = { id: string; codigo: string; nombre: string };

export async function listarOTsParaCalidad(): Promise<ActionResult<OTLookup[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('ot')
      .select(
        'id, numero, estado, ot_lineas(producto_id, productos:producto_id(codigo, nombre))',
      )
      .order('numero', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    type Raw = {
      id: string;
      numero: string;
      estado: string;
      ot_lineas: Array<{
        producto_id: string | null;
        productos: { codigo: string; nombre: string } | null;
      }> | null;
    };
    return ((data ?? []) as unknown as Raw[]).map((o) => {
      const primera = (o.ot_lineas ?? []).find((l) => l.producto_id);
      return {
        id: o.id,
        numero: o.numero,
        estado: o.estado,
        producto_id: primera?.producto_id ?? null,
        producto_codigo: primera?.productos?.codigo ?? null,
        producto_nombre: primera?.productos?.nombre ?? null,
      };
    });
  });
}

export async function listarOSsParaCalidad(): Promise<ActionResult<OSLookup[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('ordenes_servicio')
      .select(
        'id, numero, estado, ot_id, producto_id, ' +
          'ot:ot_id(numero), producto:producto_id(codigo, nombre)',
      )
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    type Raw = {
      id: string;
      numero: string;
      estado: string;
      ot_id: string | null;
      producto_id: string | null;
      ot: { numero: string } | null;
      producto: { codigo: string; nombre: string } | null;
    };
    return ((data ?? []) as unknown as Raw[]).map((o) => ({
      id: o.id,
      numero: o.numero,
      estado: o.estado,
      ot_id: o.ot_id,
      ot_numero: o.ot?.numero ?? null,
      producto_id: o.producto_id,
      producto_codigo: o.producto?.codigo ?? null,
      producto_nombre: o.producto?.nombre ?? null,
    }));
  });
}

export async function listarProductosParaCalidad(): Promise<ActionResult<ProductoLookup[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('productos')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('nombre')
      .limit(500);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as ProductoLookup[]).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
    }));
  });
}

export async function listarTalleresParaCalidad(): Promise<ActionResult<TallerLookup[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('talleres')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('nombre');
    if (error) throw new Error(error.message);
    type Raw = { id: string; codigo: string | null; nombre: string };
    return ((data ?? []) as unknown as Raw[]).map((t) => ({
      id: t.id,
      codigo: t.codigo ?? '',
      nombre: t.nombre ?? '—',
    }));
  });
}

export async function listarOperariosParaCalidad(): Promise<ActionResult<OperarioLookup[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('operarios')
      .select('id, codigo, nombres, apellido_paterno')
      .eq('activo', true)
      .order('nombres');
    if (error) throw new Error(error.message);
    type Raw = { id: string; codigo: string | null; nombres: string; apellido_paterno: string | null };
    return ((data ?? []) as unknown as Raw[]).map((o) => ({
      id: o.id,
      codigo: o.codigo ?? '',
      nombre: `${o.nombres ?? ''} ${o.apellido_paterno ?? ''}`.trim(),
    }));
  });
}

// Exponemos las tallas y acciones para uso en el cliente.
export const CALIDAD_TALLAS = TALLAS;
export const CALIDAD_ACCIONES = ACCIONES;
export const CALIDAD_SEVERIDADES = SEVERIDADES;
