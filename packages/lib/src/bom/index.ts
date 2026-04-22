/**
 * Explosión de materiales (BOM) y costeo.
 *
 * Reglas del cliente:
 * - La receta base es la misma por modelo; varía el consumo por talla.
 * - Algunos avios se quedan en almacén y otros se envían al servicio externo
 *   (columna `si_sale_a_servicio`).
 * - Se soporta kits (ej: disfraz = pantalón + chaqueta + zapato + gorro).
 * - Versionado de ficha técnica (v1.0, v1.1...).
 */

export type BomLinea = {
  materialId: string;
  materialCodigo: string;
  descripcion: string;
  categoria: 'TELA' | 'AVIO' | 'INSUMO' | 'EMPAQUE';
  cantidad: number;
  unidad: string;
  saleAServicio: boolean;     // true → se manda junto con el corte al taller externo
  cantidadAlmacen: number;    // cuánto se queda en almacén (resto va al taller)
  costoUnitario?: number;     // opcional, para pre-calcular
};

export type BomProducto = {
  productoId: string;
  productoCodigo: string;
  talla: string;
  version: string;
  lineas: BomLinea[];
};

export type PlanItem = { productoId: string; talla: string; cantidad: number };

/**
 * Dada una lista de OTs (producto + talla + cantidad) y sus BOMs,
 * consolida los materiales totales a comprar/usar.
 */
export function explosionMateriales(
  plan: PlanItem[],
  bomsPorProductoTalla: Map<string, BomProducto>, // key: `${productoId}|${talla}`
): Map<string, { materialId: string; totalCantidad: number; unidad: string; descripcion: string; categoria: string; }> {
  const acc = new Map<string, { materialId: string; totalCantidad: number; unidad: string; descripcion: string; categoria: string }>();

  for (const item of plan) {
    const key = `${item.productoId}|${item.talla}`;
    const bom = bomsPorProductoTalla.get(key);
    if (!bom) continue;
    for (const l of bom.lineas) {
      const total = l.cantidad * item.cantidad;
      const existente = acc.get(l.materialId);
      if (existente) {
        existente.totalCantidad += total;
      } else {
        acc.set(l.materialId, {
          materialId: l.materialId,
          totalCantidad: total,
          unidad: l.unidad,
          descripcion: l.descripcion,
          categoria: l.categoria,
        });
      }
    }
  }
  return acc;
}

/** Costeo estándar (sin incluir indirectos). */
export type CostoDesglose = {
  materiales: number;
  confeccion: number;
  serviciosExternos: number;
  decorado: number;
  estampado: number;
  bordado: number;
  empaque: number;
  otros: number;
  total: number;
};

export function calcularCostoProducto(input: {
  bom: BomProducto;
  costosMateriales: Map<string, number>;      // materialId → costo por unidad
  costoConfeccionPorTalla?: number;           // costo taller confección por prenda
  costoDecorado?: number;
  costoEstampado?: number;
  costoBordado?: number;
  costoEmpaque?: number;
  otros?: number;
}): CostoDesglose {
  let materiales = 0;
  for (const l of input.bom.lineas) {
    const c = input.costosMateriales.get(l.materialId) ?? l.costoUnitario ?? 0;
    materiales += c * l.cantidad;
  }
  const confeccion = input.costoConfeccionPorTalla ?? 0;
  const decorado = input.costoDecorado ?? 0;
  const estampado = input.costoEstampado ?? 0;
  const bordado = input.costoBordado ?? 0;
  const empaque = input.costoEmpaque ?? 0;
  const otros = input.otros ?? 0;
  const serviciosExternos = confeccion + decorado + estampado + bordado;

  const total = materiales + serviciosExternos + empaque + otros;
  return {
    materiales,
    confeccion,
    serviciosExternos,
    decorado,
    estampado,
    bordado,
    empaque,
    otros,
    total,
  };
}

/** Factor de campaña (ej: Halloween pagan +10% a talleres por movilidad). */
export function aplicarFactorCampana(costoBase: number, factor = 1): number {
  return costoBase * factor;
}
