-- ===========================================================================
-- HAPPY SAC — Extensiones Postgres
-- ===========================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "unaccent";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gin";

-- Para búsqueda fuzzy en español
create or replace function public.unaccent_lower(text)
  returns text
  language sql immutable parallel safe
  as $$ select lower(unaccent($1)); $$;

comment on function public.unaccent_lower(text) is
  'Helper: normaliza texto para búsquedas (sin acentos, lowercase). Usado en índices GIN.';
