-- ===========================================================================
-- HAPPY SAC — Ventas (POS, B2B, web consolidadas)
-- ===========================================================================

create table if not exists public.ventas (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                   -- 'VEN-000123' interno
  canal canal_venta not null,
  fecha timestamptz not null default now(),
  almacen_id uuid not null references public.almacenes(id),
  caja_sesion_id uuid references public.cajas_sesiones(id),
  caja_id uuid references public.cajas(id),
  cliente_id uuid references public.clientes(id),
  tipo_documento_cliente tipo_documento_identidad,
  documento_cliente text,
  nombre_cliente_rapido text,                    -- cuando solo se toma nombre al vuelo
  vendedor_usuario_id uuid references auth.users(id),
  vendedor_b2b_id uuid references auth.users(id),
  cupon_id uuid,                                  -- FK diferida
  sub_total numeric(14,2) not null default 0,
  descuento_total numeric(14,2) default 0,
  igv numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  moneda text default 'PEN',
  estado text not null default 'COMPLETADA' check (estado in ('BORRADOR','PENDIENTE','COMPLETADA','ANULADA','DEVUELTA')),
  es_apartado boolean default false,
  monto_apartado numeric(14,2),
  observacion text,
  pedido_web_id uuid,                             -- FK diferida
  pedido_b2b_id uuid,                             -- FK diferida
  comprobante_id uuid,                            -- FK diferida
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger ventas_updated_at before update on public.ventas
  for each row execute function public.tg_set_updated_at();
create index ventas_fecha_idx on public.ventas (fecha desc);
create index ventas_almacen_fecha_idx on public.ventas (almacen_id, fecha desc);
create index ventas_cliente_idx on public.ventas (cliente_id) where cliente_id is not null;
create index ventas_canal_idx on public.ventas (canal);

create table if not exists public.ventas_lineas (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  variante_id uuid not null references public.productos_variantes(id),
  lote_pt_id uuid references public.lotes_pt(id),
  cantidad integer not null,
  precio_unitario numeric(12,2) not null,
  descuento_monto numeric(12,2) default 0,
  descuento_porcentaje numeric(5,2) default 0,
  igv numeric(12,2) default 0,
  sub_total numeric(14,2) generated always as (cantidad * precio_unitario - coalesce(descuento_monto,0)) stored,
  observacion text
);
create index ventas_lineas_venta_idx on public.ventas_lineas (venta_id);
create index ventas_lineas_variante_idx on public.ventas_lineas (variante_id);

create table if not exists public.ventas_pagos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  metodo metodo_pago not null,
  monto numeric(14,2) not null,
  referencia text,                                -- nro de operación, últimos 4 tarjeta
  voucher_url text,                                -- screenshot Yape/Plin, voucher POS
  culqi_charge_id text,
  izipay_transaction_id text,
  estado text default 'CONFIRMADO' check (estado in ('PENDIENTE','CONFIRMADO','RECHAZADO','REEMBOLSADO')),
  created_at timestamptz default now()
);
create index ventas_pagos_venta_idx on public.ventas_pagos (venta_id);

-- Devoluciones (cambios y retornos)
create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  venta_id uuid references public.ventas(id),
  fecha timestamptz default now(),
  almacen_id uuid references public.almacenes(id),
  atendido_por uuid references auth.users(id),
  motivo text,
  tipo text default 'DEVOLUCION' check (tipo in ('DEVOLUCION','CAMBIO')),
  monto_devuelto numeric(14,2),
  metodo_devolucion metodo_pago,
  nota_credito_id uuid,                           -- FK diferida
  observacion text,
  created_at timestamptz default now()
);

create table if not exists public.devoluciones_lineas (
  id uuid primary key default gen_random_uuid(),
  devolucion_id uuid not null references public.devoluciones(id) on delete cascade,
  venta_linea_id uuid references public.ventas_lineas(id),
  variante_id uuid references public.productos_variantes(id),
  cantidad integer not null,
  precio_unitario numeric(12,2),
  reingresa_stock boolean default true,
  observacion text
);

-- ==========================================================================
-- B2B: pedidos mayoristas y proformas
-- ==========================================================================
create table if not exists public.pedidos_b2b (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                    -- 'B2B-000321'
  cliente_id uuid not null references public.clientes(id),
  vendedor_usuario_id uuid references auth.users(id),
  fecha date default current_date,
  fecha_entrega_estimada date,
  estado text not null default 'BORRADOR' check (estado in (
    'BORRADOR','PROFORMA','APROBADO','EN_PRODUCCION','PARCIAL','ENTREGADO','CANCELADO'
  )),
  lista_precio text,
  descuento_porcentaje numeric(5,2) default 0,
  adelanto numeric(14,2) default 0,
  sub_total numeric(14,2) default 0,
  igv numeric(14,2) default 0,
  total numeric(14,2) default 0,
  condicion_pago text,
  venta_id uuid references public.ventas(id),
  proforma_pdf_url text,
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger pedidos_b2b_updated_at before update on public.pedidos_b2b
  for each row execute function public.tg_set_updated_at();

create table if not exists public.pedidos_b2b_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_b2b(id) on delete cascade,
  variante_id uuid not null references public.productos_variantes(id),
  cantidad_pedida integer not null,
  cantidad_entregada integer default 0,
  precio_unitario numeric(12,2) not null,
  descuento numeric(5,2) default 0,
  sub_total numeric(14,2) generated always as (cantidad_pedida * precio_unitario * (1 - coalesce(descuento,0)/100)) stored,
  observacion text
);

-- Despachos parciales
create table if not exists public.pedidos_b2b_despachos (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  pedido_id uuid not null references public.pedidos_b2b(id) on delete cascade,
  almacen_id uuid references public.almacenes(id),
  fecha timestamptz default now(),
  guia_remision_id uuid,                          -- FK diferida
  observacion text
);

-- Cierre FK diferida
alter table public.ventas
  add constraint ventas_pedido_b2b_fk
  foreign key (pedido_b2b_id) references public.pedidos_b2b(id) on delete set null;
