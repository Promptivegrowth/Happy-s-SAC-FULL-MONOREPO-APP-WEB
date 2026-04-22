-- ===========================================================================
-- HAPPY SAC — Maestros básicos: categorías, líneas, unidades de medida, colores
-- ===========================================================================

-- Unidades de medida (metro, kg, unidad, rollo, millar, mazo, madeja, litro, etc.)
create table if not exists public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,               -- 'm', 'kg', 'unid', 'rollo', 'millar', 'mazo', 'madeja', 'pieza', 'cono', 'disco', 'hilo', 'litro'
  nombre text not null,
  simbolo text,
  tipo text check (tipo in ('LONGITUD','PESO','VOLUMEN','UNIDAD','CONJUNTO')),
  sunat_codigo text,                          -- equivalencia SUNAT (ver catálogo 03)
  factor_conversion numeric(14,6),            -- factor a unidad base si aplica
  unidad_base text,                           -- ej: 'Rollo (m)' → base 'm', factor 50
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- Categorías/líneas de productos (FIESTAS PATRIAS, DANZAS TIPICAS, SUPERHEROES, HALLOWEEN, etc.)
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                -- ej: '001', '002'
  nombre text not null,
  descripcion text,
  padre_id uuid references public.categorias(id),
  icono text,                                 -- emoji/lucide icon
  color text default '#ff4d0d',
  publicar_en_web boolean not null default true,
  orden_web integer default 100,
  imagen_url text,
  slug text unique,
  seo_titulo text,
  seo_descripcion text,
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger categorias_updated_at before update on public.categorias
  for each row execute function public.tg_set_updated_at();
create index categorias_padre_idx on public.categorias (padre_id);
create index categorias_slug_idx on public.categorias (slug) where publicar_en_web;

-- Colores (catálogo interno)
create table if not exists public.colores (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  hex text,
  pantone text,
  activo boolean not null default true
);

-- Marcas (si el negocio distribuye marcas propias o de terceros)
create table if not exists public.marcas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  logo_url text,
  descripcion text,
  activo boolean not null default true
);

-- Temporadas / campañas (Halloween, Navidad, Fiestas Patrias, Carnavales, etc.)
create table if not exists public.campanas (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  descripcion text,
  fecha_inicio date,
  fecha_fin date,
  factor_costo_servicio numeric(5,3) default 1.000,  -- ajuste de tarifa a talleres en campaña
  banner_url text,
  activa boolean not null default true,
  created_at timestamptz default now()
);
