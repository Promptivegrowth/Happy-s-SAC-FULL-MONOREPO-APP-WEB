'use server';

/**
 * Consulta el stock de una variante en TODOS los almacenes activos.
 * Útil para que el cajero vea desde el POS cuánto stock hay en otras tiendas
 * o bodegas (no solo el almacén actual).
 */

import { createClient } from '@happy/db/server';

export type StockPorAlmacenItem = {
  almacen_id: string;
  almacen_codigo: string;
  almacen_nombre: string;
  almacen_tipo: string;
  cantidad: number;
  es_actual: boolean; // si es el almacén de la caja activa
};

export async function obtenerStockPorAlmacen(varianteId: string): Promise<{
  variante: {
    sku: string;
    talla: string;
    producto_nombre: string;
    producto_codigo: string | null;
  } | null;
  almacenes: StockPorAlmacenItem[];
  total: number;
}> {
  if (!varianteId) return { variante: null, almacenes: [], total: 0 };
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { variante: null, almacenes: [], total: 0 };

  // 1. Datos de la variante
  const { data: vRaw } = await sb
    .from('productos_variantes')
    .select('sku, talla, productos:producto_id(nombre, codigo)')
    .eq('id', varianteId)
    .maybeSingle();
  type VRow = { sku: string; talla: string; productos: { nombre: string; codigo: string | null } | null };
  const v = vRaw as unknown as VRow | null;
  if (!v) return { variante: null, almacenes: [], total: 0 };

  // 2. Almacén actual (de la sesión POS activa del usuario)
  let almacenActualId: string | null = null;
  try {
    const { data: sesion } = await sb
      .from('cajas_sesiones')
      .select('caja_id')
      .is('cerrada_en', null)
      .eq('abierta_por', user.id)
      .maybeSingle();
    const cajaId = (sesion as { caja_id: string } | null)?.caja_id;
    if (cajaId) {
      const { data: caja } = await sb
        .from('cajas')
        .select('almacen_id')
        .eq('id', cajaId)
        .maybeSingle();
      almacenActualId = (caja as { almacen_id: string } | null)?.almacen_id ?? null;
    }
  } catch {
    /* ignore */
  }

  // 3. Todos los almacenes activos (para mostrar incluso los que tienen stock=0)
  const { data: almacenes } = await sb
    .from('almacenes')
    .select('id, codigo, nombre, tipo')
    .eq('activo', true)
    .order('nombre');

  // 4. Stock de la variante en cada almacén
  const { data: stocks } = await sb
    .from('stock_actual')
    .select('almacen_id, cantidad')
    .eq('variante_id', varianteId);

  type ARow = { id: string; codigo: string; nombre: string; tipo: string };
  type SRow = { almacen_id: string; cantidad: number | string };

  const stockMap = new Map<string, number>();
  for (const s of (stocks ?? []) as SRow[]) {
    stockMap.set(s.almacen_id, Number(s.cantidad));
  }

  const items: StockPorAlmacenItem[] = ((almacenes ?? []) as ARow[]).map((a) => ({
    almacen_id: a.id,
    almacen_codigo: a.codigo,
    almacen_nombre: a.nombre,
    almacen_tipo: a.tipo,
    cantidad: stockMap.get(a.id) ?? 0,
    es_actual: a.id === almacenActualId,
  }));

  const total = items.reduce((s, i) => s + i.cantidad, 0);

  return {
    variante: {
      sku: v.sku,
      talla: v.talla,
      producto_nombre: v.productos?.nombre ?? '',
      producto_codigo: v.productos?.codigo ?? null,
    },
    almacenes: items,
    total,
  };
}
