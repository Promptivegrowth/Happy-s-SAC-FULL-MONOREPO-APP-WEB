/**
 * Tiempos de producción por OT y OPERACIÓN: estándar de la receta vs real.
 *
 * Hasta el 02/10/2026 el reporte agrupaba por CATEGORÍA del proceso (ACABADO),
 * no por operación: las cuatro operaciones de acabado de una OT salían en una
 * sola fila, con las unidades sumadas cuatro veces (370 → 1.480), el estándar de
 * todas juntas y el estándar por unidad de la última. Y el corte no aparecía,
 * porque sus tiempos no se registran en la OT sino en la liquidación del corte.
 *
 * Ahora hay una fila por operación (DESEMBOLSADO, LIMPIEZA, TENDIDO…):
 *   · Unidades  = las procesadas en esa operación (todas las tallas).
 *   · Estándar  = Σ por talla del estándar de la receta × unidades de esa talla.
 *   · Real      = minutos registrados en la OT; para las operaciones de corte,
 *                 los de la liquidación del corte (tendido, corte, habilitado)
 *                 sobre todas las unidades cortadas.
 */

export type RegTiempo = {
  ot_id: string; proceso_id: string; talla: string | null;
  unidades_procesadas: number | null; tiempo_total_min: number | string | null;
};
export type ProcReceta = {
  id: string; producto_id: string; talla: string | null; proceso: string; descripcion_operativa: string | null;
  orden: number | null; tiempo_estandar_min: number | string | null; es_tercerizado: boolean | null;
  areas_produccion: { codigo: string | null; nombre: string | null } | null;
};
export type LineaOt = { ot_id: string; producto_id: string; talla: string; cantidad_cortada: number | null };
export type CorteTiempo = { ot_id: string; tendido: number; corte: number; habilitado: number };

export type FilaTiempo = {
  ot_id: string; area: string; proceso: string; orden: number; tercerizado: boolean;
  unidades: number; estandar: number; real: number; registros: number;
};

/** Nombre de la operación tal como se lee en la receta. */
export const nombreOperacion = (p: Pick<ProcReceta, 'descripcion_operativa' | 'proceso'>) =>
  (p.descripcion_operativa?.trim() || p.proceso).toUpperCase();

/** A qué parte de la liquidación de corte corresponde una operación del área CORTE. */
export function tipoCorte(p: ProcReceta): 'tendido' | 'corte' | 'habilitado' | null {
  if (p.areas_produccion?.codigo !== 'CORTE') return null;
  const n = nombreOperacion(p);
  if (n.includes('TENDIDO')) return 'tendido';
  if (n.includes('HABILIT')) return 'habilitado';
  if (n.includes('CORTE')) return 'corte';
  return null;
}

export function tiemposPorOperacion(a: {
  regs: RegTiempo[];
  procesos: ProcReceta[];
  lineas: LineaOt[];
  cortes: CorteTiempo[];
}): FilaTiempo[] {
  const procById = new Map(a.procesos.map((p) => [p.id, p]));
  const cortadas = new Map<string, number>(); // ot::producto::talla → cortadas
  const cortadasOt = new Map<string, number>();
  for (const l of a.lineas) {
    const c = Number(l.cantidad_cortada ?? 0);
    cortadas.set(`${l.ot_id}::${l.producto_id}::${l.talla}`, (cortadas.get(`${l.ot_id}::${l.producto_id}::${l.talla}`) ?? 0) + c);
    cortadasOt.set(l.ot_id, (cortadasOt.get(l.ot_id) ?? 0) + c);
  }

  const filas = new Map<string, FilaTiempo>();
  const fila = (ot_id: string, p: ProcReceta | undefined, nombre: string) => {
    const k = `${ot_id}::${nombre}`;
    let f = filas.get(k);
    if (!f) {
      f = {
        ot_id, area: p?.areas_produccion?.nombre ?? '—', proceso: nombre, orden: Number(p?.orden ?? 999),
        tercerizado: Boolean(p?.es_tercerizado), unidades: 0, estandar: 0, real: 0, registros: 0,
      };
      filas.set(k, f);
    }
    return f;
  };

  // Operaciones registradas en la OT.
  for (const r of a.regs) {
    const p = procById.get(r.proceso_id);
    const nombre = p ? nombreOperacion(p) : 'OPERACIÓN ELIMINADA';
    const f = fila(r.ot_id, p, nombre);
    // Sin unidades declaradas, se toma lo cortado de esa talla (todo el lote pasó).
    const und = Number(r.unidades_procesadas ?? 0)
      || (p ? cortadas.get(`${r.ot_id}::${p.producto_id}::${r.talla ?? p.talla}`) ?? 0 : 0);
    f.unidades += und;
    f.estandar += Number(p?.tiempo_estandar_min ?? 0) * und;
    f.real += Number(r.tiempo_total_min ?? 0);
    f.registros += 1;
  }

  // Operaciones de corte, desde la liquidación del corte.
  const cortePorOt = new Map<string, CorteTiempo>();
  for (const c of a.cortes) {
    const t = cortePorOt.get(c.ot_id) ?? { ot_id: c.ot_id, tendido: 0, corte: 0, habilitado: 0 };
    t.tendido += c.tendido; t.corte += c.corte; t.habilitado += c.habilitado;
    cortePorOt.set(c.ot_id, t);
  }
  for (const [otId, t] of cortePorOt) {
    for (const tipo of ['tendido', 'corte', 'habilitado'] as const) {
      if (!(t[tipo] > 0)) continue;
      let f: FilaTiempo | null = null;
      // Estándar: por cada talla cortada, el estándar de su operación de corte.
      for (const l of a.lineas.filter((x) => x.ot_id === otId)) {
        // La de esa talla si la receta la distingue; si no, la general (talla vacía = todas).
        const delProducto = a.procesos.filter((x) => x.producto_id === l.producto_id && tipoCorte(x) === tipo);
        const p = delProducto.find((x) => x.talla === l.talla) ?? delProducto.find((x) => !x.talla);
        f ??= fila(otId, p, p ? nombreOperacion(p) : tipo.toUpperCase());
        f.estandar += Number(p?.tiempo_estandar_min ?? 0) * Number(l.cantidad_cortada ?? 0);
      }
      f ??= fila(otId, undefined, tipo.toUpperCase());
      f.unidades = cortadasOt.get(otId) ?? 0;
      f.real += t[tipo];
      f.registros += 1;
    }
  }

  return [...filas.values()];
}
