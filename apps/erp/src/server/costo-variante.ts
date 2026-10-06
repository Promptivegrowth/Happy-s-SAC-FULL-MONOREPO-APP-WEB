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

import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@happy/db/service';
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

/**
 * Lee todas las filas de una consulta de a 1.000 (el tope de la base).
 *
 * Después de la primera página pide de a cinco en paralelo: cada página es una
 * lectura simple de pocos milisegundos en la base, y lo que demora es el viaje
 * de ida y vuelta.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function todasLasFilas<T>(armar: () => any): Promise<T[]> {
  const pagina = async (n: number): Promise<T[]> => {
    const { data, error } = await armar().range(n * 1000, n * 1000 + 999);
    if (error) throw new Error(error.message);
    return (data ?? []) as T[];
  };
  const out = await pagina(0);
  if (out.length < 1000) return out;
  for (let n = 1; n < 100; n += 5) {
    const tanda = await Promise.all([n, n + 1, n + 2, n + 3, n + 4].map(pagina));
    for (const filas of tanda) out.push(...filas);
    if (tanda.some((filas) => filas.length < 1000)) break;
  }
  return out;
}

/** Datos de una variante para el reporte, junto con su costo. */
export type VarianteValorizada = CostoVariante & {
  sku: string;
  talla: string;
  precio_publico: number;
  producto_nombre: string;
  categoria: string;
};

/*
 * Todo se lee con consultas PLANAS, sin recetas con sus líneas incrustadas.
 *
 * La primera versión (05/10/2026) pedía las recetas con sus líneas y
 * materiales anidados, de a 150 productos: cada tanda tardaba 3,7 s en la
 * base. La página no mostraba nada mientras tanto, el gerente volvió a hacer
 * clic varias veces y cada clic lanzó otro cálculo completo. La base se saturó
 * y se pusieron lentos la web pública y el POS (06/10/2026). Leer las tablas
 * enteras de forma simple y juntar en memoria cuesta una fracción de eso.
 */
export async function calcularTodas(): Promise<Record<string, VarianteValorizada>> {
  const sb = createServiceClient();
  const hoy = new Date().toISOString().slice(0, 10);
  type V = { id: string; producto_id: string; sku: string; talla: string; precio_costo_estandar: number | string | null; precio_publico: number | string | null; productos: { nombre: string; categorias: { codigo: string } | null } | null };
  type R = { id: string; producto_id: string };
  type L = { receta_id: string; talla: string; cantidad: number | string | null; material_id: string | null };
  type M = { id: string; precio_unitario: number | string | null; factor_conversion: number | string | null };
  type P = { producto_id: string; talla: string | null; proceso: string; tiempo_estandar_min: number | string | null; es_tercerizado: boolean | null; area_id: string | null };
  type A = { id: string; valor_minuto: number | string | null };
  type T = TarifaCosto & { vigente_desde: string | null; vigente_hasta: string | null };

  const [vars, recetas, lineasRaw, mats, procs, areas, tars] = await Promise.all([
    todasLasFilas<V>(() => sb.from('productos_variantes')
      .select('id, producto_id, sku, talla, precio_costo_estandar, precio_publico, productos:producto_id(nombre, categorias:categoria_id(codigo))').order('id')),
    todasLasFilas<R>(() => sb.from('recetas').select('id, producto_id').eq('activa', true).order('id')),
    todasLasFilas<L>(() => sb.from('recetas_lineas').select('receta_id, talla, cantidad, material_id').order('id')),
    todasLasFilas<M>(() => sb.from('materiales').select('id, precio_unitario, factor_conversion').order('id')),
    todasLasFilas<P>(() => sb.from('productos_procesos')
      .select('producto_id, talla, proceso, tiempo_estandar_min, es_tercerizado, area_id').eq('activo', true).order('id')),
    todasLasFilas<A>(() => sb.from('areas_produccion').select('id, valor_minuto').order('id')),
    todasLasFilas<T>(() => sb.from('tarifas_servicios')
      .select('producto_id, talla, proceso, precio_unitario, vigente_desde, vigente_hasta').order('id')),
  ]);

  const productoDeReceta = new Map(recetas.map((r) => [r.id, r.producto_id]));
  const mat = new Map(mats.map((m) => [m.id, m]));
  const vm = new Map(areas.map((a) => [a.id, a.valor_minuto]));
  const lineas: LineaReceta[] = [];
  for (const l of lineasRaw) {
    const producto = productoDeReceta.get(l.receta_id);
    if (!producto) continue; // línea de una versión vieja de la receta
    const m = l.material_id ? mat.get(l.material_id) : undefined;
    lineas.push({ producto_id: producto, talla: l.talla, cantidad: l.cantidad, precio_unitario: m?.precio_unitario ?? null, factor_conversion: m?.factor_conversion ?? null });
  }
  const procesos: ProcesoCosto[] = procs.map((p) => ({ ...p, valor_minuto: p.area_id ? vm.get(p.area_id) ?? null : null }));
  // Las tarifas sin fecha de inicio valen desde siempre (ver tarifas-servicios).
  const tarifas = tars.filter((t) => (!t.vigente_desde || t.vigente_desde <= hoy) && (!t.vigente_hasta || t.vigente_hasta >= hoy));

  const costos = calcularCostosVariantes({ variantes: vars, lineas, procesos, tarifas });
  const out: Record<string, VarianteValorizada> = {};
  for (const v of vars) {
    out[v.id] = {
      ...(costos.get(v.id) ?? { costo: 0, materiales: 0, mano_obra: 0, servicios: 0, origen: 'SIN_COSTO' as const }),
      sku: v.sku,
      talla: v.talla,
      precio_publico: Number(v.precio_publico ?? 0),
      producto_nombre: v.productos?.nombre ?? '—',
      categoria: v.productos?.categorias?.codigo ?? '—',
    };
  }
  return out;
}

/**
 * Costo y datos de todas las variantes, guardado 10 minutos.
 *
 * Las recetas y los valores minuto cambian pocas veces al día; recalcular en
 * cada visita (o en cada clic impaciente) no aporta nada y carga la base.
 */
export const costosDeTodasLasVariantes = unstable_cache(calcularTodas, ['costos-variantes-v2'], { revalidate: 600 });
