'use server';

import { z } from 'zod';
import { runAction, requireUser, type ActionResult } from './_helpers';

/**
 * Listado de alertas de stock bajo.
 *
 * Para MATERIALES: usa `materiales.stock_minimo` (definido por material, no
 * por almacén). Suma stock_actual de TODOS los almacenes — si la suma cae
 * bajo el mínimo, alerta. Para distinguir por almacén usar el filtro.
 *
 * Para VARIANTES: el schema actual no tiene stock_minimo configurable
 * (TODO en mig 22). Usamos el umbral default de 5 unidades.
 */

const UMBRAL_VARIANTE_DEFAULT = 5;

const filtrosSchema = z.object({
  almacen_id: z.string().uuid().optional().or(z.literal('')),
  tipo: z.enum(['MATERIAL', 'VARIANTE', '']).optional().or(z.literal('')),
});

export type AlertaStock = {
  tipo: 'MATERIAL' | 'VARIANTE';
  id: string;
  nombre: string;
  codigo: string;
  detalle: string;
  stock_actual: number;
  stock_minimo: number;
  faltante: number;
  unidad: string;
  almacen?: { id: string; codigo: string; nombre: string };
  /** Categoría de material o categoría de producto */
  categoria: string;
  /** Link al kardex */
  href_kardex: string;
};

export async function listarStockBajo(
  input: z.input<typeof filtrosSchema>,
): Promise<ActionResult<{ alertas: AlertaStock[]; total_materiales: number; total_variantes: number }>> {
  return runAction(async () => {
    const data = filtrosSchema.parse(input);
    const { sb } = await requireUser();

    const alertas: AlertaStock[] = [];

    // ── MATERIALES ──
    if (!data.tipo || data.tipo === 'MATERIAL') {
      let q = sb
        .from('materiales')
        .select('id, codigo, nombre, categoria, stock_minimo, unidad_consumo:unidad_consumo_id(codigo)')
        .gt('stock_minimo', 0)
        .eq('activo', true);
      const { data: mats, error } = await q;
      if (error) throw new Error('materiales: ' + error.message);

      // Para cada material, traer stock_actual (sumado por almacén filtrado o todos)
      for (const m of mats ?? []) {
        let stockQ = sb.from('stock_actual').select('cantidad, almacen_id').eq('material_id', m.id);
        if (data.almacen_id) stockQ = stockQ.eq('almacen_id', data.almacen_id);
        const { data: stocks } = await stockQ;
        const stockTotal = (stocks ?? []).reduce((s, r) => s + Number(r.cantidad), 0);
        const minimo = Number(m.stock_minimo);
        if (stockTotal < minimo) {
          alertas.push({
            tipo: 'MATERIAL',
            id: m.id,
            nombre: m.nombre,
            codigo: m.codigo,
            detalle: '',
            stock_actual: stockTotal,
            stock_minimo: minimo,
            faltante: Math.max(0, minimo - stockTotal),
            unidad: (m as unknown as { unidad_consumo?: { codigo: string } | null }).unidad_consumo?.codigo ?? '',
            categoria: String(m.categoria),
            href_kardex: `/kardex/material/${m.id}`,
          });
        }
      }
    }

    // ── VARIANTES ── (umbral fijo por ahora)
    let total_variantes_alert = 0;
    if (!data.tipo || data.tipo === 'VARIANTE') {
      // Traer todas las variantes con stock total
      let stockQ = sb
        .from('stock_actual')
        .select('cantidad, almacen_id, variante_id, almacen:almacen_id(id, codigo, nombre)')
        .not('variante_id', 'is', null);
      if (data.almacen_id) stockQ = stockQ.eq('almacen_id', data.almacen_id);
      const { data: stocks } = await stockQ;

      // Agrupar por variante
      const porVariante = new Map<string, { stock: number; almacen?: { id: string; codigo: string; nombre: string } | null }>();
      for (const s of (stocks ?? []) as { cantidad: number | string; variante_id: string; almacen: { id: string; codigo: string; nombre: string } | null }[]) {
        const cur = porVariante.get(s.variante_id) ?? { stock: 0, almacen: s.almacen };
        cur.stock += Number(s.cantidad);
        porVariante.set(s.variante_id, cur);
      }

      // Filtrar las bajo umbral
      const variantesBajo: string[] = [];
      for (const [vid, info] of porVariante) {
        if (info.stock < UMBRAL_VARIANTE_DEFAULT) variantesBajo.push(vid);
      }
      total_variantes_alert = variantesBajo.length;

      if (variantesBajo.length > 0) {
        // Cargar detalle de las variantes bajo
        // (chunkear para no exceder URL limit)
        const CHUNK = 200;
        for (let i = 0; i < variantesBajo.length; i += CHUNK) {
          const ids = variantesBajo.slice(i, i + CHUNK);
          const { data: vars } = await sb
            .from('productos_variantes')
            .select('id, sku, talla, producto:producto_id(id, codigo, nombre, categoria:categoria_id(codigo, nombre))')
            .in('id', ids)
            .eq('activo', true);
          for (const v of (vars ?? []) as { id: string; sku: string; talla: string; producto: { id: string; codigo: string; nombre: string; categoria: { codigo: string; nombre: string } | null } | null }[]) {
            if (!v.producto) continue;
            const info = porVariante.get(v.id)!;
            alertas.push({
              tipo: 'VARIANTE',
              id: v.id,
              nombre: v.producto.nombre,
              codigo: v.sku,
              detalle: `Talla ${v.talla.replace('T', '')}`,
              stock_actual: info.stock,
              stock_minimo: UMBRAL_VARIANTE_DEFAULT,
              faltante: Math.max(0, UMBRAL_VARIANTE_DEFAULT - info.stock),
              unidad: 'unid',
              almacen: info.almacen ?? undefined,
              categoria: v.producto.categoria?.codigo ?? '—',
              href_kardex: `/kardex/variante/${v.id}`,
            });
          }
        }
      }
    }

    // Ordenar: más críticos primero (mayor faltante relativo)
    alertas.sort((a, b) => {
      const aRel = a.stock_minimo > 0 ? a.faltante / a.stock_minimo : 0;
      const bRel = b.stock_minimo > 0 ? b.faltante / b.stock_minimo : 0;
      return bRel - aRel;
    });

    const total_materiales = alertas.filter((a) => a.tipo === 'MATERIAL').length;
    const total_variantes = alertas.filter((a) => a.tipo === 'VARIANTE').length;

    return { alertas, total_materiales, total_variantes };
  });
}
