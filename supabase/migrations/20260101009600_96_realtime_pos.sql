-- ===========================================================================
-- 96 — El POS se entera solo de los cambios de stock y de precios
-- ===========================================================================
--
-- El POS carga el catálogo cuando se abre la página y se queda abierto toda la
-- jornada. Si el almacén recibe un traslado, la caja sigue mostrando el stock
-- de la mañana: la cajera ve "sin stock" de algo que está en el mostrador y
-- tiene que recargar a mano para que aparezca. Lo reportaron el 16/09/2026,
-- y pasa varias veces al día porque los traslados entre tiendas son
-- constantes.
--
-- Con estas dos tablas publicadas, Supabase le avisa al POS en el momento en
-- que cambian y la pantalla se actualiza sola.
--
--   stock_actual        — traslados, compras, ajustes, y las ventas de la otra
--                         caja de la misma tienda.
--   productos_variantes — cambios de precio hechos en el ERP. Es lo mismo pero
--                         peor: seguir cobrando el precio viejo no se nota.
--
-- No hace falta REPLICA IDENTITY FULL: para altas y modificaciones Postgres
-- manda la fila nueva completa, que es lo que necesita el filtro por almacén.
-- Ponerla en FULL solo engordaría el WAL sin darnos nada.

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
     where p.pubname = 'supabase_realtime' and c.relname = 'stock_actual'
  ) then
    alter publication supabase_realtime add table public.stock_actual;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
     where p.pubname = 'supabase_realtime' and c.relname = 'productos_variantes'
  ) then
    alter publication supabase_realtime add table public.productos_variantes;
  end if;
end $$;
