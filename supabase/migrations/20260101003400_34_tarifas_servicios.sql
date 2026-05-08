-- ===========================================================================
-- HAPPY SAC — Tarifas de servicios CENTRALES (sin taller)
-- ===========================================================================
-- Diseño previo: cada taller tenía su propia tabla talleres_tarifas con
-- (taller × producto × proceso × talla → precio). Cargar las tarifas para
-- N talleres significaba duplicar el trabajo N veces, cuando en la práctica
-- la tarifa depende del producto/proceso/talla, no del taller.
--
-- Diseño nuevo (esta migración):
--   1. tarifas_servicios (proceso, producto_id, talla, precio_unitario)
--      es la tarifa estándar. Una sola entrada vale para TODOS los talleres.
--   2. talleres_tarifas (la vieja) queda para OVERRIDES puntuales: si un
--      taller específico cobra distinto, se carga su override ahí. La
--      consultarTarifa busca primero el override del taller, si no, cae
--      al estándar.
-- ===========================================================================

create table if not exists public.tarifas_servicios (
  id                uuid primary key default gen_random_uuid(),
  proceso           tipo_proceso_produccion,                  -- nullable: si null, aplica a cualquier proceso
  producto_id       uuid references public.productos(id) on delete cascade,  -- nullable: si null, aplica a cualquier producto
  talla             talla_prenda,                             -- nullable: si null, aplica a cualquier talla
  precio_unitario   numeric(12,4) not null check (precio_unitario > 0),
  vigente_desde     date default current_date,
  vigente_hasta     date,
  observacion       text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_tarifas_servicios_proceso on public.tarifas_servicios (proceso);
create index if not exists idx_tarifas_servicios_producto on public.tarifas_servicios (producto_id);

create trigger tarifas_servicios_updated_at before update on public.tarifas_servicios
  for each row execute function public.tg_set_updated_at();

comment on table public.tarifas_servicios is
  'Tarifas estándar por proceso × producto × talla. Una sola entrada vale para todos los talleres. Para overrides por taller usar talleres_tarifas.';

-- RLS: gerente y jefe_produccion pueden gestionar.
alter table public.tarifas_servicios enable row level security;

drop policy if exists tarifas_servicios_read on public.tarifas_servicios;
create policy tarifas_servicios_read on public.tarifas_servicios
  for select using (true);

drop policy if exists tarifas_servicios_staff on public.tarifas_servicios;
create policy tarifas_servicios_staff on public.tarifas_servicios
  for all
  using (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','contador']::rol_sistema[]
    )
  )
  with check (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','contador']::rol_sistema[]
    )
  );
