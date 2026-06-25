'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Módulo de Traslados Multi-Almacén (traslados / traslados_lineas).
 *
 * Flujo de estados:
 *   BORRADOR ─despacharTraslado─▶ DESPACHADO ─recibirTraslado─▶ RECIBIDO
 *      └──anularTraslado──▶ ANULADO   (solo desde BORRADOR)
 *
 * Movimientos kardex generados:
 *   - Despacho:  SALIDA_TRASLADO  (almacen_id=origen,  almacen_contraparte=destino)
 *   - Recepción: ENTRADA_TRASLADO (almacen_id=destino, almacen_contraparte=origen)
 *   referencia_tipo='TRASLADO', referencia_id=traslado.id, referencia_linea_id=linea.id
 *
 * El trigger tg_actualizar_stock se ocupa de stock_actual; no movemos manualmente.
 *
 * Atomicidad: Supabase no expone transacciones cross-request, así que el
 * rollback es manual — si despacharTraslado inserta N movimientos y falla la
 * actualización de estado, borramos los movimientos kardex insertados.
 *
 * Correlativo: usamos next_correlativo('TRASLADO', 6) para 'TRA-NNNNNN'.
 * Convención alineada con recepciones.ts (REC_OC, etc.).
 */

// ---------- Tipos públicos ----------

export type EstadoTraslado = 'BORRADOR' | 'DESPACHADO' | 'RECIBIDO' | 'ANULADO';

export type TrasladoRow = {
  id: string;
  codigo: string;
  fecha_solicitud: string;
  estado: EstadoTraslado;
  almacen_origen: { codigo: string; nombre: string };
  almacen_destino: { codigo: string; nombre: string };
  total_lineas: number;
  total_cantidad: number;
};

export type TrasladoLineaDetalle = {
  id: string;
  tipo: 'VARIANTE' | 'MATERIAL';
  variante_id: string | null;
  material_id: string | null;
  // Display
  codigo: string | null;
  nombre: string;
  detalle: string | null; // ej: "Talla T8"
  cantidad: number;
  cantidad_recibida: number | null;
  diferencia: number | null;
  observacion: string | null;
};

export type TrasladoDetalle = {
  id: string;
  codigo: string;
  estado: EstadoTraslado;
  almacen_origen_id: string;
  almacen_origen_codigo: string;
  almacen_origen_nombre: string;
  almacen_origen_direccion: string | null;
  almacen_destino_id: string;
  almacen_destino_codigo: string;
  almacen_destino_nombre: string;
  almacen_destino_direccion: string | null;
  solicitado_por: string | null;
  despachado_por: string | null;
  recibido_por: string | null;
  fecha_solicitud: string | null;
  fecha_despacho: string | null;
  fecha_recepcion: string | null;
  guia_remision: string | null;
  motivo: string | null;
  observacion: string | null;
};

// ---------- Helpers internos ----------

const ESTADOS = ['BORRADOR', 'DESPACHADO', 'RECIBIDO', 'ANULADO'] as const;

type AlmacenJoin = { id: string; codigo: string; nombre: string } | null;

// ---------- Listar ----------

const listarSchema = z.object({
  almacen: z.string().uuid().optional().or(z.literal('')),
  estado: z.enum(ESTADOS).optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type TrasladosFiltros = z.input<typeof listarSchema>;

type ListarRaw = {
  id: string;
  codigo: string;
  fecha_solicitud: string;
  estado: EstadoTraslado;
  almacen_origen: AlmacenJoin;
  almacen_destino: AlmacenJoin;
  lineas: Array<{ cantidad: string | number }> | null;
};

export async function listarTraslados(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{ rows: TrasladoRow[]; total: number; pagina: number; por_pagina: number }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('traslados')
      .select(
        'id, codigo, fecha_solicitud, estado, ' +
          'almacen_origen:almacen_origen(id, codigo, nombre), ' +
          'almacen_destino:almacen_destino(id, codigo, nombre), ' +
          'lineas:traslados_lineas(cantidad)',
        { count: 'exact' },
      )
      .order('fecha_solicitud', { ascending: false });

    if (data.almacen) {
      // Buscar traslados donde aparezca como origen o destino.
      q = q.or(`almacen_origen.eq.${data.almacen},almacen_destino.eq.${data.almacen}`);
    }
    if (data.estado) q = q.eq('estado', data.estado);
    if (data.desde) q = q.gte('fecha_solicitud', `${data.desde}T00:00:00`);
    if (data.hasta) q = q.lte('fecha_solicitud', `${data.hasta}T23:59:59`);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const mapped: TrasladoRow[] = ((rows ?? []) as unknown as ListarRaw[]).map((r) => {
      const lineas = r.lineas ?? [];
      const totalCantidad = lineas.reduce((s, l) => s + Number(l.cantidad ?? 0), 0);
      return {
        id: r.id,
        codigo: r.codigo,
        fecha_solicitud: r.fecha_solicitud,
        estado: r.estado,
        almacen_origen: {
          codigo: r.almacen_origen?.codigo ?? '—',
          nombre: r.almacen_origen?.nombre ?? '—',
        },
        almacen_destino: {
          codigo: r.almacen_destino?.codigo ?? '—',
          nombre: r.almacen_destino?.nombre ?? '—',
        },
        total_lineas: lineas.length,
        total_cantidad: totalCantidad,
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

// ---------- Obtener detalle ----------

type DetalleRaw = {
  id: string;
  codigo: string;
  estado: EstadoTraslado;
  almacen_origen: string;
  almacen_destino: string;
  almacen_origen_join: AlmacenJoin;
  almacen_destino_join: AlmacenJoin;
  solicitado_por: string | null;
  despachado_por: string | null;
  recibido_por: string | null;
  fecha_solicitud: string | null;
  fecha_despacho: string | null;
  fecha_recepcion: string | null;
  guia_remision: string | null;
  motivo: string | null;
  observacion: string | null;
};

type LineaRaw = {
  id: string;
  variante_id: string | null;
  material_id: string | null;
  cantidad: string | number;
  cantidad_recibida: string | number | null;
  observacion: string | null;
  variante: {
    id: string;
    sku: string;
    talla: string;
    producto: { nombre: string } | null;
  } | null;
  material: { id: string; codigo: string; nombre: string } | null;
};

export async function obtenerTraslado(
  id: string,
): Promise<ActionResult<{ traslado: TrasladoDetalle; lineas: TrasladoLineaDetalle[] }>> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('traslados')
      .select(
        'id, codigo, estado, almacen_origen, almacen_destino, ' +
          'solicitado_por, despachado_por, recibido_por, ' +
          'fecha_solicitud, fecha_despacho, fecha_recepcion, ' +
          'guia_remision, motivo, observacion, ' +
          'almacen_origen_join:almacen_origen(id, codigo, nombre, direccion), ' +
          'almacen_destino_join:almacen_destino(id, codigo, nombre, direccion)',
      )
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!cab) throw new Error('Traslado no encontrado');

    const c = cab as unknown as DetalleRaw;

    const { data: lineas, error: errLin } = await sb
      .from('traslados_lineas')
      .select(
        'id, variante_id, material_id, cantidad, cantidad_recibida, observacion, ' +
          'variante:variante_id(id, sku, talla, producto:producto_id(nombre)), ' +
          'material:material_id(id, codigo, nombre)',
      )
      .eq('traslado_id', id)
      .order('id');
    if (errLin) throw new Error(errLin.message);

    const lineasMapped: TrasladoLineaDetalle[] = ((lineas ?? []) as unknown as LineaRaw[]).map(
      (l) => {
        const cant = Number(l.cantidad ?? 0);
        const recibida = l.cantidad_recibida != null ? Number(l.cantidad_recibida) : null;
        if (l.variante) {
          return {
            id: l.id,
            tipo: 'VARIANTE' as const,
            variante_id: l.variante_id,
            material_id: null,
            codigo: l.variante.sku,
            nombre: l.variante.producto?.nombre ?? '—',
            detalle: `Talla ${l.variante.talla.replace('T', '')}`,
            cantidad: cant,
            cantidad_recibida: recibida,
            diferencia: recibida != null ? recibida - cant : null,
            observacion: l.observacion,
          };
        }
        return {
          id: l.id,
          tipo: 'MATERIAL' as const,
          variante_id: null,
          material_id: l.material_id,
          codigo: l.material?.codigo ?? null,
          nombre: l.material?.nombre ?? '—',
          detalle: null,
          cantidad: cant,
          cantidad_recibida: recibida,
          diferencia: recibida != null ? recibida - cant : null,
          observacion: l.observacion,
        };
      },
    );

    type AlmRaw = { codigo: string; nombre: string; direccion: string | null } | null;
    const origenRaw = c.almacen_origen_join as unknown as AlmRaw;
    const destinoRaw = c.almacen_destino_join as unknown as AlmRaw;
    const traslado: TrasladoDetalle = {
      id: c.id,
      codigo: c.codigo,
      estado: c.estado,
      almacen_origen_id: c.almacen_origen,
      almacen_origen_codigo: origenRaw?.codigo ?? '—',
      almacen_origen_nombre: origenRaw?.nombre ?? '—',
      almacen_origen_direccion: origenRaw?.direccion ?? null,
      almacen_destino_id: c.almacen_destino,
      almacen_destino_codigo: destinoRaw?.codigo ?? '—',
      almacen_destino_nombre: destinoRaw?.nombre ?? '—',
      almacen_destino_direccion: destinoRaw?.direccion ?? null,
      solicitado_por: c.solicitado_por,
      despachado_por: c.despachado_por,
      recibido_por: c.recibido_por,
      fecha_solicitud: c.fecha_solicitud,
      fecha_despacho: c.fecha_despacho,
      fecha_recepcion: c.fecha_recepcion,
      guia_remision: c.guia_remision,
      motivo: c.motivo,
      observacion: c.observacion,
    };

    return { traslado, lineas: lineasMapped };
  });
}

// ---------- Helpers de catálogo (para el formulario nuevo) ----------

export type VarianteItem = {
  id: string;
  sku: string;
  talla: string;
  producto_nombre: string;
  codigo_barras: string | null;
};

export async function listarVariantesParaTraslado(): Promise<ActionResult<VarianteItem[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('productos_variantes')
      .select('id, sku, talla, codigo_barras, producto:producto_id(nombre, activo)')
      .eq('activo', true)
      .order('sku');
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      sku: string;
      talla: string;
      codigo_barras: string | null;
      producto: { nombre: string; activo: boolean } | null;
    };
    return ((data ?? []) as unknown as Row[])
      .filter((v) => v.producto?.activo !== false)
      .map((v) => ({
        id: v.id,
        sku: v.sku,
        talla: v.talla,
        producto_nombre: v.producto?.nombre ?? '—',
        codigo_barras: v.codigo_barras,
      }));
  });
}

export type MaterialItem = {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string | null;
};

export async function listarMaterialesParaTraslado(): Promise<ActionResult<MaterialItem[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();
    const { data, error } = await sb
      .from('materiales')
      .select('id, codigo, nombre, unidad_consumo:unidad_consumo_id(simbolo)')
      .eq('activo', true)
      .order('codigo');
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      codigo: string;
      nombre: string;
      unidad_consumo: { simbolo: string } | null;
    };
    return ((data ?? []) as unknown as Row[]).map((m) => ({
      id: m.id,
      codigo: m.codigo,
      nombre: m.nombre,
      unidad: m.unidad_consumo?.simbolo ?? null,
    }));
  });
}

/** Stock actual (sumado entre lotes) por almacén para variantes/materiales. */
export async function consultarStockEnAlmacen(
  almacenId: string,
  varianteIds: string[],
  materialIds: string[],
): Promise<ActionResult<{ variantes: Record<string, number>; materiales: Record<string, number> }>> {
  return runAction(async () => {
    if (!almacenId) throw new Error('Almacén requerido');
    const { sb } = await requireUser();

    const variantes: Record<string, number> = {};
    const materiales: Record<string, number> = {};

    if (varianteIds.length > 0) {
      const { data, error } = await sb
        .from('stock_actual')
        .select('variante_id, cantidad')
        .eq('almacen_id', almacenId)
        .in('variante_id', varianteIds);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { variante_id: string | null; cantidad: string | number }[]) {
        if (!r.variante_id) continue;
        variantes[r.variante_id] = (variantes[r.variante_id] ?? 0) + Number(r.cantidad ?? 0);
      }
    }

    if (materialIds.length > 0) {
      const { data, error } = await sb
        .from('stock_actual')
        .select('material_id, cantidad')
        .eq('almacen_id', almacenId)
        .in('material_id', materialIds);
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as { material_id: string | null; cantidad: string | number }[]) {
        if (!r.material_id) continue;
        materiales[r.material_id] = (materiales[r.material_id] ?? 0) + Number(r.cantidad ?? 0);
      }
    }

    return { variantes, materiales };
  });
}

// ---------- Crear traslado (BORRADOR) ----------

const lineaInputSchema = z
  .object({
    variante_id: z.string().uuid().optional().or(z.literal('')),
    material_id: z.string().uuid().optional().or(z.literal('')),
    cantidad: z.coerce.number().positive('Cantidad debe ser > 0'),
    observacion: z.string().max(500).optional().or(z.literal('')),
  })
  .refine((l) => !!l.variante_id || !!l.material_id, {
    message: 'Cada línea debe tener variante o material',
  })
  .refine((l) => !(l.variante_id && l.material_id), {
    message: 'Una línea no puede tener variante Y material a la vez',
  });

const crearSchema = z
  .object({
    almacen_origen: z.string().uuid('Almacén origen inválido'),
    almacen_destino: z.string().uuid('Almacén destino inválido'),
    motivo: z.string().max(500).optional().or(z.literal('')),
    observacion: z.string().max(500).optional().or(z.literal('')),
    lineas: z.array(lineaInputSchema).min(1, 'Debe incluir al menos una línea'),
  })
  .refine((d) => d.almacen_origen !== d.almacen_destino, {
    message: 'Origen y destino deben ser distintos',
    path: ['almacen_destino'],
  });

export type CrearTrasladoInput = z.input<typeof crearSchema>;

export async function crearTraslado(
  input: CrearTrasladoInput,
): Promise<ActionResult<{ id: string; codigo: string }>> {
  const r = await runAction(async () => {
    const data = crearSchema.parse(input);
    const { sb, userId } = await requireUser();

    // Validar que ambos almacenes existan y estén activos.
    const { data: alms, error: errAlms } = await sb
      .from('almacenes')
      .select('id, activo')
      .in('id', [data.almacen_origen, data.almacen_destino]);
    if (errAlms) throw new Error(errAlms.message);
    if (!alms || alms.length < 2) throw new Error('Algún almacén no existe');
    for (const a of alms) {
      if (!a.activo) throw new Error('Algún almacén está inactivo');
    }

    // Correlativo TRA-NNNNNN.
    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', {
      p_clave: 'TRASLADO',
      p_padding: 6,
    });
    if (errNro) throw new Error(`No se pudo generar correlativo: ${errNro.message}`);
    const codigo = `TRA-${nro}`;

    const { data: cab, error: errCab } = await sb
      .from('traslados')
      .insert({
        codigo,
        almacen_origen: data.almacen_origen,
        almacen_destino: data.almacen_destino,
        estado: 'BORRADOR',
        solicitado_por: userId,
        motivo: data.motivo?.trim() || null,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errCab) throw new Error(errCab.message);
    const trasladoId = cab.id as string;

    const lineasInsert = data.lineas.map((l) => ({
      traslado_id: trasladoId,
      variante_id: l.variante_id || null,
      material_id: l.material_id || null,
      cantidad: l.cantidad,
      observacion: l.observacion?.trim() || null,
    }));
    const { error: errLin } = await sb.from('traslados_lineas').insert(lineasInsert);
    if (errLin) {
      // Rollback cabecera si fallan líneas.
      await sb.from('traslados').delete().eq('id', trasladoId);
      throw new Error(`No se pudieron insertar líneas: ${errLin.message}`);
    }

    return { id: trasladoId, codigo };
  });

  if (r.ok) await bumpPaths('/traslados');
  return r;
}

// ---------- Agregar / eliminar línea (solo BORRADOR) ----------

const agregarLineaSchema = lineaInputSchema;

export async function agregarLineaTraslado(
  trasladoId: string,
  linea: z.input<typeof agregarLineaSchema>,
): Promise<ActionResult<{ id: string }>> {
  const r = await runAction(async () => {
    if (!trasladoId) throw new Error('Traslado requerido');
    const data = agregarLineaSchema.parse(linea);
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('traslados')
      .select('id, estado')
      .eq('id', trasladoId)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (cab.estado !== 'BORRADOR') {
      throw new Error('Solo se pueden agregar líneas si el traslado está en BORRADOR');
    }

    const { data: inserted, error: errIns } = await sb
      .from('traslados_lineas')
      .insert({
        traslado_id: trasladoId,
        variante_id: data.variante_id || null,
        material_id: data.material_id || null,
        cantidad: data.cantidad,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errIns) throw new Error(errIns.message);

    return { id: inserted.id as string };
  });

  if (r.ok) await bumpPaths('/traslados', `/traslados/${trasladoId}`);
  return r;
}

export async function eliminarLineaTraslado(
  lineaId: string,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!lineaId) throw new Error('Línea requerida');
    const { sb } = await requireUser();

    const { data: linea, error: errLin } = await sb
      .from('traslados_lineas')
      .select('id, traslado_id, traslado:traslado_id(estado)')
      .eq('id', lineaId)
      .single();
    if (errLin) throw new Error(errLin.message);
    const t = linea as unknown as {
      id: string;
      traslado_id: string;
      traslado: { estado: EstadoTraslado } | null;
    };
    if (t.traslado?.estado !== 'BORRADOR') {
      throw new Error('Solo se pueden eliminar líneas si el traslado está en BORRADOR');
    }

    const { error: errDel } = await sb.from('traslados_lineas').delete().eq('id', lineaId);
    if (errDel) throw new Error(errDel.message);

    await bumpPaths(`/traslados/${t.traslado_id}`);
    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/traslados');
  return r;
}

// ---------- Despachar (BORRADOR → DESPACHADO) ----------

type LineaParaDespachar = {
  id: string;
  variante_id: string | null;
  material_id: string | null;
  cantidad: number;
};

export async function despacharTraslado(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb, userId } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('traslados')
      .select('id, codigo, estado, almacen_origen, almacen_destino')
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (cab.estado !== 'BORRADOR') {
      throw new Error(`Solo se puede despachar desde BORRADOR (actual: ${cab.estado})`);
    }

    const { data: lineasRaw, error: errLin } = await sb
      .from('traslados_lineas')
      .select('id, variante_id, material_id, cantidad')
      .eq('traslado_id', id);
    if (errLin) throw new Error(errLin.message);
    const lineas: LineaParaDespachar[] = (lineasRaw ?? []).map((l) => ({
      id: l.id as string,
      variante_id: (l.variante_id as string | null) ?? null,
      material_id: (l.material_id as string | null) ?? null,
      cantidad: Number(l.cantidad),
    }));
    if (lineas.length === 0) throw new Error('El traslado no tiene líneas');

    // Validar stock en almacén origen — sumar TODOS los registros de stock_actual
    // (puede haber varios por lote para materiales).
    const variantesIds = lineas.map((l) => l.variante_id).filter((x): x is string => !!x);
    const materialesIds = lineas.map((l) => l.material_id).filter((x): x is string => !!x);

    const almacenOrigen = cab.almacen_origen as string;
    const almacenDestino = cab.almacen_destino as string;

    const stockVar: Record<string, number> = {};
    if (variantesIds.length > 0) {
      const { data, error } = await sb
        .from('stock_actual')
        .select('variante_id, cantidad')
        .eq('almacen_id', almacenOrigen)
        .in('variante_id', variantesIds);
      if (error) throw new Error(error.message);
      for (const r2 of (data ?? []) as {
        variante_id: string | null;
        cantidad: string | number;
      }[]) {
        if (!r2.variante_id) continue;
        stockVar[r2.variante_id] = (stockVar[r2.variante_id] ?? 0) + Number(r2.cantidad ?? 0);
      }
    }

    const stockMat: Record<string, number> = {};
    if (materialesIds.length > 0) {
      const { data, error } = await sb
        .from('stock_actual')
        .select('material_id, cantidad')
        .eq('almacen_id', almacenOrigen)
        .in('material_id', materialesIds);
      if (error) throw new Error(error.message);
      for (const r2 of (data ?? []) as {
        material_id: string | null;
        cantidad: string | number;
      }[]) {
        if (!r2.material_id) continue;
        stockMat[r2.material_id] = (stockMat[r2.material_id] ?? 0) + Number(r2.cantidad ?? 0);
      }
    }

    const faltantes: string[] = [];
    for (const l of lineas) {
      if (l.variante_id) {
        const s = stockVar[l.variante_id] ?? 0;
        if (s < l.cantidad - 0.0001) {
          faltantes.push(`variante ${l.variante_id}: necesita ${l.cantidad}, disponible ${s}`);
        }
      } else if (l.material_id) {
        const s = stockMat[l.material_id] ?? 0;
        if (s < l.cantidad - 0.0001) {
          faltantes.push(`material ${l.material_id}: necesita ${l.cantidad}, disponible ${s}`);
        }
      }
    }
    if (faltantes.length > 0) {
      throw new Error(`Stock insuficiente en almacén origen — ${faltantes.join('; ')}`);
    }

    // Insertar SALIDA_TRASLADO en kardex. Si falla, intentamos rollback de lo
    // que se haya logrado insertar consultando por referencia.
    const movimientos = lineas.map((l) => ({
      tipo: 'SALIDA_TRASLADO' as const,
      almacen_id: almacenOrigen,
      almacen_contraparte: almacenDestino,
      variante_id: l.variante_id,
      material_id: l.material_id,
      cantidad: l.cantidad,
      referencia_tipo: 'TRASLADO',
      referencia_id: id,
      referencia_linea_id: l.id,
      usuario_id: userId,
      observacion: `Despacho traslado ${cab.codigo}`,
    }));

    const { data: insertados, error: errKar } = await sb
      .from('kardex_movimientos')
      .insert(movimientos)
      .select('id');
    if (errKar) {
      // Rollback de cualquier inserción parcial vía referencia.
      await sb
        .from('kardex_movimientos')
        .delete()
        .eq('referencia_tipo', 'TRASLADO')
        .eq('referencia_id', id)
        .eq('tipo', 'SALIDA_TRASLADO');
      throw new Error(`No se pudo registrar kardex: ${errKar.message}`);
    }

    const { error: errUpd } = await sb
      .from('traslados')
      .update({
        estado: 'DESPACHADO',
        despachado_por: userId,
        fecha_despacho: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'BORRADOR');
    if (errUpd) {
      // Rollback kardex insertados.
      const ids = (insertados ?? []).map((x) => x.id as number);
      if (ids.length > 0) {
        await sb.from('kardex_movimientos').delete().in('id', ids);
      }
      throw new Error(`No se pudo actualizar estado: ${errUpd.message}`);
    }

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/traslados', `/traslados/${id}`, '/kardex', '/inventario');
  }
  return r;
}

// ---------- Recibir (DESPACHADO → RECIBIDO) ----------

const lineaRecibidaSchema = z.object({
  linea_id: z.string().uuid('Línea inválida'),
  cantidad_recibida: z.coerce.number().min(0, 'Cantidad no puede ser negativa'),
});

const recibirSchema = z.object({
  lineas_recibidas: z.array(lineaRecibidaSchema).optional(),
});

export type RecibirTrasladoInput = z.input<typeof recibirSchema>;

export async function recibirTraslado(
  id: string,
  input?: RecibirTrasladoInput,
): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const data = recibirSchema.parse(input ?? {});
    const { sb, userId } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('traslados')
      .select('id, codigo, estado, almacen_origen, almacen_destino')
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (cab.estado !== 'DESPACHADO') {
      throw new Error(`Solo se puede recibir desde DESPACHADO (actual: ${cab.estado})`);
    }

    const { data: lineasRaw, error: errLin } = await sb
      .from('traslados_lineas')
      .select('id, variante_id, material_id, cantidad')
      .eq('traslado_id', id);
    if (errLin) throw new Error(errLin.message);
    if (!lineasRaw || lineasRaw.length === 0) throw new Error('Traslado sin líneas');

    const lineas = lineasRaw.map((l) => ({
      id: l.id as string,
      variante_id: (l.variante_id as string | null) ?? null,
      material_id: (l.material_id as string | null) ?? null,
      cantidad: Number(l.cantidad),
    }));

    // Mapa de cantidades a recibir (default = cantidad despachada).
    const recibidasMap = new Map<string, number>();
    for (const l of lineas) recibidasMap.set(l.id, l.cantidad);
    if (data.lineas_recibidas && data.lineas_recibidas.length > 0) {
      for (const lr of data.lineas_recibidas) {
        if (!recibidasMap.has(lr.linea_id)) {
          throw new Error(`Línea no pertenece al traslado: ${lr.linea_id}`);
        }
        const max = recibidasMap.get(lr.linea_id)!;
        if (lr.cantidad_recibida > max + 0.0001) {
          throw new Error(
            `Cantidad recibida (${lr.cantidad_recibida}) excede lo despachado (${max})`,
          );
        }
        recibidasMap.set(lr.linea_id, lr.cantidad_recibida);
      }
    }

    const almacenOrigen = cab.almacen_origen as string;
    const almacenDestino = cab.almacen_destino as string;

    // Filtrar líneas con cantidad recibida > 0 para insertar kardex.
    const lineasEntrada = lineas
      .map((l) => ({ ...l, recibida: recibidasMap.get(l.id) ?? 0 }))
      .filter((l) => l.recibida > 0);

    let insertadosIds: number[] = [];
    if (lineasEntrada.length > 0) {
      const movimientos = lineasEntrada.map((l) => ({
        tipo: 'ENTRADA_TRASLADO' as const,
        almacen_id: almacenDestino,
        almacen_contraparte: almacenOrigen,
        variante_id: l.variante_id,
        material_id: l.material_id,
        cantidad: l.recibida,
        referencia_tipo: 'TRASLADO',
        referencia_id: id,
        referencia_linea_id: l.id,
        usuario_id: userId,
        observacion: `Recepción traslado ${cab.codigo}`,
      }));
      const { data: insertados, error: errKar } = await sb
        .from('kardex_movimientos')
        .insert(movimientos)
        .select('id');
      if (errKar) {
        await sb
          .from('kardex_movimientos')
          .delete()
          .eq('referencia_tipo', 'TRASLADO')
          .eq('referencia_id', id)
          .eq('tipo', 'ENTRADA_TRASLADO');
        throw new Error(`No se pudo registrar kardex de entrada: ${errKar.message}`);
      }
      insertadosIds = (insertados ?? []).map((x) => x.id as number);
    }

    // Actualizar cantidad_recibida en cada línea.
    for (const l of lineas) {
      const recibida = recibidasMap.get(l.id) ?? 0;
      const { error: errUpdLin } = await sb
        .from('traslados_lineas')
        .update({ cantidad_recibida: recibida })
        .eq('id', l.id);
      if (errUpdLin) {
        if (insertadosIds.length > 0) {
          await sb.from('kardex_movimientos').delete().in('id', insertadosIds);
        }
        throw new Error(`No se pudo actualizar línea recibida: ${errUpdLin.message}`);
      }
    }

    const { error: errUpd } = await sb
      .from('traslados')
      .update({
        estado: 'RECIBIDO',
        recibido_por: userId,
        fecha_recepcion: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'DESPACHADO');
    if (errUpd) {
      if (insertadosIds.length > 0) {
        await sb.from('kardex_movimientos').delete().in('id', insertadosIds);
      }
      // Las cantidad_recibida quedan grabadas pero el estado no avanza —
      // bloqueamos con error claro para que el usuario reintente.
      throw new Error(`No se pudo actualizar estado: ${errUpd.message}`);
    }

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/traslados', `/traslados/${id}`, '/kardex', '/inventario');
  }
  return r;
}

// ---------- Anular (solo BORRADOR) ----------

export async function anularTraslado(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('traslados')
      .select('id, estado')
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (cab.estado !== 'BORRADOR') {
      throw new Error(
        `Solo se puede anular un traslado en BORRADOR. ` +
          `Para revertir un traslado despachado, crea uno inverso.`,
      );
    }

    const { error: errUpd } = await sb
      .from('traslados')
      .update({ estado: 'ANULADO' })
      .eq('id', id)
      .eq('estado', 'BORRADOR');
    if (errUpd) throw new Error(errUpd.message);

    return { ok: true as const };
  });

  if (r.ok) await bumpPaths('/traslados', `/traslados/${id}`);
  return r;
}
