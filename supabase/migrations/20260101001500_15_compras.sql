-- ===========================================================================
-- HAPPY SAC — Compras, importaciones y pagos a proveedores
-- ===========================================================================

create table if not exists public.oc (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                    -- 'OC-000123'
  tipo tipo_oc not null default 'NACIONAL',
  proveedor_id uuid not null references public.proveedores(id),
  fecha date not null default current_date,
  fecha_entrega_esperada date,
  almacen_destino uuid references public.almacenes(id),
  moneda text default 'PEN',
  tipo_cambio numeric(8,4) default 1,
  sub_total numeric(14,2) default 0,
  igv numeric(14,2) default 0,
  total numeric(14,2) default 0,
  estado estado_oc not null default 'BORRADOR',
  solicitada_por uuid references auth.users(id),
  aprobada_por uuid references auth.users(id),
  aprobada_en timestamptz,
  condicion_pago text,
  adelanto numeric(14,2) default 0,
  saldo numeric(14,2) default 0,
  observacion text,
  archivo_orden_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger oc_updated_at before update on public.oc
  for each row execute function public.tg_set_updated_at();
create index oc_proveedor_idx on public.oc (proveedor_id);
create index oc_estado_idx on public.oc (estado);

create table if not exists public.oc_lineas (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null references public.oc(id) on delete cascade,
  material_id uuid references public.materiales(id),
  descripcion_libre text,
  cantidad numeric(14,4) not null,
  unidad_id uuid references public.unidades_medida(id),
  precio_unitario numeric(12,4) not null default 0,
  descuento_porcentaje numeric(5,2) default 0,
  igv_aplicable boolean default true,
  sub_total numeric(14,2) generated always as (cantidad * precio_unitario * (1 - coalesce(descuento_porcentaje,0)/100)) stored,
  cantidad_recibida numeric(14,4) default 0,
  cantidad_pendiente numeric(14,4) generated always as (cantidad - coalesce(cantidad_recibida,0)) stored,
  observacion text
);
create index oc_lineas_oc_idx on public.oc_lineas (oc_id);

-- Recepciones (una OC puede tener recepciones parciales)
create table if not exists public.oc_recepciones (
  id uuid primary key default gen_random_uuid(),
  oc_id uuid not null references public.oc(id),
  numero text unique not null,
  fecha timestamptz not null default now(),
  almacen_id uuid not null references public.almacenes(id),
  recibido_por uuid references auth.users(id),
  guia_proveedor text,
  factura_proveedor text,
  observacion text,
  created_at timestamptz default now()
);

create table if not exists public.oc_recepciones_lineas (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references public.oc_recepciones(id) on delete cascade,
  oc_linea_id uuid references public.oc_lineas(id),
  material_id uuid references public.materiales(id),
  cantidad_recibida numeric(14,4) not null,
  numero_lote text,
  fecha_vencimiento date,
  costo_unitario numeric(12,4),
  observacion text
);
create index oc_recep_lineas_recepcion_idx on public.oc_recepciones_lineas (recepcion_id);

-- Cierre FK diferida lote → recepción
alter table public.materiales_lotes
  add constraint materiales_lotes_recepcion_fk
  foreign key (oc_recepcion_id) references public.oc_recepciones(id) on delete set null;

alter table public.materiales_precios_historico
  add constraint materiales_precios_oc_fk
  foreign key (oc_id) references public.oc(id) on delete set null;

-- Importaciones (cabecera que agrupa varias OCs de proveedores externos)
create table if not exists public.importaciones (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  proveedor_id uuid references public.proveedores(id),
  pais_origen text,
  moneda text default 'USD',
  tipo_cambio numeric(8,4),
  fecha_embarque date,
  fecha_arribo_esperada date,
  fecha_arribo_real date,
  flete numeric(12,2) default 0,
  seguro numeric(12,2) default 0,
  aduanas numeric(12,2) default 0,
  otros_costos numeric(12,2) default 0,
  costo_total_adicional numeric(12,2) generated always as (coalesce(flete,0) + coalesce(seguro,0) + coalesce(aduanas,0) + coalesce(otros_costos,0)) stored,
  adelanto numeric(14,2) default 0,
  estado text default 'EN_TRANSITO' check (estado in ('PREPARACION','EN_TRANSITO','EN_ADUANAS','LIBERADA','RECIBIDA','CANCELADA')),
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger importaciones_updated_at before update on public.importaciones
  for each row execute function public.tg_set_updated_at();

alter table public.oc add column if not exists importacion_id uuid references public.importaciones(id);

-- Pagos a proveedores
create table if not exists public.pagos_proveedores (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  proveedor_id uuid not null references public.proveedores(id),
  oc_id uuid references public.oc(id),
  importacion_id uuid references public.importaciones(id),
  fecha date not null default current_date,
  monto numeric(14,2) not null,
  metodo metodo_pago not null default 'TRANSFERENCIA',
  moneda text default 'PEN',
  tipo_cambio numeric(8,4) default 1,
  referencia_bancaria text,
  comprobante_proveedor text,
  archivo_voucher_url text,
  registrado_por uuid references auth.users(id),
  observacion text,
  created_at timestamptz default now()
);
create index pagos_proveedores_prov_idx on public.pagos_proveedores (proveedor_id, fecha desc);

-- Vista cuentas por pagar (pendiente por OC)
create or replace view public.v_cuentas_pagar as
select
  oc.id as oc_id,
  oc.numero,
  oc.proveedor_id,
  p.razon_social as proveedor,
  oc.fecha,
  oc.fecha_entrega_esperada,
  oc.total,
  coalesce((select sum(pp.monto) from public.pagos_proveedores pp where pp.oc_id = oc.id), 0) as pagado,
  oc.total - coalesce((select sum(pp.monto) from public.pagos_proveedores pp where pp.oc_id = oc.id), 0) as saldo_pendiente,
  oc.estado
from public.oc oc
  join public.proveedores p on p.id = oc.proveedor_id
where oc.estado not in ('CANCELADA');
