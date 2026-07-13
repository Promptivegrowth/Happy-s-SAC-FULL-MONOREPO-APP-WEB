-- =============================================================================
-- Migración 63: vista de stock para la WEB pública (almacén La Quinta)
-- =============================================================================
-- Bug reportado 2026-07-12: la web mostraba "Producto agotado" para productos
-- CON stock en Tienda La Quinta. Causa: la página del producto consultaba
-- stock_actual + almacenes directamente, pero ambas tablas tienen RLS que
-- bloquea al rol anon (la web pública no autentica) → la query devolvía 0
-- filas y todo aparecía agotado.
--
-- Las VISTAS creadas por el owner (postgres) NO heredan el RLS de las tablas
-- base (security_invoker=false por defecto) — por eso v_stock_variante_total
-- siempre funcionó para anon. Misma estrategia acá: vista que expone SOLO el
-- stock agregado del almacén de la tienda web (La Quinta, codigo TDA-LQ),
-- sin exponer el detalle por almacén del resto de la operación.
--
-- Regla de negocio (confirmada por cliente 2026-07-10 y 07-12): la web vende
-- únicamente el stock de La Quinta.

create or replace view public.v_stock_variante_web as
select
  s.variante_id,
  sum(s.cantidad) as stock_total
from public.stock_actual s
join public.almacenes a on a.id = s.almacen_id
where a.codigo = 'TDA-LQ'
  and s.variante_id is not null
group by s.variante_id;

comment on view public.v_stock_variante_web is
  'Stock por variante visible en la web pública = solo almacén La Quinta (TDA-LQ). Ver mig 63.';

grant select on public.v_stock_variante_web to anon, authenticated;
