'use server';

import { z } from 'zod';
import { runAction, requireUser, type ActionResult } from './_helpers';

/**
 * Read-only queries para la pantalla de Kardex.
 *
 * El registro de movimientos (entradas/salidas) lo hacen otros módulos vía
 * inserts directos a `kardex_movimientos` (OT, OC, recepciones, traslados,
 * ajustes). Este archivo solo expone filtros y agregaciones para visualizar.
 */

const TIPOS_MOVIMIENTO = [
  'ENTRADA_COMPRA','ENTRADA_PRODUCCION','ENTRADA_DEVOLUCION_CLIENTE',
  'ENTRADA_DEVOLUCION_TALLER','ENTRADA_TRASLADO','ENTRADA_AJUSTE',
  'SALIDA_VENTA','SALIDA_PRODUCCION','SALIDA_TRASLADO','SALIDA_TALLER_SERVICIO',
  'SALIDA_AJUSTE','SALIDA_MERMA',
] as const;
type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

const listarSchema = z.object({
  almacen_id: z.string().uuid().optional().or(z.literal('')),
  tipo: z.enum(TIPOS_MOVIMIENTO).optional().or(z.literal('')),
  entidad: z.enum(['VARIANTE', 'MATERIAL', '']).optional().or(z.literal('')),
  variante_id: z.string().uuid().optional().or(z.literal('')),
  material_id: z.string().uuid().optional().or(z.literal('')),
  desde: z.string().optional().or(z.literal('')),
  hasta: z.string().optional().or(z.literal('')),
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(10).max(200).default(50),
});

export type KardexFiltros = z.input<typeof listarSchema>;

export type KardexMov = {
  id: number;
  fecha: string;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_unitario: number | null;
  costo_total: number | null;
  almacen: { id: string; codigo: string; nombre: string } | null;
  almacen_contraparte: { id: string; codigo: string; nombre: string } | null;
  variante: { id: string; sku: string; talla: string; producto_nombre: string } | null;
  material: { id: string; codigo: string; nombre: string } | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  usuario_email: string | null;
  observacion: string | null;
};

/** Lista paginada de movimientos kardex con filtros. */
export async function listarKardex(
  input: z.input<typeof listarSchema>,
): Promise<ActionResult<{ rows: KardexMov[]; total: number; pagina: number; por_pagina: number }>> {
  return runAction(async () => {
    const data = listarSchema.parse(input);
    const { sb } = await requireUser();

    let q = sb
      .from('kardex_movimientos')
      .select(
        'id, fecha, tipo, cantidad, costo_unitario, costo_total, referencia_tipo, referencia_id, observacion, ' +
          'almacen:almacen_id(id, codigo, nombre), ' +
          'almacen_contraparte:almacen_contraparte(id, codigo, nombre), ' +
          'variante:variante_id(id, sku, talla, producto:producto_id(nombre)), ' +
          'material:material_id(id, codigo, nombre)',
        { count: 'exact' },
      )
      .order('fecha', { ascending: false })
      .order('id', { ascending: false });

    if (data.almacen_id) q = q.eq('almacen_id', data.almacen_id);
    if (data.tipo) q = q.eq('tipo', data.tipo);
    if (data.variante_id) q = q.eq('variante_id', data.variante_id);
    if (data.material_id) q = q.eq('material_id', data.material_id);
    if (data.entidad === 'VARIANTE') q = q.not('variante_id', 'is', null);
    if (data.entidad === 'MATERIAL') q = q.not('material_id', 'is', null);
    if (data.desde) q = q.gte('fecha', `${data.desde}T00:00:00`);
    if (data.hasta) q = q.lte('fecha', `${data.hasta}T23:59:59`);

    const offset = (data.pagina - 1) * data.por_pagina;
    q = q.range(offset, offset + data.por_pagina - 1);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    const mapped: KardexMov[] = ((rows ?? []) as unknown as MovRaw[]).map((r) => ({
      id: r.id,
      fecha: r.fecha,
      tipo: r.tipo,
      cantidad: Number(r.cantidad),
      costo_unitario: r.costo_unitario != null ? Number(r.costo_unitario) : null,
      costo_total: r.costo_total != null ? Number(r.costo_total) : null,
      almacen: r.almacen ?? null,
      almacen_contraparte: r.almacen_contraparte ?? null,
      variante: r.variante
        ? {
            id: r.variante.id,
            sku: r.variante.sku,
            talla: r.variante.talla,
            producto_nombre: r.variante.producto?.nombre ?? '—',
          }
        : null,
      material: r.material ?? null,
      referencia_tipo: r.referencia_tipo,
      referencia_id: r.referencia_id,
      usuario_email: null,
      observacion: r.observacion,
    }));

    return {
      rows: mapped,
      total: Number(count ?? 0),
      pagina: data.pagina,
      por_pagina: data.por_pagina,
    };
  });
}

type MovRaw = {
  id: number;
  fecha: string;
  tipo: TipoMovimiento;
  cantidad: string | number;
  costo_unitario: string | number | null;
  costo_total: string | number | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  observacion: string | null;
  almacen: { id: string; codigo: string; nombre: string } | null;
  almacen_contraparte: { id: string; codigo: string; nombre: string } | null;
  variante:
    | { id: string; sku: string; talla: string; producto: { nombre: string } | null }
    | null;
  material: { id: string; codigo: string; nombre: string } | null;
};

/**
 * Histórico de movimientos de una variante con saldo acumulado.
 * El saldo se calcula sobre la marcha sumando/restando según el tipo.
 */
export async function historicoVariante(
  varianteId: string,
  almacenId?: string,
): Promise<ActionResult<{ movimientos: (KardexMov & { saldo: number })[]; stock_actual: number }>> {
  return runAction(async () => {
    if (!varianteId) throw new Error('Variante requerida');
    const { sb } = await requireUser();

    let q = sb
      .from('kardex_movimientos')
      .select(
        'id, fecha, tipo, cantidad, costo_unitario, costo_total, referencia_tipo, referencia_id, observacion, ' +
          'almacen:almacen_id(id, codigo, nombre), ' +
          'almacen_contraparte:almacen_contraparte(id, codigo, nombre), ' +
          'variante:variante_id(id, sku, talla, producto:producto_id(nombre)), ' +
          'material:material_id(id, codigo, nombre)',
      )
      .eq('variante_id', varianteId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });
    if (almacenId) q = q.eq('almacen_id', almacenId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let saldo = 0;
    const movimientos = ((rows ?? []) as unknown as MovRaw[]).map((r) => {
      const cant = Number(r.cantidad);
      const signo = r.tipo.startsWith('ENTRADA_') ? 1 : r.tipo.startsWith('SALIDA_') ? -1 : 0;
      saldo += cant * signo;
      return {
        id: r.id,
        fecha: r.fecha,
        tipo: r.tipo,
        cantidad: cant,
        costo_unitario: r.costo_unitario != null ? Number(r.costo_unitario) : null,
        costo_total: r.costo_total != null ? Number(r.costo_total) : null,
        almacen: r.almacen ?? null,
        almacen_contraparte: r.almacen_contraparte ?? null,
        variante: r.variante
          ? {
              id: r.variante.id,
              sku: r.variante.sku,
              talla: r.variante.talla,
              producto_nombre: r.variante.producto?.nombre ?? '—',
            }
          : null,
        material: r.material ?? null,
        referencia_tipo: r.referencia_tipo,
        referencia_id: r.referencia_id,
        usuario_email: null,
        observacion: r.observacion,
        saldo,
      };
    });

    // Stock actual (puede diferir si hay movimientos en otros almacenes)
    let stock = 0;
    if (almacenId) {
      const { data } = await sb
        .from('stock_actual')
        .select('cantidad')
        .eq('variante_id', varianteId)
        .eq('almacen_id', almacenId)
        .maybeSingle();
      stock = Number(data?.cantidad ?? 0);
    } else {
      const { data } = await sb
        .from('stock_actual')
        .select('cantidad')
        .eq('variante_id', varianteId);
      stock = (data ?? []).reduce((s, r) => s + Number(r.cantidad), 0);
    }

    return { movimientos, stock_actual: stock };
  });
}

/** Histórico de movimientos de un material. */
export async function historicoMaterial(
  materialId: string,
  almacenId?: string,
): Promise<ActionResult<{ movimientos: (KardexMov & { saldo: number })[]; stock_actual: number }>> {
  return runAction(async () => {
    if (!materialId) throw new Error('Material requerido');
    const { sb } = await requireUser();

    let q = sb
      .from('kardex_movimientos')
      .select(
        'id, fecha, tipo, cantidad, costo_unitario, costo_total, referencia_tipo, referencia_id, observacion, ' +
          'almacen:almacen_id(id, codigo, nombre), ' +
          'almacen_contraparte:almacen_contraparte(id, codigo, nombre), ' +
          'variante:variante_id(id, sku, talla, producto:producto_id(nombre)), ' +
          'material:material_id(id, codigo, nombre)',
      )
      .eq('material_id', materialId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });
    if (almacenId) q = q.eq('almacen_id', almacenId);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let saldo = 0;
    const movimientos = ((rows ?? []) as unknown as MovRaw[]).map((r) => {
      const cant = Number(r.cantidad);
      const signo = r.tipo.startsWith('ENTRADA_') ? 1 : r.tipo.startsWith('SALIDA_') ? -1 : 0;
      saldo += cant * signo;
      return {
        id: r.id,
        fecha: r.fecha,
        tipo: r.tipo,
        cantidad: cant,
        costo_unitario: r.costo_unitario != null ? Number(r.costo_unitario) : null,
        costo_total: r.costo_total != null ? Number(r.costo_total) : null,
        almacen: r.almacen ?? null,
        almacen_contraparte: r.almacen_contraparte ?? null,
        variante: r.variante
          ? {
              id: r.variante.id,
              sku: r.variante.sku,
              talla: r.variante.talla,
              producto_nombre: r.variante.producto?.nombre ?? '—',
            }
          : null,
        material: r.material ?? null,
        referencia_tipo: r.referencia_tipo,
        referencia_id: r.referencia_id,
        usuario_email: null,
        observacion: r.observacion,
        saldo,
      };
    });

    let stock = 0;
    if (almacenId) {
      const { data } = await sb
        .from('stock_actual')
        .select('cantidad')
        .eq('material_id', materialId)
        .eq('almacen_id', almacenId);
      stock = (data ?? []).reduce((s, r) => s + Number(r.cantidad), 0);
    } else {
      const { data } = await sb
        .from('stock_actual')
        .select('cantidad')
        .eq('material_id', materialId);
      stock = (data ?? []).reduce((s, r) => s + Number(r.cantidad), 0);
    }

    return { movimientos, stock_actual: stock };
  });
}

/** Lista de almacenes (helper para selectores). Excluye almacenes ocultos
 * (ej. ALM-MR que el cliente no usa operativamente — migración 52). */
export async function listarAlmacenes(): Promise<
  ActionResult<{ id: string; codigo: string; nombre: string }[]>
> {
  return runAction(async () => {
    const { sb } = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data, error } = await sbAny
      .from('almacenes')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .eq('oculto_en_selectores', false)
      .order('codigo');
    if (error) throw new Error(error.message);
    return data ?? [];
  });
}
