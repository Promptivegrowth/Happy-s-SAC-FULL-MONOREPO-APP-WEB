-- ===========================================================================
-- HAPPY SAC — Fix RLS bloqueando next_correlativo()
--
-- Síntoma: usuarios autenticados al crear OT/OC/etc reciben error
-- "new row violates row-level security policy for table 'correlativos'".
--
-- Causa: la tabla `correlativos` tiene RLS activado pero sin policies. La
-- función next_correlativo() corría con privilegios del invocador (autenticado),
-- y RLS bloqueaba el INSERT/UPDATE.
--
-- Fix: marcar next_correlativo() y los wrappers (generar_numero_*) como
-- SECURITY DEFINER con search_path bloqueado, para que corran con permisos
-- del owner (postgres/supabase_admin) y bypaseen RLS de tablas internas.
-- Patrón estándar Supabase para tablas-helper compartidas.
-- ===========================================================================

create or replace function public.next_correlativo(p_clave text, p_padding int default 6)
  returns text
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_next bigint;
begin
  insert into public.correlativos(clave, ultimo) values (p_clave, 1)
    on conflict (clave) do update set
      ultimo = public.correlativos.ultimo + 1,
      actualizado_en = now()
    returning ultimo into v_next;
  return lpad(v_next::text, p_padding, '0');
end;
$$;

-- Asegurar EXECUTE para roles autenticados/anon (las funciones SECURITY DEFINER
-- aún requieren permiso EXECUTE explícito).
grant execute on function public.next_correlativo(text, int) to authenticated, anon, service_role;

-- Los wrappers también marcados como SECURITY DEFINER por consistencia.
create or replace function public.generar_numero_ot()
  returns text
  language sql
  security definer
  set search_path = public, pg_catalog
as $$
  select 'OT-' || to_char(current_date,'YY') || '-' || public.next_correlativo('OT_' || to_char(current_date,'YY'), 5);
$$;

create or replace function public.generar_numero_oc()
  returns text
  language sql
  security definer
  set search_path = public, pg_catalog
as $$
  select 'OC-' || to_char(current_date,'YY') || '-' || public.next_correlativo('OC_' || to_char(current_date,'YY'), 5);
$$;

create or replace function public.generar_numero_pedido_web()
  returns text
  language sql
  security definer
  set search_path = public, pg_catalog
as $$
  select 'PW-' || to_char(current_date,'YYMMDD') || '-' || public.next_correlativo('PW_' || to_char(current_date,'YYMMDD'), 4);
$$;

grant execute on function public.generar_numero_ot() to authenticated, anon, service_role;
grant execute on function public.generar_numero_oc() to authenticated, anon, service_role;
grant execute on function public.generar_numero_pedido_web() to authenticated, anon, service_role;

-- generar_numero_reclamo (usado por web/POST reclamos) si existe
do $$
begin
  if exists (select 1 from pg_proc where proname = 'generar_numero_reclamo') then
    execute 'create or replace function public.generar_numero_reclamo()
      returns text
      language sql
      security definer
      set search_path = public, pg_catalog
    as $f$
      select ''REC-'' || to_char(current_date,''YYMMDD'') || ''-'' || public.next_correlativo(''REC_'' || to_char(current_date,''YYMMDD''), 4);
    $f$';
    execute 'grant execute on function public.generar_numero_reclamo() to authenticated, anon, service_role';
  end if;
end $$;
