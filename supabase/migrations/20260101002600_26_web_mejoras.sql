-- ===========================================================================
-- HAPPY SAC — Mejoras web v2:
--   1) Auto-generación de slug en productos_publicacion (BUG: links rotos)
--   2) Slug en campanas + auto-generación
--   3) Tabla productos_resenas para reseñas de clientes en la web
--   4) Backfill de slugs faltantes
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Función helper para generar slugs URL-friendly desde texto en español
-- ---------------------------------------------------------------------------
create or replace function public.fn_slugify(input text)
returns text
language plpgsql
immutable
as $$
declare
  base text;
begin
  if input is null or btrim(input) = '' then
    return null;
  end if;
  base := lower(extensions.unaccent(input));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := regexp_replace(base, '^-+|-+$', '', 'g');
  if length(base) = 0 then
    return null;
  end if;
  return left(base, 80);
end
$$;

-- ---------------------------------------------------------------------------
-- Helper: generar slug único agregando -2, -3, … si choca
-- ---------------------------------------------------------------------------
create or replace function public.fn_slug_unico_publicacion(_base text, _excluir uuid default null)
returns text
language plpgsql
as $$
declare
  candidato text := _base;
  n int := 1;
begin
  if candidato is null then
    candidato := 'producto';
  end if;
  while exists (
    select 1 from public.productos_publicacion
    where slug = candidato
      and (_excluir is null or producto_id <> _excluir)
  ) loop
    n := n + 1;
    candidato := _base || '-' || n::text;
  end loop;
  return candidato;
end
$$;

create or replace function public.fn_slug_unico_categoria(_base text, _excluir uuid default null)
returns text
language plpgsql
as $$
declare
  candidato text := _base;
  n int := 1;
begin
  if candidato is null then
    candidato := 'categoria';
  end if;
  while exists (
    select 1 from public.categorias
    where slug = candidato
      and (_excluir is null or id <> _excluir)
  ) loop
    n := n + 1;
    candidato := _base || '-' || n::text;
  end loop;
  return candidato;
end
$$;

-- ---------------------------------------------------------------------------
-- Trigger: auto-generar slug en productos_publicacion
-- ---------------------------------------------------------------------------
create or replace function public.tg_publicacion_set_slug()
returns trigger
language plpgsql
as $$
declare
  nombre_prod text;
  base text;
begin
  if new.slug is null or btrim(new.slug) = '' then
    select coalesce(new.titulo_web, p.nombre, p.codigo)
      into nombre_prod
      from public.productos p where p.id = new.producto_id;
    base := public.fn_slugify(nombre_prod);
    new.slug := public.fn_slug_unico_publicacion(coalesce(base, 'producto'), new.producto_id);
  end if;
  return new;
end
$$;

drop trigger if exists tg_publicacion_set_slug on public.productos_publicacion;
create trigger tg_publicacion_set_slug
  before insert or update of slug, titulo_web on public.productos_publicacion
  for each row execute function public.tg_publicacion_set_slug();

-- ---------------------------------------------------------------------------
-- Trigger: auto-generar slug en categorias (para que no haya links rotos)
-- ---------------------------------------------------------------------------
create or replace function public.tg_categoria_set_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base := public.fn_slugify(new.nombre);
    new.slug := public.fn_slug_unico_categoria(coalesce(base, 'categoria'), new.id);
  end if;
  return new;
end
$$;

drop trigger if exists tg_categoria_set_slug on public.categorias;
create trigger tg_categoria_set_slug
  before insert or update of slug, nombre on public.categorias
  for each row execute function public.tg_categoria_set_slug();

-- ---------------------------------------------------------------------------
-- Slug en campanas (no existía)
-- ---------------------------------------------------------------------------
alter table public.campanas
  add column if not exists slug text unique,
  add column if not exists imagen_url text,
  add column if not exists destacada_web boolean not null default false,
  add column if not exists orden_web integer default 100;

create index if not exists campanas_slug_idx on public.campanas (slug) where activa;

create or replace function public.fn_slug_unico_campana(_base text, _excluir uuid default null)
returns text
language plpgsql
as $$
declare
  candidato text := _base;
  n int := 1;
begin
  if candidato is null then
    candidato := 'campana';
  end if;
  while exists (
    select 1 from public.campanas
    where slug = candidato
      and (_excluir is null or id <> _excluir)
  ) loop
    n := n + 1;
    candidato := _base || '-' || n::text;
  end loop;
  return candidato;
end
$$;

create or replace function public.tg_campana_set_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
begin
  if new.slug is null or btrim(new.slug) = '' then
    base := public.fn_slugify(new.nombre);
    new.slug := public.fn_slug_unico_campana(coalesce(base, 'campana'), new.id);
  end if;
  return new;
end
$$;

drop trigger if exists tg_campana_set_slug on public.campanas;
create trigger tg_campana_set_slug
  before insert or update of slug, nombre on public.campanas
  for each row execute function public.tg_campana_set_slug();

-- ---------------------------------------------------------------------------
-- BACKFILL: poblar slugs faltantes en datos existentes
-- ---------------------------------------------------------------------------

-- Categorias
update public.categorias c
set slug = public.fn_slug_unico_categoria(coalesce(public.fn_slugify(c.nombre), 'categoria'), c.id)
where c.slug is null or btrim(c.slug) = '';

-- Campanas
update public.campanas k
set slug = public.fn_slug_unico_campana(coalesce(public.fn_slugify(k.nombre), 'campana'), k.id)
where k.slug is null or btrim(k.slug) = '';

-- Publicaciones (este es EL fix del bug del usuario)
update public.productos_publicacion pub
set slug = public.fn_slug_unico_publicacion(
  coalesce(
    public.fn_slugify(pub.titulo_web),
    public.fn_slugify((select p.nombre from public.productos p where p.id = pub.producto_id)),
    'producto'
  ),
  pub.producto_id
)
where pub.slug is null or btrim(pub.slug) = '';

-- ---------------------------------------------------------------------------
-- Reseñas de clientes (la tabla ya existe en migración 20 con columna `puntuacion`)
-- Aquí agregamos columnas faltantes para soportar reseñas anónimas desde la web.
-- ---------------------------------------------------------------------------
alter table public.productos_resenas
  add column if not exists autor_nombre text,
  add column if not exists autor_email text,
  add column if not exists verificado boolean not null default false,
  add column if not exists ip text;

create index if not exists productos_resenas_producto_idx
  on public.productos_resenas (producto_id) where aprobada;

-- Permitir reseñas anónimas: el insert no requiere usuario_id ni cliente_id.
-- La política de inserción se define en migración 23 (resenas_public_read es el SELECT).
drop policy if exists resenas_insert_anon on public.productos_resenas;
create policy resenas_insert_anon on public.productos_resenas
  for insert
  with check (true);

-- ---------------------------------------------------------------------------
-- Vista agregada de rating por producto (para mostrar en cards y detalle)
-- ---------------------------------------------------------------------------
create or replace view public.v_productos_rating as
select
  producto_id,
  count(*)::int as total_resenas,
  round(avg(puntuacion)::numeric, 2) as promedio_rating
from public.productos_resenas
where aprobada = true
group by producto_id;
