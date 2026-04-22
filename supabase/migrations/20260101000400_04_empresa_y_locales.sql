-- ===========================================================================
-- HAPPY SAC — Empresa, almacenes, tiendas y cajas
-- ===========================================================================

create table if not exists public.empresa (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  nombre_comercial text,
  ruc text unique not null check (char_length(ruc) = 11),
  direccion_fiscal text,
  ubigeo text references public.ubigeo(codigo),
  telefono text,
  email text,
  logo_url text,
  moneda_base text not null default 'PEN',
  idioma text not null default 'es-PE',
  zona_horaria text not null default 'America/Lima',
  igv_porcentaje numeric(5,2) not null default 18.00,
  politica_comentarios text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger empresa_updated_at before update on public.empresa
  for each row execute function public.tg_set_updated_at();

create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                     -- ej: 'ALM-SB', 'TDA-LQ', 'TDA-HU'
  nombre text not null,
  tipo tipo_almacen not null,
  direccion text,
  ubigeo text references public.ubigeo(codigo),
  responsable_usuario_id uuid references auth.users(id),
  activo boolean not null default true,
  es_tienda boolean not null default false,        -- true si es punto de venta POS
  permite_ventas boolean not null default false,
  permite_compras boolean not null default false,
  permite_produccion boolean not null default false,
  color_etiqueta text default '#ff4d0d',
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger almacenes_updated_at before update on public.almacenes
  for each row execute function public.tg_set_updated_at();

create index almacenes_tipo_idx on public.almacenes (tipo) where activo;

-- Cajas (terminales POS) — cada tienda puede tener una o más cajas
create table if not exists public.cajas (
  id uuid primary key default gen_random_uuid(),
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  nombre text not null,                            -- 'Caja 1', 'Caja 2'
  codigo text unique not null,
  serie_boleta text,                                -- ej: 'B001'
  serie_factura text,                               -- ej: 'F001'
  serie_nota_venta text,                            -- ej: 'NV01'
  impresora_ticket text,                            -- nombre impresora térmica
  monto_apertura_default numeric(12,2) default 100,
  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger cajas_updated_at before update on public.cajas
  for each row execute function public.tg_set_updated_at();

-- Aperturas / cierres de caja
create table if not exists public.cajas_sesiones (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id),
  abierta_por uuid not null references auth.users(id),
  abierta_en timestamptz not null default now(),
  monto_apertura numeric(12,2) not null default 0,
  cerrada_por uuid references auth.users(id),
  cerrada_en timestamptz,
  monto_cierre_efectivo numeric(12,2),
  monto_esperado_efectivo numeric(12,2),
  diferencia numeric(12,2),
  total_efectivo numeric(12,2),
  total_yape numeric(12,2),
  total_plin numeric(12,2),
  total_tarjeta numeric(12,2),
  total_transferencia numeric(12,2),
  total_otros numeric(12,2),
  observaciones text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger cajas_sesiones_updated_at before update on public.cajas_sesiones
  for each row execute function public.tg_set_updated_at();
create index cajas_sesiones_caja_abierta_idx on public.cajas_sesiones (caja_id) where cerrada_en is null;
create index cajas_sesiones_fecha_idx on public.cajas_sesiones (caja_id, abierta_en desc);

-- Movimientos de caja chica (egresos/ingresos que no son ventas)
create table if not exists public.caja_chica_movimientos (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid references public.cajas_sesiones(id) on delete cascade,
  caja_id uuid references public.cajas(id),
  tipo text not null check (tipo in ('INGRESO','EGRESO')),
  concepto text not null,
  monto numeric(12,2) not null,
  metodo metodo_pago not null default 'EFECTIVO',
  registrado_por uuid references auth.users(id),
  comprobante_ref text,                          -- número de recibo, boleta del gasto
  created_at timestamptz default now()
);
