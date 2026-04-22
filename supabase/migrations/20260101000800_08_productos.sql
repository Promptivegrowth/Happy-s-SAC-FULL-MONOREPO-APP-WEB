-- ===========================================================================
-- HAPPY SAC — Productos terminados (disfraces) + variantes (talla/color)
-- ===========================================================================

create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                   -- modelo base, ej: 'MOANA', 'BOLIVAR', 'CHAVO'
  nombre text not null,
  descripcion text,
  categoria_id uuid references public.categorias(id),
  campana_id uuid references public.campanas(id),
  marca_id uuid references public.marcas(id),
  es_conjunto boolean not null default true,     -- los disfraces del cliente son siempre conjuntos
  piezas_descripcion text,                       -- ej: 'Pantalón + Chaqueta + Gorro + Zapatos'
  genero text check (genero in ('MUJER','HOMBRE','UNISEX','NINO','NINA')),
  destacado boolean not null default false,
  imagen_principal_url text,
  version_ficha text not null default 'v1.0',
  proceso_estandar_tiempo_min numeric(10,2),     -- tiempo estimado total de producción
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger productos_updated_at before update on public.productos
  for each row execute function public.tg_set_updated_at();
create index productos_categoria_idx on public.productos (categoria_id) where activo;
create index productos_nombre_trgm on public.productos using gin (public.unaccent_lower(nombre) gin_trgm_ops);

-- Variantes (SKU real): producto × talla × color opcional
-- Ejemplo: MOANA #4 blanca = un SKU; MOANA #6 = otro SKU.
create table if not exists public.productos_variantes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  sku text unique not null,                      -- código legacy del cliente: 'PV482'
  codigo_barras text unique,                     -- EAN-13 para la pistola
  talla talla_prenda not null,
  color_id uuid references public.colores(id),
  color_variante text,                           -- si la variante es un color libre sin catalogar

  -- Precios
  precio_costo_estandar numeric(12,4),           -- costo calculado última vez
  precio_publico numeric(12,2),                  -- cliente final
  precio_mayorista_a numeric(12,2),              -- lista A
  precio_mayorista_b numeric(12,2),              -- lista B
  precio_mayorista_c numeric(12,2),              -- lista C (el más agresivo)
  precio_industrial numeric(12,2),               -- industrial
  moneda text not null default 'PEN',

  peso_gramos integer,
  imagen_url text,                               -- imagen principal de la variante
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (producto_id, talla, color_id)
);
create trigger productos_variantes_updated_at before update on public.productos_variantes
  for each row execute function public.tg_set_updated_at();
create index productos_variantes_producto_idx on public.productos_variantes (producto_id);
create index productos_variantes_sku_idx on public.productos_variantes (sku);
create index productos_variantes_barras_idx on public.productos_variantes (codigo_barras) where codigo_barras is not null;

-- Imágenes adicionales (galería) — por producto o por variante
create table if not exists public.productos_imagenes (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id) on delete cascade,
  url text not null,
  alt_texto text,
  orden integer not null default 0,
  es_portada boolean not null default false,
  tipo text default 'FOTO' check (tipo in ('FOTO','VIDEO','LOOKBOOK','BOCETO','FICHA')),
  created_at timestamptz default now(),
  check (producto_id is not null or variante_id is not null)
);
create index productos_imagenes_producto_idx on public.productos_imagenes (producto_id, orden);
create index productos_imagenes_variante_idx on public.productos_imagenes (variante_id, orden);

-- Publicación en e-commerce (un producto puede estar publicado o no)
create table if not exists public.productos_publicacion (
  producto_id uuid primary key references public.productos(id) on delete cascade,
  publicado boolean not null default false,
  publicado_en timestamptz,
  publicado_por uuid references auth.users(id),
  slug text unique,
  titulo_web text,                                -- título marketing
  descripcion_corta text,
  descripcion_larga text,                         -- markdown/html
  palabras_clave text,
  seo_titulo text,
  seo_descripcion text,
  destacado_web boolean not null default false,
  orden_web integer default 100,
  precio_oferta numeric(12,2),
  oferta_desde timestamptz,
  oferta_hasta timestamptz,
  etiquetas text[],                               -- ['nuevo','oferta','premium']
  updated_at timestamptz default now()
);
create trigger productos_publicacion_updated_at before update on public.productos_publicacion
  for each row execute function public.tg_set_updated_at();
create index productos_publicacion_slug_idx on public.productos_publicacion (slug) where publicado;
create index productos_publicacion_destacado_idx on public.productos_publicacion (destacado_web) where publicado;

-- Sets / kits (combos de productos). Un set tiene su propia variante con un precio.
create table if not exists public.productos_sets (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  nombre text,
  precio_set numeric(12,2),
  activo boolean default true
);

create table if not exists public.productos_sets_lineas (
  set_id uuid references public.productos_sets(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id),
  cantidad numeric(10,2) not null default 1,
  primary key (set_id, variante_id)
);
