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
 * Para VARIANTES: usa `almacenes.stock_minimo_default` (mig 53) — cada
 * almacén define SU propio umbral. Alerta cuando el stock de la variante
 * en ESE almacén cae bajo el umbral del almacén. Permite mínimos distintos:
 *   - Santa Bárbara: 5
 *   - Tienda La Quinta: 3
 *   - Tienda Huallaga: 1
 *   - Materia Prima / Merma: 0 (no alertan)
 */

const UMBRAL_VARIANTE_FALLBACK = 5;  // si almacen.stock_minimo_default es null

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

    // ── VARIANTES ── (umbral por almacén — mig 53)
    let total_variantes_alert = 0;
    if (!data.tipo || data.tipo === 'VARIANTE') {
      // 1) Cargar umbral por almacén (cast porque stock_minimo_default es de mig 53)
      const { data: almsRaw } = await (sb as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (k: string, v: unknown) => Promise<{ data: Array<{ id: string; codigo: string; nombre: string; stock_minimo_default: number | null }> | null }>;
          };
        };
      })
        .from('almacenes')
        .select('id, codigo, nombre, stock_minimo_default')
        .eq('activo', true);
      const umbralPorAlmacen = new Map<string, { umbral: number; codigo: string; nombre: string }>();
      for (const a of almsRaw ?? []) {
        umbralPorAlmacen.set(a.id, {
          umbral: Number(a.stock_minimo_default ?? UMBRAL_VARIANTE_FALLBACK),
          codigo: a.codigo,
          nombre: a.nombre,
        });
      }

      // 2) Traer stock por (almacen, variante) — NO agrupar por variante.
      //    Cada fila de stock_actual representa el stock real de UNA variante en UN almacén.
      let stockQ = sb
        .from('stock_actual')
        .select('cantidad, almacen_id, variante_id')
        .not('variante_id', 'is', null);
      if (data.almacen_id) stockQ = stockQ.eq('almacen_id', data.almacen_id);
      const { data: stocks } = await stockQ;

      // 3) Filtrar las que están bajo el umbral de SU almacén
      type Comb = { variante_id: string; almacen_id: string; stock: number; umbral: number };
      const bajos: Comb[] = [];
      for (const s of (stocks ?? []) as { cantidad: number | string; variante_id: string; almacen_id: string }[]) {
        const meta = umbralPorAlmacen.get(s.almacen_id);
        if (!meta || meta.umbral <= 0) continue;  // almacén sin umbral configurado = no alerta
        const cant = Number(s.cantidad);
        if (cant < meta.umbral) {
          bajos.push({ variante_id: s.variante_id, almacen_id: s.almacen_id, stock: cant, umbral: meta.umbral });
        }
      }
      total_variantes_alert = bajos.length;

      if (bajos.length > 0) {
        const varianteIdsUnicos = Array.from(new Set(bajos.map((b) => b.variante_id)));
        const CHUNK = 200;
        const varMeta = new Map<string, { sku: string; talla: string; producto_nombre: string; categoria: string }>();
        for (let i = 0; i < varianteIdsUnicos.length; i += CHUNK) {
          const ids = varianteIdsUnicos.slice(i, i + CHUNK);
          const { data: vars } = await sb
            .from('productos_variantes')
            .select('id, sku, talla, producto:producto_id(nombre, categoria:categoria_id(codigo))')
            .in('id', ids)
            .eq('activo', true);
          for (const v of (vars ?? []) as { id: string; sku: string; talla: string; producto: { nombre: string; categoria: { codigo: string } | null } | null }[]) {
            if (!v.producto) continue;
            varMeta.set(v.id, {
              sku: v.sku,
              talla: v.talla,
              producto_nombre: v.producto.nombre,
              categoria: v.producto.categoria?.codigo ?? '—',
            });
          }
        }
        // 4) Emitir una alerta por cada combinación (variante × almacén) bajo
        for (const b of bajos) {
          const v = varMeta.get(b.variante_id);
          const alm = umbralPorAlmacen.get(b.almacen_id);
          if (!v || !alm) continue;
          alertas.push({
            tipo: 'VARIANTE',
            id: `${b.variante_id}|${b.almacen_id}`,  // único por combinación
            nombre: v.producto_nombre,
            codigo: v.sku,
            detalle: `Talla ${v.talla.replace('T', '')}`,
            stock_actual: b.stock,
            stock_minimo: b.umbral,
            faltante: Math.max(0, b.umbral - b.stock),
            unidad: 'unid',
            almacen: { id: b.almacen_id, codigo: alm.codigo, nombre: alm.nombre },
            categoria: v.categoria,
            href_kardex: `/kardex/variante/${b.variante_id}`,
          });
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
