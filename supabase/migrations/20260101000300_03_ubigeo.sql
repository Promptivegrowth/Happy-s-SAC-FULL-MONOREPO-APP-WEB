-- ===========================================================================
-- HAPPY SAC — Ubigeo Perú (INEI)
-- Datos se cargan vía seed desde supabase/seed/ubigeo-peru.json
-- ===========================================================================

create table if not exists public.ubigeo (
  codigo text primary key,                 -- INEI 6 dígitos: DDPPDI (ej: '150101')
  codigo_reniec text,                      -- código RENIEC cuando difiere
  departamento_codigo text not null,       -- 2 primeros dígitos
  departamento text not null,
  provincia_codigo text not null,          -- 4 primeros dígitos
  provincia text not null,
  distrito text not null,
  region_geografica text,                  -- Costa / Sierra / Selva
  latitud numeric(10,7),
  longitud numeric(10,7)
);

create index ubigeo_departamento_idx on public.ubigeo (departamento_codigo);
create index ubigeo_provincia_idx on public.ubigeo (provincia_codigo);
create index ubigeo_distrito_trgm on public.ubigeo using gin (public.unaccent_lower(distrito) gin_trgm_ops);

-- Vista tipo dropdown: "Lima / Lima / Miraflores"
create or replace view public.v_ubigeo_completo as
select
  codigo,
  departamento_codigo,
  provincia_codigo,
  departamento,
  provincia,
  distrito,
  concat_ws(' / ', departamento, provincia, distrito) as ruta
from public.ubigeo;

alter table public.ubigeo enable row level security;

create policy "ubigeo_public_read"
  on public.ubigeo for select
  using (true);

comment on table public.ubigeo is
  'Ubicación geográfica peruana INEI. ~1.879 distritos. Catálogo público, lectura libre.';
