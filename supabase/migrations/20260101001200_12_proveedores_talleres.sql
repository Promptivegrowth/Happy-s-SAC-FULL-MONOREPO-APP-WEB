-- ===========================================================================
-- HAPPY SAC — Proveedores y Talleres externos (terceros)
-- ===========================================================================

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  tipo_documento tipo_documento_identidad not null default 'RUC',
  numero_documento text not null,
  razon_social text not null,
  nombre_comercial text,
  direccion text,
  ubigeo text references public.ubigeo(codigo),
  telefono text,
  email citext,
  contacto_nombre text,
  contacto_telefono text,
  dias_pago_default integer default 0,
  moneda text default 'PEN',
  es_importacion boolean default false,
  tipo_suministro text[],                             -- ['TELA','AVIOS','INSUMO','IMPORTACION']
  notas text,
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tipo_documento, numero_documento)
);
create trigger proveedores_updated_at before update on public.proveedores
  for each row execute function public.tg_set_updated_at();
create index proveedores_nombre_trgm on public.proveedores using gin (public.unaccent_lower(razon_social) gin_trgm_ops);

-- Completar FK diferidas de materiales → proveedor preferido
alter table public.materiales
  add constraint materiales_proveedor_preferido_fk
  foreign key (proveedor_preferido_id) references public.proveedores(id) on delete set null;

alter table public.materiales_precios_historico
  add constraint materiales_precios_proveedor_fk
  foreign key (proveedor_id) references public.proveedores(id) on delete set null;

-- Cuentas bancarias de proveedores
create table if not exists public.proveedores_cuentas (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  banco text not null,
  tipo_cuenta text check (tipo_cuenta in ('CORRIENTE','AHORROS','CCI')),
  numero text not null,
  titular text,
  moneda text default 'PEN',
  created_at timestamptz default now()
);

-- Productos/materiales por proveedor (tarifas, tiempos de entrega)
create table if not exists public.proveedores_materiales (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  material_id uuid not null references public.materiales(id) on delete cascade,
  precio numeric(12,4),
  moneda text default 'PEN',
  tiempo_entrega_dias integer,
  cantidad_minima numeric(14,4),
  observacion text,
  ultima_compra date,
  unique (proveedor_id, material_id)
);

-- =========================
-- Talleres externos (terceros de confección / bordado / estampado / acabados)
-- =========================
create table if not exists public.talleres (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  tipo_documento tipo_documento_identidad,           -- puede ser nulo (sin formalidad)
  numero_documento text,
  nombre text not null,                              -- razón social o nombres (el Excel viene con nombres completos)
  direccion text,
  ubigeo text references public.ubigeo(codigo),
  telefono text,
  contacto_nombre text,
  especialidades tipo_proceso_produccion[] default array[]::tipo_proceso_produccion[],
  emite_comprobante boolean default false,
  banco text,
  numero_cuenta text,
  tipo_cuenta text,
  notas text,
  calificacion numeric(3,2) default 5.0,
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger talleres_updated_at before update on public.talleres
  for each row execute function public.tg_set_updated_at();
create index talleres_nombre_trgm on public.talleres using gin (public.unaccent_lower(nombre) gin_trgm_ops);

-- Tarifario del taller
create table if not exists public.talleres_tarifas (
  id uuid primary key default gen_random_uuid(),
  taller_id uuid not null references public.talleres(id) on delete cascade,
  producto_id uuid references public.productos(id),            -- nulo = tarifa general
  proceso tipo_proceso_produccion,
  talla talla_prenda,
  precio_unitario numeric(12,4) not null,
  vigente_desde date default current_date,
  vigente_hasta date,
  observacion text,
  created_at timestamptz default now()
);
create index talleres_tarifas_taller_idx on public.talleres_tarifas (taller_id);

-- Cierre circular: productos_procesos.taller_default_id
alter table public.productos_procesos
  add constraint productos_procesos_taller_fk
  foreign key (taller_default_id) references public.talleres(id) on delete set null;
