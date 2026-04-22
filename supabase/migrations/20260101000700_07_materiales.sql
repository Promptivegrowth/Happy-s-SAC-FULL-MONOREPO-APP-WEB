-- ===========================================================================
-- HAPPY SAC — Materiales (telas, avios, insumos, empaques)
-- ===========================================================================

create table if not exists public.materiales (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                     -- 'TEL0000149', 'AVI0000034'
  nombre text not null,
  descripcion text,
  categoria categoria_material not null,
  sub_categoria text,                              -- 'SERMAT', 'BIOCUERO', 'HILO', 'BOTON', 'GRECA', etc.
  color_id uuid references public.colores(id),
  color_nombre text,                               -- redundante para búsqueda libre
  unidad_compra_id uuid references public.unidades_medida(id),
  unidad_consumo_id uuid references public.unidades_medida(id),
  factor_conversion numeric(14,6) default 1,       -- compra → consumo (ej: rollo 50m, conversion = 50)
  precio_unitario numeric(12,4) not null default 0,
  precio_incluye_igv boolean not null default true,
  stock_minimo numeric(14,4) default 0,
  stock_maximo numeric(14,4),
  es_importado boolean not null default false,
  requiere_lote boolean not null default false,    -- insumos con lote al comprar
  imagen_url text,
  proveedor_preferido_id uuid,                     -- FK diferida a proveedores (se agrega después)
  notas text,
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger materiales_updated_at before update on public.materiales
  for each row execute function public.tg_set_updated_at();
create index materiales_categoria_idx on public.materiales (categoria) where activo;
create index materiales_nombre_trgm on public.materiales using gin (public.unaccent_lower(nombre) gin_trgm_ops);
create index materiales_codigo_idx on public.materiales (codigo);

-- Lotes de materiales (control de lote/vencimiento al comprar)
create table if not exists public.materiales_lotes (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiales(id) on delete cascade,
  numero_lote text not null,
  fecha_ingreso date not null default current_date,
  fecha_vencimiento date,
  cantidad_inicial numeric(14,4) not null,
  cantidad_disponible numeric(14,4) not null,
  costo_unitario numeric(12,4),
  oc_recepcion_id uuid,                            -- FK diferida a oc_recepciones
  almacen_id uuid references public.almacenes(id),
  notas text,
  created_at timestamptz default now(),
  unique (material_id, numero_lote)
);
create index materiales_lotes_material_idx on public.materiales_lotes (material_id, fecha_vencimiento);

-- Colores disponibles por material (para telas que vienen en varios colores)
create table if not exists public.materiales_colores (
  material_id uuid references public.materiales(id) on delete cascade,
  color_id uuid references public.colores(id) on delete cascade,
  codigo_variante text,
  primary key (material_id, color_id)
);

-- Historial de precios de material (para costeo histórico y promedio ponderado)
create table if not exists public.materiales_precios_historico (
  id bigserial primary key,
  material_id uuid not null references public.materiales(id) on delete cascade,
  precio numeric(12,4) not null,
  proveedor_id uuid,                               -- FK diferida
  fecha date not null default current_date,
  origen text,                                     -- 'MANUAL','OC','IMPORTACION'
  oc_id uuid,                                      -- FK diferida
  created_at timestamptz default now()
);
create index materiales_precios_idx on public.materiales_precios_historico (material_id, fecha desc);

comment on table public.materiales is
  'Catálogo maestro de materiales: telas, avíos, insumos, empaques. Se carga inicialmente desde PLANTILLA_RECETAS.xlsx sheet MATERIALES.';
