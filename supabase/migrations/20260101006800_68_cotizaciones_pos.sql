-- Mig 68 — Cotizaciones del POS (guardar + recuperar + convertir a venta)
-- Pedido del cliente (21/07/2026): en el POS, guardar una cotización por N
-- días (default 20), buscarla y convertirla en venta (boleta/factura), con
-- los PRECIOS CONGELADOS de la cotización.

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  cliente_id uuid references public.clientes(id) on delete set null,
  cliente_nombre text,
  cliente_documento text,
  cliente_telefono text,
  fecha timestamptz not null default now(),
  vigencia_dias int not null default 20,
  vence_el date not null,
  subtotal numeric(12,2) not null default 0,
  igv numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  vendedor_id uuid,
  vendedor_nombre text,
  notas text,
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE','CONVERTIDA','ANULADA')),
  venta_id uuid references public.ventas(id) on delete set null,
  caja_id uuid,
  creada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cotizaciones_lineas (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id) on delete set null,
  sku text,
  producto_nombre text,
  talla text,
  cantidad int not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null,
  sub_total numeric(12,2) not null
);

create index if not exists idx_cotizaciones_estado on public.cotizaciones(estado);
create index if not exists idx_cotizaciones_numero on public.cotizaciones(numero);
create index if not exists idx_cotizaciones_cliente on public.cotizaciones(cliente_nombre);
create index if not exists idx_cotizaciones_lineas_cot on public.cotizaciones_lineas(cotizacion_id);

create trigger tg_cotizaciones_updated before update on public.cotizaciones
  for each row execute function tg_set_updated_at();

alter table public.cotizaciones enable row level security;
alter table public.cotizaciones_lineas enable row level security;

create policy cotizaciones_staff_full on public.cotizaciones for all
  using (auth.uid() is not null and tiene_algun_rol(array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[]))
  with check (auth.uid() is not null and tiene_algun_rol(array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[]));

create policy cotizaciones_lineas_staff_full on public.cotizaciones_lineas for all
  using (auth.uid() is not null and tiene_algun_rol(array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[]))
  with check (auth.uid() is not null and tiene_algun_rol(array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[]));
