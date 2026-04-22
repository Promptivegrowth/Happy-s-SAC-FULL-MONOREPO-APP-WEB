-- ===========================================================================
-- HAPPY SAC — Clientes (B2C y B2B)
-- ===========================================================================

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  tipo_documento tipo_documento_identidad not null,
  numero_documento text not null,
  tipo_cliente tipo_cliente not null default 'PUBLICO_FINAL',
  razon_social text,                              -- para RUC
  nombres text,                                   -- para DNI
  apellido_paterno text,
  apellido_materno text,
  nombre_comercial text,
  email citext,
  telefono text,
  telefono_secundario text,
  direccion text,
  ubigeo text references public.ubigeo(codigo),
  lista_precio text check (lista_precio in ('PUBLICO','MAYORISTA_A','MAYORISTA_B','MAYORISTA_C','INDUSTRIAL')),
  descuento_default numeric(5,2) default 0,
  limite_credito numeric(12,2) default 0,          -- normalmente 0: cliente manifestó que no dan crédito
  dias_credito integer default 0,
  adelantos boolean default false,                  -- aceptan operar con adelantos
  usuario_id uuid references auth.users(id),       -- si el cliente creó cuenta web
  aceptacion_marketing boolean default false,
  notas text,
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tipo_documento, numero_documento)
);
create trigger clientes_updated_at before update on public.clientes
  for each row execute function public.tg_set_updated_at();
create index clientes_nombre_trgm on public.clientes using gin (
  public.unaccent_lower(coalesce(razon_social,'') || ' ' || coalesce(nombres,'') || ' ' || coalesce(apellido_paterno,'') || ' ' || coalesce(apellido_materno,'')) gin_trgm_ops
);
create index clientes_email_idx on public.clientes (email);
create index clientes_tipo_idx on public.clientes (tipo_cliente) where activo;

-- Direcciones adicionales del cliente (delivery)
create table if not exists public.clientes_direcciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  alias text,                                     -- 'Casa', 'Oficina'
  direccion text not null,
  referencia text,
  ubigeo text references public.ubigeo(codigo),
  telefono_contacto text,
  es_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index clientes_direcciones_cliente_idx on public.clientes_direcciones (cliente_id);

-- Historial consolidado de consumo por cliente (vista materializada actualizable)
create or replace view public.v_cliente_nombre_completo as
select
  c.id,
  case
    when c.tipo_documento = 'RUC' then c.razon_social
    else trim(coalesce(c.nombres,'') || ' ' || coalesce(c.apellido_paterno,'') || ' ' || coalesce(c.apellido_materno,''))
  end as nombre_completo
from public.clientes c;
