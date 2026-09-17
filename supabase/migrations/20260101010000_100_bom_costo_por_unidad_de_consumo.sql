-- ===========================================================================
-- 100 — El costo de receta se valoriza en la unidad en que se consume
-- ===========================================================================
--
-- La vista del BOM calculaba el costo de cada línea como
--
--     cantidad × materiales.precio_unitario
--
-- y esas dos cifras no hablan el mismo idioma: la cantidad de la receta está
-- en unidad de CONSUMO y el precio es por unidad de COMPRA.
--
-- Mientras las dos coinciden —tela que se compra y se consume por metro— la
-- cuenta sale bien por casualidad. Cuando no:
--
--     HILO LUREX BORDADO DORADO
--       se compra por ROLLO a S/ 20,00
--       un rollo trae 5 000 m  (factor_conversion)
--       la receta pide metros
--
--     cuenta vieja:  1 m × S/ 20,00       = S/ 20,00   ← 5 000 veces de más
--     cuenta nueva:  1 m × (20 / 5 000)   = S/  0,004
--
-- El efecto sobre el catálogo entero: el costo de materiales de todas las
-- recetas activas pasa de S/ 184 959 a S/ 19 322. El cliente lo reportó como
-- "la receta unitaria está muy alta"; un disfraz que costaba S/ 130 de
-- materiales cuesta en realidad cerca de S/ 13.
--
-- La ficha del producto ya hacía bien la cuenta —divide por el factor— así que
-- hasta hoy la misma prenda mostraba dos costos distintos según la pantalla.
--
-- La única excepción es una línea escrita directamente en la unidad de compra
-- ("2 rollos"), donde el precio ya corresponde: ahí no se divide. Son 62 de
-- 14 346 líneas, pero dividirlas sería cambiar un error por otro.

create or replace view public.v_bom_activo as
select
  p.id                    as producto_id,
  p.codigo                as producto_codigo,
  p.nombre                as producto_nombre,
  r.id                    as receta_id,
  r.version               as receta_version,
  rl.talla,
  rl.material_id,
  m.codigo                as material_codigo,
  m.nombre                as material_nombre,
  m.categoria,
  rl.cantidad,
  rl.unidad_id,
  u.codigo                as unidad_codigo,
  rl.sale_a_servicio,
  rl.cantidad_almacen,
  m.precio_unitario,
  rl.cantidad *
  case
    when rl.unidad_id = m.unidad_compra_id then m.precio_unitario
    else m.precio_unitario / coalesce(nullif(m.factor_conversion, 0), 1)
  end                     as costo_linea,
  /*
   * El precio llevado a la unidad en que la receta pide el material.
   *
   * Va al final porque `create or replace view` solo admite AGREGAR columnas
   * después de las que ya había; reordenarlas exige tirar la vista abajo, y de
   * esta cuelga v_costo_materiales_producto.
   *
   * Se expone porque es el número que hay que mirar cuando un costo parece
   * raro: dice cuánto vale UN metro, UN botón, y se compara de memoria con lo
   * que se paga en la calle.
   */
  case
    when rl.unidad_id = m.unidad_compra_id then m.precio_unitario
    else m.precio_unitario / coalesce(nullif(m.factor_conversion, 0), 1)
  end                     as precio_unidad_consumo
from public.recetas r
join public.productos p        on p.id = r.producto_id
join public.recetas_lineas rl  on rl.receta_id = r.id
join public.materiales m       on m.id = rl.material_id
left join public.unidades_medida u on u.id = rl.unidad_id
where r.activa;

comment on view public.v_bom_activo is
  'Lineas de receta activas con su costo, valorizadas en la unidad en que la '
  'receta pide el material. precio_unitario es por unidad de COMPRA; se divide '
  'por factor_conversion salvo que la linea este escrita en esa misma unidad.';
