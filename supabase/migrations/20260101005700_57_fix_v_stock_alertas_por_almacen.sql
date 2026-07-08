-- ===========================================================================
-- Fix vista v_stock_alertas: usar almacenes.stock_minimo_default en vez del 5 fijo
-- ===========================================================================
-- Cliente reportó (reunión post-2026-07-08) que el filtro "Stock bajo" del
-- inventario usa 5 en todo lados. Ya existe almacenes.stock_minimo_default
-- (mig 53) con valores por almacén:
--   ALM-SB: 5, TDA-LQ: 3, TDA-HU: 1, ALM-MP/MR: 0 (no alertan).
-- La vista v_stock_alertas ignoraba ese campo y tenía 5 hardcoded en un
-- CROSS JOIN LATERAL. Ahora la reescribimos para que use el umbral del
-- almacén, y excluya los que tienen umbral 0 (no alertan).
-- ===========================================================================

drop view if exists public.v_stock_alertas;

create view public.v_stock_alertas as
select
  sa.almacen_id,
  a.codigo         as almacen_codigo,
  a.nombre         as almacen,
  sa.variante_id,
  pv.sku,
  p.nombre         as producto,
  pv.talla,
  sa.cantidad,
  coalesce(a.stock_minimo_default, 0)::numeric as stock_minimo
from public.stock_actual sa
join public.almacenes a on a.id = sa.almacen_id
join public.productos_variantes pv on pv.id = sa.variante_id
join public.productos p on p.id = pv.producto_id
where sa.variante_id is not null
  and coalesce(a.stock_minimo_default, 0) > 0
  and sa.cantidad <= coalesce(a.stock_minimo_default, 0)::numeric;

comment on view public.v_stock_alertas is
  'Alertas de stock por variante. Usa almacenes.stock_minimo_default como umbral por almacén (mig 57). Excluye almacenes con umbral 0.';
