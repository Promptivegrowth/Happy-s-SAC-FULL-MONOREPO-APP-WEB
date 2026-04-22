-- ===========================================================================
-- HAPPY SAC — Fix: la extensión `unaccent` debe vivir en schema `extensions`
-- (convención Supabase). Reinstalar ahí y actualizar helper.
-- ===========================================================================

-- Mover extensión unaccent al schema extensions si no está.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'unaccent') then
    alter extension unaccent set schema extensions;
  else
    create extension unaccent with schema extensions;
  end if;
exception when others then
  -- Si ya está ahí, continuar.
  null;
end$$;

-- Recreamos el helper con call schema-qualified.
create or replace function public.unaccent_lower(text)
  returns text
  language sql immutable parallel safe
  set search_path = public, extensions
  as $$ select lower(extensions.unaccent($1)); $$;
