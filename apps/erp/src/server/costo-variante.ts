/**
 * Costo unitario de cada variante (producto + talla) para valorizar el stock.
 *
 * El stock valorizado tomaba solo `precio_costo_estandar`, que se escribe a
 * mano y estaba lleno en 14 de 2.582 variantes: el Excel salía con todo en
 * S/ 0.00 salvo la primera fila (reporte del cliente, 05/10/2026). El costo ya
 * está en el sistema, repartido en la receta y los tiempos:
 *
 *   1. Costo escrito a mano en la variante, si lo hay (manda).
 *   2. Si no, el de la receta vigente de esa talla:
 *        materiales  = Σ cantidad × precio por unidad de consumo
 *        mano de obra = Σ tiempo estándar × valor minuto del área
 *                       (operaciones propias; las del taller van por tarifa)
 *        servicios   = tarifas vigentes de taller (de la talla, o la general)
 *   3. Si la receta no tiene esa talla, la talla más cercana, marcada
 *      "estimado" para que se sepa que no es exacto.
 */

import { precioPorUnidadDeConsumo } from '@/server/costo-material';

export type VarianteCosto = { id: string; producto_id: string; talla: string; precio_costo_estandar: number | string | null };
export type LineaReceta = { producto_id: string; talla: string; cantidad: number | string | null; precio_unitario: number | string | null; factor_conversion: number | string | null };
export type ProcesoCosto = { producto_id: string; talla: string | null; proceso: string; tiempo_estandar_min: number | string | null; es_tercerizado: boolean | null; valor_minuto: number | string | null };
export type TarifaCosto = { producto_id: string; talla: string | null; proceso: string; precio_unitario: number | string | null };

export type CostoVariante = {
  costo: number;
  materiales: number;
  mano_obra: number;
  servicios: number;
  origen: 'MANUAL' | 'RECETA' | 'RECETA_ESTIMADA' | 'SIN_COSTO';
  /** Talla de la receta usada cuando no está la de la variante. */
  talla_receta?: string;
};

const NINOS = ['T0', 'T2', 'T4', 'T6', 'T8', 'T10', 'T12', 'T14', 'T16'];
const ADULTOS = ['TS', 'TAD'];

/** La talla de la receta más parecida: misma escala (niños / adultos) y la más cercana. */
export function tallaMasCercana(talla: string, disponibles: string[]): string | null {
  if (disponibles.length === 0) return null;
  const escala = NINOS.includes(talla) ? NINOS : ADULTOS.includes(talla) ? ADULTOS : null;
  if (!escala) return disponibles[0]!; // talla única u otra: la que haya
  const i = escala.indexOf(talla);
  const misma = disponibles.filter((t) => escala.includes(t));
  if (misma.length === 0) return null;
  return misma.sort((a, b) => Math.abs(escala.indexOf(a) - i) - Math.abs(escala.indexOf(b) - i))[0]!;
}

export function calcularCostosVariantes(a: {
  variantes: VarianteCosto[];
  lineas: LineaReceta[];
  procesos: ProcesoCosto[];
  tarifas: TarifaCosto[];
}): Map<string, CostoVariante> {
  // Materiales por producto y talla.
  const mat = new Map<string, Map<string, number>>();
  for (const l of a.lineas) {
    const porTalla = mat.get(l.producto_id) ?? new Map<string, number>();
    const c = Number(l.cantidad ?? 0) * precioPorUnidadDeConsumo(l.precio_unitario, l.factor_conversion);
    porTalla.set(l.talla, (porTalla.get(l.talla) ?? 0) + c);
    mat.set(l.producto_id, porTalla);
  }
  const procPorProducto = new Map<string, ProcesoCosto[]>();
  for (const p of a.procesos) procPorProducto.set(p.producto_id, [...(procPorProducto.get(p.producto_id) ?? []), p]);
  const tarPorProducto = new Map<string, TarifaCosto[]>();
  for (const t of a.tarifas) tarPorProducto.set(t.producto_id, [...(tarPorProducto.get(t.producto_id) ?? []), t]);

  const out = new Map<string, CostoVariante>();
  for (const v of a.variantes) {
    const manual = Number(v.precio_costo_estandar ?? 0);
    if (manual > 0) {
      out.set(v.id, { costo: manual, materiales: 0, mano_obra: 0, servicios: 0, origen: 'MANUAL' });
      continue;
    }
    const porTalla = mat.get(v.producto_id);
    let tallaReceta: string | null = porTalla?.has(v.talla) ? v.talla : null;
    if (!tallaReceta && porTalla) tallaReceta = tallaMasCercana(v.talla, [...porTalla.keys()]);
    if (!tallaReceta) {
      out.set(v.id, { costo: 0, materiales: 0, mano_obra: 0, servicios: 0, origen: 'SIN_COSTO' });
      continue;
    }
    const materiales = porTalla!.get(tallaReceta) ?? 0;

    // Tarifas de taller: por operación, la de la talla o, si no, la general.
    const servicioPorProceso = new Map<string, number>();
    for (const t of tarPorProducto.get(v.producto_id) ?? []) {
      if (t.talla && t.talla !== tallaReceta) continue;
      const exacta = t.talla === tallaReceta;
      if (!servicioPorProceso.has(t.proceso) || exacta) servicioPorProceso.set(t.proceso, Number(t.precio_unitario ?? 0));
    }
    const servicios = [...servicioPorProceso.values()].reduce((s, n) => s + n, 0);

    // Operaciones propias: la de la talla si la receta la distingue; si no, la general.
    const procs = procPorProducto.get(v.producto_id) ?? [];
    const conTalla = procs.filter((p) => p.talla === tallaReceta);
    const usar = conTalla.length > 0 ? conTalla : procs.filter((p) => !p.talla);
    let mano_obra = 0;
    for (const p of usar) {
      if (p.es_tercerizado || servicioPorProceso.has(p.proceso)) continue; // lo cobra el taller
      mano_obra += Number(p.tiempo_estandar_min ?? 0) * Number(p.valor_minuto ?? 0);
    }

    const costo = materiales + mano_obra + servicios;
    out.set(v.id, {
      costo,
      materiales,
      mano_obra,
      servicios,
      origen: costo <= 0 ? 'SIN_COSTO' : tallaReceta === v.talla ? 'RECETA' : 'RECETA_ESTIMADA',
      ...(tallaReceta !== v.talla ? { talla_receta: tallaReceta } : {}),
    });
  }
  return out;
}

/** Lee todas las filas de una consulta de a 1.000 (el tope de la base). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todasLasFilas<T>(armar: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; desde < 100000; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Carga recetas, operaciones y tarifas de esas variantes y calcula su costo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function costosDeVariantes(sb: any, variantes: VarianteCosto[]): Promise<Map<string, CostoVariante>> {
  const productoIds = [...new Set(variantes.map((v) => v.producto_id))];
  const lineas: LineaReceta[] = [];
  const procesos: ProcesoCosto[] = [];
  const tarifas: TarifaCosto[] = [];
  const hoy = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < productoIds.length; i += 150) {
    const ids = productoIds.slice(i, i + 150);
    const [recs, procs, tars] = await Promise.all([
      todasLasFilas<{ producto_id: string; recetas_lineas: { id: string; talla: string; cantidad: number | string | null; materiales: { precio_unitario: number | string | null; factor_conversion: number | string | null } | null }[] }>(
        () => sb.from('recetas')
          .select('producto_id, recetas_lineas(id, talla, cantidad, materiales:material_id(precio_unitario, factor_conversion))')
          .in('producto_id', ids).eq('activa', true).order('id'),
      ),
      todasLasFilas<{ producto_id: string; talla: string | null; proceso: string; tiempo_estandar_min: number | string | null; es_tercerizado: boolean | null; areas_produccion: { valor_minuto: number | string | null } | null }>(
        () => sb.from('productos_procesos')
          .select('producto_id, talla, proceso, tiempo_estandar_min, es_tercerizado, areas_produccion:area_id(valor_minuto)')
          .in('producto_id', ids).eq('activo', true).order('id'),
      ),
      todasLasFilas<{ producto_id: string; talla: string | null; proceso: string; precio_unitario: number | string | null; vigente_hasta: string | null }>(
        () => sb.from('tarifas_servicios')
          .select('producto_id, talla, proceso, precio_unitario, vigente_hasta')
          .in('producto_id', ids)
          // Las tarifas sin fecha de inicio valen desde siempre (ver tarifas-servicios).
          .or(`vigente_desde.is.null,vigente_desde.lte.${hoy}`).order('id'),
      ),
    ]);
    for (const r of recs) {
      for (const l of r.recetas_lineas ?? []) {
        lineas.push({
          producto_id: r.producto_id, talla: l.talla, cantidad: l.cantidad,
          precio_unitario: l.materiales?.precio_unitario ?? null, factor_conversion: l.materiales?.factor_conversion ?? null,
        });
      }
    }
    for (const p of procs) {
      procesos.push({ ...p, valor_minuto: p.areas_produccion?.valor_minuto ?? null });
    }
    for (const t of tars) if (!t.vigente_hasta || t.vigente_hasta >= hoy) tarifas.push(t);
  }
  return calcularCostosVariantes({ variantes, lineas, procesos, tarifas });
}
