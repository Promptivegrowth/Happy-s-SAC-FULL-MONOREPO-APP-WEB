-- ===========================================================================
-- HAPPY SAC — Plan maestro, OT, Corte, Órdenes de servicio, Ingreso PT
-- ===========================================================================

-- Plan maestro semanal (lista de lo que se va a producir en la semana)
create table if not exists public.plan_maestro (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                   -- 'PM-2026-S14'
  semana integer,                                -- ISO week
  anio integer,
  fecha_inicio date,
  fecha_fin date,
  creado_por uuid references auth.users(id),
  estado text default 'BORRADOR' check (estado in ('BORRADOR','APROBADO','EN_EJECUCION','COMPLETADO','CANCELADO')),
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger plan_maestro_updated_at before update on public.plan_maestro
  for each row execute function public.tg_set_updated_at();

create table if not exists public.plan_maestro_lineas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plan_maestro(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  talla talla_prenda not null,
  cantidad_planificada integer not null,
  cantidad_producida integer default 0,
  campana_id uuid references public.campanas(id),
  prioridad integer default 100,
  observacion text
);
create index plan_maestro_lineas_plan_idx on public.plan_maestro_lineas (plan_id);

-- Órdenes de trabajo (OT) — una OT agrupa modelos/tallas a producir
create table if not exists public.ot (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                   -- 'OT-000234'
  plan_id uuid references public.plan_maestro(id),
  campana_id uuid references public.campanas(id),
  es_campana boolean default false,
  estado estado_ot not null default 'BORRADOR',
  fecha_apertura date default current_date,
  fecha_cierre date,
  fecha_entrega_objetivo date,
  almacen_produccion uuid references public.almacenes(id),  -- ej: Santa Barbara
  responsable_usuario_id uuid references auth.users(id),
  prioridad integer default 100,
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger ot_updated_at before update on public.ot
  for each row execute function public.tg_set_updated_at();
create index ot_estado_idx on public.ot (estado);
create index ot_fecha_idx on public.ot (fecha_apertura desc);

-- Líneas de OT (por variante/talla)
create table if not exists public.ot_lineas (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ot(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  talla talla_prenda not null,
  variante_id uuid references public.productos_variantes(id),
  cantidad_planificada integer not null,
  cantidad_cortada integer default 0,
  cantidad_fallas integer default 0,
  cantidad_terminada integer default 0,
  observacion text,
  unique (ot_id, producto_id, talla)
);
create index ot_lineas_ot_idx on public.ot_lineas (ot_id);

-- Órdenes de corte (consolidadas: se agrupa por modelo todas las tallas)
create table if not exists public.ot_corte (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                   -- 'COR-000456'
  ot_id uuid not null references public.ot(id),
  producto_id uuid not null references public.productos(id),
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  responsable_operario_id uuid references public.operarios(id),
  tiempo_trazado_min numeric(10,2),
  tiempo_tendido_min numeric(10,2),
  tiempo_corte_min numeric(10,2),
  tiempo_habilitado_min numeric(10,2),
  capas_tendidas integer,
  metros_consumidos numeric(10,2),
  merma_metros numeric(10,2),
  estado text default 'ABIERTO' check (estado in ('ABIERTO','EN_PROCESO','COMPLETADO','ANULADO')),
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger ot_corte_updated_at before update on public.ot_corte
  for each row execute function public.tg_set_updated_at();

-- Detalle por talla del corte
create table if not exists public.ot_corte_lineas (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.ot_corte(id) on delete cascade,
  ot_linea_id uuid references public.ot_lineas(id),
  talla talla_prenda not null,
  cantidad_teorica integer not null,
  cantidad_real integer,
  merma integer default 0,
  observacion text
);
create index ot_corte_lineas_corte_idx on public.ot_corte_lineas (corte_id);

-- Órdenes de servicio (se generan cuando se envía corte al taller externo)
create table if not exists public.ordenes_servicio (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                   -- 'OS-000789'
  corte_id uuid references public.ot_corte(id),
  ot_id uuid references public.ot(id),
  taller_id uuid not null references public.talleres(id),
  proceso tipo_proceso_produccion not null default 'COSTURA',
  fecha_emision date default current_date,
  fecha_entrega_esperada date,
  fecha_recepcion date,
  es_campana boolean default false,
  monto_base numeric(12,2) default 0,
  adicional_movilidad numeric(12,2) default 0,
  adicional_campana numeric(12,2) default 0,
  monto_total numeric(12,2) generated always as (coalesce(monto_base,0) + coalesce(adicional_movilidad,0) + coalesce(adicional_campana,0)) stored,
  estado text default 'EMITIDA' check (estado in ('EMITIDA','DESPACHADA','EN_PROCESO','RECEPCIONADA','CERRADA','ANULADA')),
  firma_recibido_url text,
  observaciones text,
  cuidados text,
  consideraciones text,
  creado_por uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger ordenes_servicio_updated_at before update on public.ordenes_servicio
  for each row execute function public.tg_set_updated_at();
create index ordenes_servicio_taller_idx on public.ordenes_servicio (taller_id, estado);

-- Líneas de la orden de servicio: qué tallas/cantidades se mandan al taller
create table if not exists public.ordenes_servicio_lineas (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordenes_servicio(id) on delete cascade,
  producto_id uuid references public.productos(id),
  talla talla_prenda not null,
  cantidad integer not null,
  cantidad_recepcionada integer default 0,
  cantidad_fallada integer default 0,
  pago_unitario numeric(12,4),
  observacion text
);

-- Avios que se envían con la orden de servicio (recalculados según BOM)
create table if not exists public.ordenes_servicio_avios (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordenes_servicio(id) on delete cascade,
  material_id uuid not null references public.materiales(id),
  cantidad_enviada numeric(14,4) not null,
  cantidad_devuelta numeric(14,4) default 0,
  observacion text
);

-- Tickets de operación (control de tiempos por etapa)
create table if not exists public.tickets_operacion (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid references public.ot(id),
  corte_id uuid references public.ot_corte(id),
  proceso tipo_proceso_produccion not null,
  area_id uuid references public.areas_produccion(id),
  operario_id uuid references public.operarios(id),
  inicio timestamptz,
  fin timestamptz,
  duracion_min numeric(10,2) generated always as (
    case when fin is not null and inicio is not null
         then extract(epoch from (fin - inicio))/60.0
         else null
    end
  ) stored,
  cantidad integer default 1,
  producto_id uuid references public.productos(id),
  talla talla_prenda,
  codigo_qr text,
  observacion text,
  created_at timestamptz default now()
);
create index tickets_operacion_ot_idx on public.tickets_operacion (ot_id);
create index tickets_operacion_operario_fecha_idx on public.tickets_operacion (operario_id, inicio);

-- Bitácora de eventos de OT (timeline de cambios de estado)
create table if not exists public.ot_eventos (
  id bigserial primary key,
  ot_id uuid not null references public.ot(id) on delete cascade,
  fecha timestamptz not null default now(),
  tipo text not null,                             -- 'ESTADO_CAMBIO','NOTA','ANOMALIA','FALLA'
  estado_anterior estado_ot,
  estado_nuevo estado_ot,
  usuario_id uuid references auth.users(id),
  detalle text,
  contexto jsonb
);

-- Ingreso de prendas terminadas al almacén PT (genera lote y movimientos)
create table if not exists public.ingresos_pt (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,
  ot_id uuid references public.ot(id),
  almacen_destino uuid not null references public.almacenes(id),
  fecha timestamptz default now(),
  declarado_por uuid references auth.users(id),
  observacion text,
  created_at timestamptz default now()
);

create table if not exists public.ingresos_pt_lineas (
  id uuid primary key default gen_random_uuid(),
  ingreso_id uuid not null references public.ingresos_pt(id) on delete cascade,
  variante_id uuid not null references public.productos_variantes(id),
  cantidad integer not null,
  cantidad_falla integer default 0,
  costo_unitario_materiales numeric(12,4),
  costo_unitario_servicios numeric(12,4),
  costo_unitario_total numeric(12,4),
  lote_pt_id uuid,                               -- FK diferida
  observacion text
);
