-- ===========================================================================
-- HAPPY SAC — Control de calidad + trazabilidad completa
-- ===========================================================================

-- Catálogo de defectos (para clasificar fallas)
create table if not exists public.defectos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  descripcion text,
  severidad text check (severidad in ('BAJA','MEDIA','ALTA','CRITICA')),
  accion_default text check (accion_default in ('REPROCESO','SEGUNDA','MERMA','DEVOLVER_TALLER')),
  activo boolean default true
);

-- Controles de calidad registrados
create table if not exists public.controles_calidad (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  ot_id uuid references public.ot(id),
  ingreso_pt_id uuid references public.ingresos_pt(id),
  os_id uuid references public.ordenes_servicio(id),
  producto_id uuid references public.productos(id),
  fecha timestamptz default now(),
  revisor_usuario_id uuid references auth.users(id),
  cantidad_revisada integer not null,
  cantidad_ok integer,
  cantidad_falla integer default 0,
  cantidad_reproceso integer default 0,
  cantidad_segunda integer default 0,
  cantidad_merma integer default 0,
  responsable_taller_id uuid references public.talleres(id),
  responsable_operario_id uuid references public.operarios(id),
  descuento_aplicado numeric(12,2) default 0,
  observacion text,
  created_at timestamptz default now()
);

create table if not exists public.controles_calidad_detalle (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.controles_calidad(id) on delete cascade,
  defecto_id uuid references public.defectos(id),
  cantidad integer not null,
  talla talla_prenda,
  accion text check (accion in ('REPROCESO','SEGUNDA','MERMA','DEVOLVER_TALLER')),
  observacion text
);

-- ==========================================================================
-- TRAZABILIDAD: lotes de producto terminado
-- Cada lote identifica una corrida de producción de un SKU específico,
-- y sigue a la prenda hasta que se vende.
-- ==========================================================================
create table if not exists public.lotes_pt (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                   -- 'LT-20260101-PV482-0001'
  ot_id uuid references public.ot(id),
  ingreso_pt_id uuid references public.ingresos_pt(id),
  variante_id uuid not null references public.productos_variantes(id),
  cantidad_inicial integer not null,
  cantidad_actual integer not null,
  costo_unitario numeric(12,4),
  fecha_produccion date,
  fecha_ingreso date default current_date,
  almacen_actual uuid references public.almacenes(id),
  estado text default 'DISPONIBLE' check (estado in ('DISPONIBLE','EN_TRASLADO','RESERVADO','VENDIDO','MERMA')),
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger lotes_pt_updated_at before update on public.lotes_pt
  for each row execute function public.tg_set_updated_at();
create index lotes_pt_variante_idx on public.lotes_pt (variante_id);
create index lotes_pt_ot_idx on public.lotes_pt (ot_id);
create index lotes_pt_almacen_idx on public.lotes_pt (almacen_actual);

-- Cierre FK diferidas
alter table public.ingresos_pt_lineas
  add constraint ingresos_pt_lineas_lote_fk
  foreign key (lote_pt_id) references public.lotes_pt(id) on delete set null;

alter table public.kardex_movimientos
  add constraint kardex_lote_pt_fk
  foreign key (lote_pt_id) references public.lotes_pt(id) on delete set null;

-- Timeline de trazabilidad (un lote pasa por múltiples eventos)
create table if not exists public.trazabilidad_eventos (
  id bigserial primary key,
  lote_pt_id uuid references public.lotes_pt(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id),
  fecha timestamptz not null default now(),
  tipo text not null,                            -- 'PRODUCCION','TRASLADO','VENTA','DEVOLUCION','MERMA'
  almacen_origen uuid references public.almacenes(id),
  almacen_destino uuid references public.almacenes(id),
  ot_id uuid references public.ot(id),
  taller_id uuid references public.talleres(id),
  operario_id uuid references public.operarios(id),
  cliente_id uuid references public.clientes(id),
  usuario_id uuid references auth.users(id),
  cantidad integer,
  referencia_tipo text,
  referencia_id uuid,
  observacion text,
  contexto jsonb
);
create index trazabilidad_lote_idx on public.trazabilidad_eventos (lote_pt_id, fecha);
create index trazabilidad_variante_idx on public.trazabilidad_eventos (variante_id, fecha desc);
