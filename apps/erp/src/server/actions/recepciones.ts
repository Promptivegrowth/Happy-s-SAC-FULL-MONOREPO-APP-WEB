'use server';

import { z } from 'zod';
import { runAction, requireUser, bumpPaths, type ActionResult } from './_helpers';

/**
 * Módulo de Recepciones de Mercadería (oc_recepciones).
 *
 * Una OC puede tener N recepciones parciales. Cada recepción:
 *   1. Inserta cabecera (oc_recepciones) con correlativo REC-NNNNNN.
 *   2. Inserta líneas (oc_recepciones_lineas) — una por cada línea de OC recibida.
 *   3. Genera ENTRADA_COMPRA en kardex_movimientos (el trigger
 *      tg_actualizar_stock mantiene stock_actual sincronizado).
 *   4. Suma lo recibido en oc_lineas.cantidad_recibida.
 *   5. Si todas las líneas quedan recibidas en total → estado OC = RECIBIDA;
 *      si algo se recibió pero queda pendiente → PARCIAL.
 *
 * Anulación: NO borra la recepción. Genera movimientos compensatorios
 * SALIDA_AJUSTE, resta lo recibido en oc_lineas y revierte el estado OC.
 * La recepción queda con observación '(ANULADA)'.
 *
 * Nota: no existe RPC `generar_numero_recepcion()` en el schema actual
 * (REC- está reservado para reclamos en funciones_negocio). Usamos
 * `next_correlativo` con clave 'REC_OC' para no chocar con reclamos.
 */

// ---------- Tipos públicos ----------

export type RecepcionRow = {
  id: string;
  numero: string;
  fecha: string;
  oc_id: string;
  oc_numero: string;
  proveedor: string;
  almacen: string;
  recibido_por_email: string | null;
  total_lineas: number;
  total_cantidad: number;
  anulada: boolean;
};

export type RecepcionLineaDetalle = {
  id: string;
  oc_linea_id: string | null;
  material_id: string | null;
  material_codigo: string | null;
  material_nombre: string;
  cantidad_recibida: number;
  numero_lote: string | null;
  fecha_vencimiento: string | null;
  costo_unitario: number | null;
  subtotal: number;
  observacion: string | null;
  oc_linea_cantidad: number | null;
  oc_linea_precio_unitario: number | null;
};

export type RecepcionDetalle = {
  id: string;
  numero: string;
  fecha: string;
  oc_id: string;
  oc_numero: string;
  proveedor_id: string | null;
  proveedor_razon_social: string;
  almacen_id: string;
  almacen_codigo: string;
  almacen_nombre: string;
  recibido_por: string | null;
  guia_proveedor: string | null;
  factura_proveedor: string | null;
  observacion: string | null;
  anulada: boolean;
  total_general: number;
};

export type OCParaRecepcionar = {
  id: string;
  numero: string;
  fecha: string;
  estado: string;
  proveedor_id: string;
  proveedor: string;
  almacen_destino_id: string | null;
  almacen_destino_codigo: string | null;
  almacen_destino_nombre: string | null;
  lineas: Array<{
    id: string;
    material_id: string | null;
    material_codigo: string | null;
    material_nombre: string;
    cantidad: number;
    cantidad_recibida: number;
    cantidad_pendiente: number;
    precio_unitario: number;
    descripcion_libre: string | null;
  }>;
};

// ---------- Listar recepciones ----------

const listarSchema = z.object({
  oc_id: z.string().uuid().optional().or(z.literal('')),
  almacen_id: z.string().uuid().optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type RecepcionesFiltros = z.input<typeof listarSchema>;

type RecepRaw = {
  id: string;
  numero: string;
  fecha: string;
  observacion: string | null;
  oc: { id: string; numero: string; proveedor: { razon_social: string } | null } | null;
  almacen: { codigo: string; nombre: string } | null;
  lineas: Array<{ cantidad_recibida: string | number }> | null;
};

export async function listarRecepciones(
  input: z.input<typeof listarSchema>,
): Promise<
  ActionResult<{ rows: RecepcionRow[]; total: number; pagina: number; por_pagina: number }>
> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('oc_recepciones')
      .select(
        'id, numero, fecha, observacion, ' +
          'oc:oc_id(id, numero, proveedor:proveedor_id(razon_social)), ' +
          'almacen:almacen_id(codigo, nombre), ' +
          'lineas:oc_recepciones_lineas(cantidad_recibida)',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false });

    if (data.oc_id) q = q.eq('oc_id', data.oc_id);
    if (data.almacen_id) q = q.eq('almacen_id', data.almacen_id);
    if (data.desde) q = q.gte('fecha', `${data.desde}T00:00:00`);
    if (data.hasta) q = q.lte('fecha', `${data.hasta}T23:59:59`);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const mapped: RecepcionRow[] = ((rows ?? []) as unknown as RecepRaw[]).map((r) => {
      const lineas = r.lineas ?? [];
      const totalCantidad = lineas.reduce((s, l) => s + Number(l.cantidad_recibida ?? 0), 0);
      const obs = r.observacion ?? '';
      return {
        id: r.id,
        numero: r.numero,
        fecha: r.fecha,
        oc_id: r.oc?.id ?? '',
        oc_numero: r.oc?.numero ?? '—',
        proveedor: r.oc?.proveedor?.razon_social ?? '—',
        almacen: r.almacen ? `${r.almacen.codigo} — ${r.almacen.nombre}` : '—',
        recibido_por_email: null,
        total_lineas: lineas.length,
        total_cantidad: totalCantidad,
        anulada: obs.includes('(ANULADA)'),
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
  numero: string;
  fecha: string;
  almacen_id: string;
  recibido_por: string | null;
  guia_proveedor: string | null;
  factura_proveedor: string | null;
  observacion: string | null;
  oc: {
    id: string;
    numero: string;
    proveedor_id: string | null;
    proveedor: { razon_social: string } | null;
  } | null;
  almacen: { codigo: string; nombre: string } | null;
};

type LineaRaw = {
  id: string;
  oc_linea_id: string | null;
  material_id: string | null;
  cantidad_recibida: string | number;
  numero_lote: string | null;
  fecha_vencimiento: string | null;
  costo_unitario: string | number | null;
  observacion: string | null;
  material: { codigo: string; nombre: string } | null;
  oc_linea: { cantidad: string | number; precio_unitario: string | number } | null;
};

export async function obtenerRecepcion(
  id: string,
): Promise<ActionResult<{ recepcion: RecepcionDetalle; lineas: RecepcionLineaDetalle[] }>> {
  return runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb } = await requireUser();

    const { data: cab, error: errCab } = await sb
      .from('oc_recepciones')
      .select(
        'id, numero, fecha, almacen_id, recibido_por, guia_proveedor, factura_proveedor, observacion, ' +
          'oc:oc_id(id, numero, proveedor_id, proveedor:proveedor_id(razon_social)), ' +
          'almacen:almacen_id(codigo, nombre)',
      )
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!cab) throw new Error('Recepción no encontrada');

    const c = cab as unknown as DetalleRaw;

    const { data: lineas, error: errLin } = await sb
      .from('oc_recepciones_lineas')
      .select(
        'id, oc_linea_id, material_id, cantidad_recibida, numero_lote, fecha_vencimiento, costo_unitario, observacion, ' +
          'material:material_id(codigo, nombre), ' +
          'oc_linea:oc_linea_id(cantidad, precio_unitario)',
      )
      .eq('recepcion_id', id);
    if (errLin) throw new Error(errLin.message);

    const lineasMapped: RecepcionLineaDetalle[] = ((lineas ?? []) as unknown as LineaRaw[]).map(
      (l) => {
        const cant = Number(l.cantidad_recibida ?? 0);
        const costo = l.costo_unitario != null ? Number(l.costo_unitario) : null;
        return {
          id: l.id,
          oc_linea_id: l.oc_linea_id,
          material_id: l.material_id,
          material_codigo: l.material?.codigo ?? null,
          material_nombre: l.material?.nombre ?? '—',
          cantidad_recibida: cant,
          numero_lote: l.numero_lote,
          fecha_vencimiento: l.fecha_vencimiento,
          costo_unitario: costo,
          subtotal: costo != null ? Math.round(cant * costo * 100) / 100 : 0,
          observacion: l.observacion,
          oc_linea_cantidad: l.oc_linea ? Number(l.oc_linea.cantidad) : null,
          oc_linea_precio_unitario: l.oc_linea ? Number(l.oc_linea.precio_unitario) : null,
        };
      },
    );

    const totalGeneral = lineasMapped.reduce((s, l) => s + l.subtotal, 0);
    const obs = c.observacion ?? '';

    const recepcion: RecepcionDetalle = {
      id: c.id,
      numero: c.numero,
      fecha: c.fecha,
      oc_id: c.oc?.id ?? '',
      oc_numero: c.oc?.numero ?? '—',
      proveedor_id: c.oc?.proveedor_id ?? null,
      proveedor_razon_social: c.oc?.proveedor?.razon_social ?? '—',
      almacen_id: c.almacen_id,
      almacen_codigo: c.almacen?.codigo ?? '—',
      almacen_nombre: c.almacen?.nombre ?? '—',
      recibido_por: c.recibido_por,
      guia_proveedor: c.guia_proveedor,
      factura_proveedor: c.factura_proveedor,
      observacion: c.observacion,
      anulada: obs.includes('(ANULADA)'),
      total_general: Math.round(totalGeneral * 100) / 100,
    };

    return { recepcion, lineas: lineasMapped };
  });
}

// ---------- Listar OCs recepcionables ----------

type OCRaw = {
  id: string;
  numero: string;
  fecha: string;
  estado: string;
  proveedor_id: string;
  almacen_destino: string | null;
  proveedor: { razon_social: string } | null;
  almacen: { codigo: string; nombre: string } | null;
  lineas: Array<{
    id: string;
    material_id: string | null;
    cantidad: string | number;
    cantidad_recibida: string | number | null;
    cantidad_pendiente: string | number | null;
    precio_unitario: string | number;
    descripcion_libre: string | null;
    material: { codigo: string; nombre: string } | null;
  }> | null;
};

export async function listarOCsParaRecepcionar(): Promise<ActionResult<OCParaRecepcionar[]>> {
  return runAction(async () => {
    const { sb } = await requireUser();

    // Estado posibles para recibir: APROBADA, ENVIADA, PARCIAL.
    // BORRADOR no se puede recibir; RECIBIDA/PAGADA/CANCELADA tampoco.
    const { data: rows, error } = await sb
      .from('oc')
      .select(
        'id, numero, fecha, estado, proveedor_id, almacen_destino, ' +
          'proveedor:proveedor_id(razon_social), ' +
          'almacen:almacen_destino(codigo, nombre), ' +
          'lineas:oc_lineas(id, material_id, cantidad, cantidad_recibida, cantidad_pendiente, precio_unitario, descripcion_libre, material:material_id(codigo, nombre))',
      )
      .in('estado', ['APROBADA', 'ENVIADA', 'PARCIAL'])
      .order('fecha', { ascending: false });
    if (error) throw new Error(error.message);

    const mapped: OCParaRecepcionar[] = ((rows ?? []) as unknown as OCRaw[])
      .map((o) => {
        const lineas = (o.lineas ?? [])
          .map((l) => ({
            id: l.id,
            material_id: l.material_id,
            material_codigo: l.material?.codigo ?? null,
            material_nombre: l.material?.nombre ?? l.descripcion_libre ?? '—',
            cantidad: Number(l.cantidad),
            cantidad_recibida: Number(l.cantidad_recibida ?? 0),
            cantidad_pendiente: Number(l.cantidad_pendiente ?? 0),
            precio_unitario: Number(l.precio_unitario),
            descripcion_libre: l.descripcion_libre,
          }))
          .filter((l) => l.cantidad_pendiente > 0 && l.material_id);
        return {
          id: o.id,
          numero: o.numero,
          fecha: o.fecha,
          estado: o.estado,
          proveedor_id: o.proveedor_id,
          proveedor: o.proveedor?.razon_social ?? '—',
          almacen_destino_id: o.almacen_destino,
          almacen_destino_codigo: o.almacen?.codigo ?? null,
          almacen_destino_nombre: o.almacen?.nombre ?? null,
          lineas,
        };
      })
      .filter((o) => o.lineas.length > 0);

    return mapped;
  });
}

// ---------- Crear recepción ----------

const lineaSchema = z.object({
  oc_linea_id: z.string().uuid('Línea inválida'),
  material_id: z.string().uuid('Material inválido'),
  cantidad_recibida: z.coerce.number().positive('Cantidad debe ser > 0'),
  numero_lote: z.string().max(80).optional().or(z.literal('')),
  fecha_vencimiento: z.string().optional().or(z.literal('')),
  costo_unitario: z.coerce.number().min(0).optional(),
  observacion: z.string().max(500).optional().or(z.literal('')),
});

const crearSchema = z.object({
  oc_id: z.string().uuid('OC inválida'),
  almacen_id: z.string().uuid('Almacén inválido'),
  guia_proveedor: z.string().max(80).optional().or(z.literal('')),
  factura_proveedor: z.string().max(80).optional().or(z.literal('')),
  observacion: z.string().max(500).optional().or(z.literal('')),
  lineas: z.array(lineaSchema).min(1, 'Debe incluir al menos una línea'),
});

export type CrearRecepcionInput = z.input<typeof crearSchema>;

export async function crearRecepcionDesdeOC(
  input: CrearRecepcionInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const r = await runAction(async () => {
    const data = crearSchema.parse(input);
    const { sb, userId } = await requireUser();

    // 1) Verificar OC y cargar líneas para validar que no se exceda lo pendiente.
    const { data: oc, error: errOc } = await sb
      .from('oc')
      .select('id, estado, almacen_destino')
      .eq('id', data.oc_id)
      .single();
    if (errOc) throw new Error(errOc.message);
    if (!oc) throw new Error('OC no encontrada');
    if (!['APROBADA', 'ENVIADA', 'PARCIAL'].includes(oc.estado as string)) {
      throw new Error(
        `La OC está en estado ${oc.estado}. Solo se pueden recibir OCs APROBADA, ENVIADA o PARCIAL.`,
      );
    }

    const { data: lineasOc, error: errLin } = await sb
      .from('oc_lineas')
      .select('id, material_id, cantidad, cantidad_recibida, precio_unitario')
      .eq('oc_id', data.oc_id);
    if (errLin) throw new Error(errLin.message);

    const lineasMap = new Map<
      string,
      { material_id: string | null; cantidad: number; recibida: number; precio: number }
    >();
    for (const l of lineasOc ?? []) {
      lineasMap.set(l.id as string, {
        material_id: (l.material_id as string | null) ?? null,
        cantidad: Number(l.cantidad),
        recibida: Number(l.cantidad_recibida ?? 0),
        precio: Number(l.precio_unitario ?? 0),
      });
    }

    // Validación: ninguna línea puede superar lo pendiente, y el material debe coincidir.
    for (const ln of data.lineas) {
      const oclin = lineasMap.get(ln.oc_linea_id);
      if (!oclin) throw new Error(`Línea de OC no encontrada: ${ln.oc_linea_id}`);
      if (oclin.material_id && oclin.material_id !== ln.material_id) {
        throw new Error(`Material de la línea no coincide con la OC`);
      }
      const pendiente = oclin.cantidad - oclin.recibida;
      if (ln.cantidad_recibida > pendiente + 0.0001) {
        throw new Error(
          `Cantidad recibida (${ln.cantidad_recibida}) excede lo pendiente (${pendiente}) en una línea`,
        );
      }
    }

    // 2) Correlativo REC-NNNNNN (clave dedicada para no chocar con reclamos).
    const { data: nro, error: errNro } = await sb.rpc('next_correlativo', {
      p_clave: 'REC_OC',
      p_padding: 6,
    });
    if (errNro) throw new Error(`No se pudo generar número: ${errNro.message}`);
    const numero = `REC-${nro}`;

    // 3) Insertar cabecera.
    const { data: cab, error: errCab } = await sb
      .from('oc_recepciones')
      .insert({
        oc_id: data.oc_id,
        numero,
        almacen_id: data.almacen_id,
        recibido_por: userId,
        guia_proveedor: data.guia_proveedor?.trim() || null,
        factura_proveedor: data.factura_proveedor?.trim() || null,
        observacion: data.observacion?.trim() || null,
      })
      .select('id')
      .single();
    if (errCab) throw new Error(errCab.message);
    const recepcionId = cab.id as string;

    // 4) Insertar líneas.
    const lineasInsert = data.lineas.map((ln) => {
      const oclin = lineasMap.get(ln.oc_linea_id)!;
      const costo = ln.costo_unitario != null ? ln.costo_unitario : oclin.precio;
      return {
        recepcion_id: recepcionId,
        oc_linea_id: ln.oc_linea_id,
        material_id: ln.material_id,
        cantidad_recibida: ln.cantidad_recibida,
        numero_lote: ln.numero_lote?.trim() || null,
        fecha_vencimiento: ln.fecha_vencimiento?.trim() || null,
        costo_unitario: costo,
        observacion: ln.observacion?.trim() || null,
      };
    });
    const { error: errLinIns } = await sb.from('oc_recepciones_lineas').insert(lineasInsert);
    if (errLinIns) {
      // Rollback manual de cabecera si fallan líneas.
      await sb.from('oc_recepciones').delete().eq('id', recepcionId);
      throw new Error(`No se pudieron insertar líneas: ${errLinIns.message}`);
    }

    // 5) Generar movimientos kardex ENTRADA_COMPRA.
    const movimientos = data.lineas.map((ln) => {
      const oclin = lineasMap.get(ln.oc_linea_id)!;
      const costo = ln.costo_unitario != null ? ln.costo_unitario : oclin.precio;
      const total = Math.round(ln.cantidad_recibida * costo * 10000) / 10000;
      return {
        tipo: 'ENTRADA_COMPRA' as const,
        almacen_id: data.almacen_id,
        material_id: ln.material_id,
        cantidad: ln.cantidad_recibida,
        costo_unitario: costo,
        costo_total: total,
        referencia_tipo: 'OC',
        referencia_id: data.oc_id,
        referencia_linea_id: ln.oc_linea_id,
        usuario_id: userId,
        observacion: `Recepción ${numero}`,
      };
    });
    const { error: errKar } = await sb.from('kardex_movimientos').insert(movimientos);
    if (errKar) {
      // Rollback: borrar líneas y cabecera.
      await sb.from('oc_recepciones_lineas').delete().eq('recepcion_id', recepcionId);
      await sb.from('oc_recepciones').delete().eq('id', recepcionId);
      throw new Error(`No se pudo registrar kardex: ${errKar.message}`);
    }

    // 6) Actualizar oc_lineas.cantidad_recibida (suma).
    for (const ln of data.lineas) {
      const oclin = lineasMap.get(ln.oc_linea_id)!;
      const nuevaRecibida = oclin.recibida + ln.cantidad_recibida;
      const { error: errUpd } = await sb
        .from('oc_lineas')
        .update({ cantidad_recibida: nuevaRecibida })
        .eq('id', ln.oc_linea_id);
      if (errUpd) throw new Error(`No se pudo actualizar línea OC: ${errUpd.message}`);
      // Mantener mapa sincronizado por si se evalúa al final.
      oclin.recibida = nuevaRecibida;
    }

    // 7) Recalcular estado de la OC.
    const todasCompletas = Array.from(lineasMap.values()).every(
      (l) => l.recibida >= l.cantidad - 0.0001,
    );
    const algoRecibido = Array.from(lineasMap.values()).some((l) => l.recibida > 0);
    let nuevoEstado: 'RECIBIDA' | 'PARCIAL' | null = null;
    if (todasCompletas) nuevoEstado = 'RECIBIDA';
    else if (algoRecibido) nuevoEstado = 'PARCIAL';
    if (nuevoEstado && nuevoEstado !== oc.estado) {
      await sb.from('oc').update({ estado: nuevoEstado }).eq('id', data.oc_id);
    }

    return { id: recepcionId, numero };
  });

  if (r.ok) {
    await bumpPaths('/recepciones', '/oc', '/kardex', '/inventario');
  }
  return r;
}

// ---------- Anular recepción ----------

export async function anularRecepcion(id: string): Promise<ActionResult<{ ok: true }>> {
  const r = await runAction(async () => {
    if (!id) throw new Error('Id requerido');
    const { sb, userId } = await requireUser();

    // 1) Cargar recepción + líneas.
    const { data: cab, error: errCab } = await sb
      .from('oc_recepciones')
      .select('id, numero, oc_id, almacen_id, observacion')
      .eq('id', id)
      .single();
    if (errCab) throw new Error(errCab.message);
    if (!cab) throw new Error('Recepción no encontrada');

    const obs = (cab.observacion as string | null) ?? '';
    if (obs.includes('(ANULADA)')) {
      throw new Error('La recepción ya está anulada');
    }

    const { data: lineas, error: errLin } = await sb
      .from('oc_recepciones_lineas')
      .select('id, oc_linea_id, material_id, cantidad_recibida, costo_unitario')
      .eq('recepcion_id', id);
    if (errLin) throw new Error(errLin.message);
    if (!lineas || lineas.length === 0) throw new Error('Recepción sin líneas');

    // 2) Generar movimientos compensatorios SALIDA_AJUSTE.
    const movimientos = lineas.map((l) => {
      const cant = Number(l.cantidad_recibida ?? 0);
      const costo = l.costo_unitario != null ? Number(l.costo_unitario) : null;
      return {
        tipo: 'SALIDA_AJUSTE' as const,
        almacen_id: cab.almacen_id as string,
        material_id: l.material_id as string | null,
        cantidad: cant,
        costo_unitario: costo,
        costo_total: costo != null ? Math.round(cant * costo * 10000) / 10000 : null,
        referencia_tipo: 'OC',
        referencia_id: cab.oc_id as string,
        referencia_linea_id: l.oc_linea_id as string | null,
        usuario_id: userId,
        observacion: `Anulación recepción ${cab.numero}`,
      };
    });
    const { error: errKar } = await sb.from('kardex_movimientos').insert(movimientos);
    if (errKar) throw new Error(`No se pudo registrar reversa kardex: ${errKar.message}`);

    // 3) Restar lo recibido en oc_lineas y recalcular estado OC.
    const ocLineaIds = lineas
      .map((l) => l.oc_linea_id as string | null)
      .filter((x): x is string => !!x);
    const { data: ocLineas } = await sb
      .from('oc_lineas')
      .select('id, cantidad, cantidad_recibida')
      .in('id', ocLineaIds);

    const lineasOcMap = new Map<string, { cantidad: number; recibida: number }>();
    for (const ol of ocLineas ?? []) {
      lineasOcMap.set(ol.id as string, {
        cantidad: Number(ol.cantidad),
        recibida: Number(ol.cantidad_recibida ?? 0),
      });
    }

    for (const l of lineas) {
      const oclid = l.oc_linea_id as string | null;
      if (!oclid) continue;
      const cur = lineasOcMap.get(oclid);
      if (!cur) continue;
      const nuevaRecibida = Math.max(0, cur.recibida - Number(l.cantidad_recibida ?? 0));
      await sb.from('oc_lineas').update({ cantidad_recibida: nuevaRecibida }).eq('id', oclid);
      cur.recibida = nuevaRecibida;
    }

    // Recalcular estado OC considerando TODAS las líneas (no solo las afectadas).
    const { data: todasLineas } = await sb
      .from('oc_lineas')
      .select('cantidad, cantidad_recibida')
      .eq('oc_id', cab.oc_id as string);

    const algoRecibido = (todasLineas ?? []).some((l) => Number(l.cantidad_recibida ?? 0) > 0);
    const todasCompletas =
      (todasLineas ?? []).length > 0 &&
      (todasLineas ?? []).every(
        (l) => Number(l.cantidad_recibida ?? 0) >= Number(l.cantidad) - 0.0001,
      );
    const nuevoEstado: 'RECIBIDA' | 'PARCIAL' | 'APROBADA' = todasCompletas
      ? 'RECIBIDA'
      : algoRecibido
        ? 'PARCIAL'
        : 'APROBADA';
    await sb.from('oc').update({ estado: nuevoEstado }).eq('id', cab.oc_id as string);

    // 4) Marcar recepción como anulada (no se borra).
    const nuevaObs = obs ? `${obs} · (ANULADA)` : '(ANULADA)';
    await sb.from('oc_recepciones').update({ observacion: nuevaObs }).eq('id', id);

    return { ok: true as const };
  });

  if (r.ok) {
    await bumpPaths('/recepciones', `/recepciones/${id}`, '/oc', '/kardex', '/inventario');
  }
  return r;
}
