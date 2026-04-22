-- ===========================================================================
-- HAPPY SAC — Procesos de producción, tarifas por área, costeo
-- ===========================================================================

-- Catálogo de áreas de producción (plan propia) con valor-minuto calculado
create table if not exists public.areas_produccion (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,            -- 'CORTE', 'DECORADO', 'ESTAMPADO', 'BORDADO', 'SUBLIMADO', 'PLISADO', 'ACABADO', 'PLANCHADO'
  nombre text not null,
  valor_minuto numeric(12,6) not null default 0,
  costo_indirecto_mensual numeric(12,2) default 0,
  activa boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger areas_produccion_updated_at before update on public.areas_produccion
  for each row execute function public.tg_set_updated_at();

-- Ruta de procesos por producto (cada prenda puede tener su propia secuencia)
create table if not exists public.productos_procesos (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  talla talla_prenda,                      -- null = aplica a todas
  proceso tipo_proceso_produccion not null,
  orden integer not null,
  area_id uuid references public.areas_produccion(id),
  tiempo_estandar_min numeric(10,2),       -- tiempo estimado por prenda
  tiempo_real_promedio_min numeric(10,2),  -- se actualiza con tickets
  es_tercerizado boolean not null default false,
  taller_default_id uuid,                  -- FK diferida
  observacion text,
  created_at timestamptz default now()
);
create index productos_procesos_prod_idx on public.productos_procesos (producto_id, orden);

-- Costos de confección por producto × talla (desde COSTOS DE CONFECCION del Excel)
create table if not exists public.costos_confeccion (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete cascade,
  descripcion_ref text,                     -- nombre legacy si no se matchea producto
  categoria_legacy text,                    -- 'DANZAS TIPICAS' del Excel
  t0 numeric(10,4),
  t2 numeric(10,4),
  t4 numeric(10,4),
  t6 numeric(10,4),
  t8 numeric(10,4),
  t10 numeric(10,4),
  t12 numeric(10,4),
  t14 numeric(10,4),
  t16 numeric(10,4),
  ts numeric(10,4),
  tad numeric(10,4),
  ojal_y_boton numeric(10,4) default 0,
  vigente_desde date default current_date,
  vigente_hasta date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger costos_confeccion_updated_at before update on public.costos_confeccion
  for each row execute function public.tg_set_updated_at();
create index costos_confeccion_producto_idx on public.costos_confeccion (producto_id);

-- Función helper: obtiene costo de confección por variante
create or replace function public.costo_confeccion(p_producto uuid, p_talla talla_prenda)
  returns numeric language sql stable as $$
  select case p_talla
    when 'T0'::talla_prenda then t0
    when 'T2'::talla_prenda then t2
    when 'T4'::talla_prenda then t4
    when 'T6'::talla_prenda then t6
    when 'T8'::talla_prenda then t8
    when 'T10'::talla_prenda then t10
    when 'T12'::talla_prenda then t12
    when 'T14'::talla_prenda then t14
    when 'T16'::talla_prenda then t16
    when 'TS'::talla_prenda then ts
    when 'TAD'::talla_prenda then tad
  end
  from public.costos_confeccion
  where producto_id = p_producto
  order by vigente_desde desc
  limit 1;
$$;

-- Costos indirectos agrupados por período
create table if not exists public.costos_indirectos (
  id uuid primary key default gen_random_uuid(),
  mes integer not null check (mes between 1 and 12),
  anio integer not null,
  concepto text not null,                   -- 'LUZ','AGUA','ALQUILER','INTERNET', etc.
  monto numeric(12,2) not null,
  area_id uuid references public.areas_produccion(id),
  observacion text,
  created_at timestamptz default now(),
  unique (mes, anio, concepto, area_id)
);
