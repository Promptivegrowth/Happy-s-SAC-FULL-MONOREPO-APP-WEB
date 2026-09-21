/**
 * Cuánto vale UNA unidad de consumo de un material.
 *
 * Los materiales se compran de una forma y se consumen de otra: los botones se
 * compran por millar o por mazo de 1.728, los cierres por paquete de 120, y la
 * receta los pide de a uno. `materiales.precio_unitario` es el precio de la
 * UNIDAD DE COMPRA, y `factor_conversion` dice cuántas unidades de consumo
 * entran en ella.
 *
 * Usar el precio sin dividir multiplica el costo por el factor: un botón de
 * S/ 0,05 pasa a valer S/ 50, y una prenda con 17 botones sale S/ 850 en
 * materiales. Eso es lo que mostraban tres reportes hasta el 21/09/2026 —lo
 * notó Javier, que había cargado la tabla de conversión y veía que no se
 * estaba usando—, mientras el costeo de recetas sí la aplicaba. Dos números
 * distintos para lo mismo, según qué pantalla se mirara.
 *
 * La regla vivía escrita a mano en cada lugar que la necesitaba, y por eso
 * faltaba en unos y estaba en otros. Ahora vive acá, una sola vez. La vista
 * `v_bom_activo` hace lo mismo del lado de la base.
 *
 * Un factor ausente, cero o inválido se trata como 1: significa que se compra
 * y se consume en la misma unidad, que es el caso de las telas por metro.
 */
export function precioPorUnidadDeConsumo(
  precioUnidadCompra: number | string | null | undefined,
  factorConversion: number | string | null | undefined,
): number {
  const precio = Number(precioUnidadCompra ?? 0);
  if (!Number.isFinite(precio)) return 0;

  const factor = Number(factorConversion ?? 1);
  if (!Number.isFinite(factor) || factor <= 0) return precio;

  return precio / factor;
}
