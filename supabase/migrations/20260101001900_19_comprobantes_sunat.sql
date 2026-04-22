-- ===========================================================================
-- HAPPY SAC — Comprobantes electrónicos SUNAT (boletas, facturas, NC, ND, guías)
-- ===========================================================================

-- Series y correlativos oficiales por caja / sucursal
create table if not exists public.series_comprobantes (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_comprobante not null,
  serie text not null,                            -- 'B001', 'F001', 'BN01', etc.
  ultimo_correlativo bigint not null default 0,
  almacen_id uuid references public.almacenes(id),
  caja_id uuid references public.cajas(id),
  canal canal_venta,
  activa boolean default true,
  observacion text,
  created_at timestamptz default now(),
  unique (tipo, serie)
);

create table if not exists public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_comprobante not null,
  serie text not null,
  numero bigint not null,
  numero_completo text generated always as (serie || '-' || lpad(numero::text, 8, '0')) stored,
  venta_id uuid references public.ventas(id),
  pedido_b2b_id uuid references public.pedidos_b2b(id),
  pedido_web_id uuid,                             -- FK diferida
  devolucion_id uuid references public.devoluciones(id),

  cliente_id uuid references public.clientes(id),
  tipo_documento_cliente tipo_documento_identidad,
  numero_documento_cliente text,
  razon_social_cliente text,
  direccion_cliente text,
  ubigeo_cliente text,

  fecha_emision timestamptz not null default now(),
  fecha_vencimiento date,
  moneda text default 'PEN',
  tipo_cambio numeric(8,4) default 1,
  sub_total numeric(14,2) not null default 0,
  descuento_global numeric(14,2) default 0,
  igv numeric(14,2) not null default 0,
  icbper numeric(14,2) default 0,
  total numeric(14,2) not null default 0,
  total_letras text,
  forma_pago text default 'CONTADO' check (forma_pago in ('CONTADO','CREDITO')),

  estado estado_comprobante not null default 'BORRADOR',
  xml_firmado_url text,
  pdf_url text,
  cdr_url text,
  hash_firma text,
  sunat_codigo_respuesta text,
  sunat_mensaje text,
  sunat_enviado_en timestamptz,
  sunat_aceptado_en timestamptz,
  documento_referencia_id uuid references public.comprobantes(id), -- para NC/ND
  motivo_nc_nd text,
  pse_proveedor text default 'nubefact',
  pse_ticket text,
  nota_interna text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tipo, serie, numero)
);
create trigger comprobantes_updated_at before update on public.comprobantes
  for each row execute function public.tg_set_updated_at();
create index comprobantes_fecha_idx on public.comprobantes (fecha_emision desc);
create index comprobantes_cliente_idx on public.comprobantes (cliente_id);
create index comprobantes_estado_idx on public.comprobantes (estado);

create table if not exists public.comprobantes_lineas (
  id uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references public.comprobantes(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id),
  codigo text,
  descripcion text not null,
  cantidad numeric(14,4) not null,
  unidad_sunat text default 'NIU',                -- 'NIU' = UNIDAD (BIENES)
  precio_unitario numeric(12,4) not null,
  descuento numeric(12,2) default 0,
  sub_total numeric(14,2) not null,
  igv numeric(14,2) default 0,
  total numeric(14,2) not null,
  afectacion_igv text default '10' check (afectacion_igv in ('10','20','30','40'))
);

-- Guías de remisión electrónicas (para despacho de ventas B2B / web / traslados)
create table if not exists public.guias_remision (
  id uuid primary key default gen_random_uuid(),
  serie text not null,
  numero bigint not null,
  numero_completo text generated always as (serie || '-' || lpad(numero::text, 8, '0')) stored,
  venta_id uuid references public.ventas(id),
  pedido_b2b_id uuid references public.pedidos_b2b(id),
  pedido_web_id uuid,                              -- FK diferida
  traslado_id uuid references public.traslados(id),
  motivo_traslado text,                            -- catálogo SUNAT 20
  modalidad text default 'PRIVADO' check (modalidad in ('PUBLICO','PRIVADO')),
  transportista_ruc text,
  transportista_razon_social text,
  placa_vehiculo text,
  conductor_dni text,
  conductor_nombre text,
  fecha_emision timestamptz default now(),
  fecha_traslado date,
  direccion_partida text,
  ubigeo_partida text,
  direccion_llegada text,
  ubigeo_llegada text,
  estado estado_comprobante default 'BORRADOR',
  xml_firmado_url text,
  pdf_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (serie, numero)
);

create table if not exists public.guias_remision_items (
  id uuid primary key default gen_random_uuid(),
  guia_id uuid not null references public.guias_remision(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id),
  descripcion text,
  cantidad numeric(14,4) not null,
  peso_kg numeric(10,2)
);

-- Cierre FK diferida
alter table public.ventas
  add constraint ventas_comprobante_fk
  foreign key (comprobante_id) references public.comprobantes(id) on delete set null;

alter table public.devoluciones
  add constraint devoluciones_nc_fk
  foreign key (nota_credito_id) references public.comprobantes(id) on delete set null;

alter table public.pedidos_b2b_despachos
  add constraint pedidos_b2b_despachos_guia_fk
  foreign key (guia_remision_id) references public.guias_remision(id) on delete set null;
