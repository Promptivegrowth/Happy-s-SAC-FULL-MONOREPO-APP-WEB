-- ===========================================================================
-- HAPPY SAC — E-commerce: carrito, pedidos web, cupones, banners, libro reclamaciones
-- ===========================================================================

create table if not exists public.cupones (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  descripcion text,
  tipo text not null check (tipo in ('PORCENTAJE','MONTO_FIJO','ENVIO_GRATIS')),
  valor numeric(10,2) not null default 0,
  monto_minimo_compra numeric(12,2) default 0,
  fecha_inicio timestamptz default now(),
  fecha_fin timestamptz,
  usos_max integer,
  usos_actuales integer default 0,
  primer_compra_only boolean default false,
  categoria_id uuid references public.categorias(id),
  activo boolean default true,
  created_at timestamptz default now()
);

alter table public.ventas
  add constraint ventas_cupon_fk
  foreign key (cupon_id) references public.cupones(id) on delete set null;

-- Carritos persistentes (web)
create table if not exists public.carritos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id),
  usuario_id uuid references auth.users(id),
  session_token text unique,                      -- para usuarios anónimos
  total_items integer default 0,
  sub_total numeric(14,2) default 0,
  cupon_id uuid references public.cupones(id),
  expira_en timestamptz default (now() + interval '30 days'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger carritos_updated_at before update on public.carritos
  for each row execute function public.tg_set_updated_at();
create index carritos_usuario_idx on public.carritos (usuario_id) where usuario_id is not null;

create table if not exists public.carritos_lineas (
  id uuid primary key default gen_random_uuid(),
  carrito_id uuid not null references public.carritos(id) on delete cascade,
  variante_id uuid not null references public.productos_variantes(id),
  cantidad integer not null default 1,
  precio_unitario_snapshot numeric(12,2),
  agregado_en timestamptz default now(),
  unique (carrito_id, variante_id)
);

-- Pedidos web (cabecera distinta a venta — primero pedido, luego venta una vez confirmado)
create table if not exists public.pedidos_web (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                    -- 'WEB-000123'
  cliente_id uuid references public.clientes(id),
  usuario_id uuid references auth.users(id),
  email_invitado citext,
  fecha timestamptz not null default now(),

  estado estado_pedido_web not null default 'PENDIENTE_PAGO',
  metodo_entrega text not null default 'DELIVERY' check (metodo_entrega in ('DELIVERY','RECOJO_TIENDA')),
  almacen_recojo uuid references public.almacenes(id),

  -- Dirección de entrega
  direccion_entrega text,
  ubigeo_entrega text references public.ubigeo(codigo),
  referencia_entrega text,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,

  metodo_pago_seleccionado text,                   -- 'yape','plin','culqi_card','izipay_card','transferencia','whatsapp'
  cupon_id uuid references public.cupones(id),
  sub_total numeric(14,2) not null default 0,
  descuento numeric(14,2) default 0,
  costo_envio numeric(14,2) default 0,
  igv numeric(14,2) default 0,
  total numeric(14,2) not null default 0,
  moneda text default 'PEN',

  necesita_factura boolean default false,
  ruc_facturacion text,
  razon_social_facturacion text,

  notas_cliente text,
  notas_internas text,
  origen_url text,                                 -- referrer / utm
  ip_cliente inet,
  user_agent text,

  venta_id uuid references public.ventas(id),
  comprobante_id uuid references public.comprobantes(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger pedidos_web_updated_at before update on public.pedidos_web
  for each row execute function public.tg_set_updated_at();
create index pedidos_web_estado_idx on public.pedidos_web (estado, fecha desc);
create index pedidos_web_cliente_idx on public.pedidos_web (cliente_id);

create table if not exists public.pedidos_web_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_web(id) on delete cascade,
  variante_id uuid not null references public.productos_variantes(id),
  cantidad integer not null,
  precio_unitario numeric(12,2) not null,
  descuento numeric(12,2) default 0,
  sub_total numeric(14,2) generated always as (cantidad * precio_unitario - coalesce(descuento,0)) stored,
  observacion text
);

create table if not exists public.pedidos_web_pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos_web(id) on delete cascade,
  metodo metodo_pago not null,
  monto numeric(14,2) not null,
  estado text default 'PENDIENTE' check (estado in ('PENDIENTE','CONFIRMADO','RECHAZADO','REEMBOLSADO')),
  voucher_url text,
  referencia text,
  culqi_charge_id text,
  izipay_transaction_id text,
  verificado_por uuid references auth.users(id),
  verificado_en timestamptz,
  webhook_payload jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger pedidos_web_pagos_updated_at before update on public.pedidos_web_pagos
  for each row execute function public.tg_set_updated_at();

-- Cierre FK diferidas
alter table public.ventas
  add constraint ventas_pedido_web_fk
  foreign key (pedido_web_id) references public.pedidos_web(id) on delete set null;

alter table public.comprobantes
  add constraint comprobantes_pedido_web_fk
  foreign key (pedido_web_id) references public.pedidos_web(id) on delete set null;

alter table public.guias_remision
  add constraint guias_remision_pedido_web_fk
  foreign key (pedido_web_id) references public.pedidos_web(id) on delete set null;

-- ===== Banners y contenido del sitio =====
create table if not exists public.web_banners (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  subtitulo text,
  imagen_desktop_url text not null,
  imagen_mobile_url text,
  enlace text,
  posicion text default 'HERO' check (posicion in ('HERO','SECUNDARIO','POPUP','FOOTER')),
  orden integer default 100,
  campana_id uuid references public.campanas(id),
  activo boolean default true,
  fecha_inicio timestamptz default now(),
  fecha_fin timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Reseñas de productos (public, requieren moderación)
create table if not exists public.productos_resenas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  cliente_id uuid references public.clientes(id),
  usuario_id uuid references auth.users(id),
  puntuacion integer not null check (puntuacion between 1 and 5),
  titulo text,
  comentario text,
  aprobada boolean default false,
  aprobada_por uuid references auth.users(id),
  aprobada_en timestamptz,
  created_at timestamptz default now()
);

-- Suscripciones de notificación de stock ('avísame cuando llegue')
create table if not exists public.notificaciones_stock (
  id uuid primary key default gen_random_uuid(),
  variante_id uuid not null references public.productos_variantes(id) on delete cascade,
  email citext not null,
  notificado boolean default false,
  notificado_en timestamptz,
  created_at timestamptz default now(),
  unique (variante_id, email)
);

-- ===== Libro de Reclamaciones (Ley 29571) =====
create table if not exists public.reclamos (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  fecha timestamptz not null default now(),
  tipo tipo_reclamo not null,

  -- Datos del consumidor
  cliente_nombre text not null,
  cliente_documento_tipo tipo_documento_identidad not null default 'DNI',
  cliente_documento_numero text not null,
  cliente_telefono text,
  cliente_email citext,
  cliente_direccion text,
  cliente_ubigeo text references public.ubigeo(codigo),
  es_menor_edad boolean default false,
  apoderado_nombre text,
  apoderado_documento text,

  -- Identificación del bien contratado
  tipo_bien text check (tipo_bien in ('PRODUCTO','SERVICIO')),
  monto_reclamado numeric(14,2),
  pedido_web_id uuid references public.pedidos_web(id),
  venta_id uuid references public.ventas(id),
  comprobante_id uuid references public.comprobantes(id),
  descripcion text not null,
  pedido_consumidor text,                          -- qué pide el consumidor

  -- Tratamiento por el proveedor
  estado estado_reclamo not null default 'NUEVO',
  respuesta text,
  fecha_respuesta timestamptz,
  respondido_por uuid references auth.users(id),

  acepta_terminos boolean default false,
  ip_consumidor inet,
  user_agent text,
  pdf_url text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger reclamos_updated_at before update on public.reclamos
  for each row execute function public.tg_set_updated_at();
create index reclamos_estado_idx on public.reclamos (estado, fecha desc);
