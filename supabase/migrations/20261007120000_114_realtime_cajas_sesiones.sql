-- Cada POS se entera al instante de que su caja se abrió o se cerró (07/10/2026).
--
-- En La Quinta trabajan dos computadoras con la misma caja: una cerraba y la
-- otra seguía mostrando el turno abierto; al intentar cerrar decía "No hay una
-- sesión de caja abierta", y si vendía, registrarVenta abría sola una caja
-- nueva. Con este aviso el POS vuelve a leer su turno en el momento.
-- El aviso respeta la RLS de cajas_sesiones (solo personal con rol).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cajas_sesiones'
  ) then
    alter publication supabase_realtime add table public.cajas_sesiones;
  end if;
end $$;
