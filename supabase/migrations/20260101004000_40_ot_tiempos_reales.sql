-- ===========================================================================
-- HAPPY SAC — Tiempos reales por operación en la OT.
-- ---------------------------------------------------------------------------
-- El cliente necesita poder ajustar el tiempo REAL que tomó cada operación
-- en una OT específica para recalcular el costo MO real (vs el costo teórico
-- que viene del tiempo_estandar_min de productos_procesos).
--
-- Diseño: tabla puente OT × proceso × talla con tiempo_real_min. Si no hay
-- registro para un (ot, proceso, talla), se usa el tiempo_estandar_min del
-- proceso. Esto mantiene la receta como fuente de verdad por defecto.
--
-- El costo real efectivo se calcula on-demand server-side:
--   costo_real = tiempo_real_min × valor_minuto(area) × unidades_cortadas
-- ===========================================================================

create table if not exists public.ot_tiempos_reales (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ot(id) on delete cascade,
  proceso_id uuid not null references public.productos_procesos(id) on delete cascade,
  talla text not null,
  tiempo_real_min numeric(10,2),
  notas text,
  registrado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ot_id, proceso_id, talla)
);

create index if not exists ot_tiempos_reales_ot_idx
  on public.ot_tiempos_reales (ot_id);

create trigger ot_tiempos_reales_updated_at
  before update on public.ot_tiempos_reales
  for each row execute function public.tg_set_updated_at();

comment on table public.ot_tiempos_reales is
  'Tiempos reales medidos por operación × talla en una OT. Override del tiempo_estandar_min de productos_procesos. Si no hay fila para (ot, proceso, talla), prevalece el estándar.';

-- RLS: misma política que ot_lineas (staff full read/write).
alter table public.ot_tiempos_reales enable row level security;

drop policy if exists "ot_tiempos_reales_select" on public.ot_tiempos_reales;
create policy "ot_tiempos_reales_select"
  on public.ot_tiempos_reales for select
  using (true);

drop policy if exists "ot_tiempos_reales_staff_full" on public.ot_tiempos_reales;
create policy "ot_tiempos_reales_staff_full"
  on public.ot_tiempos_reales for all
  using (public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero']::rol_sistema[]))
  with check (public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero']::rol_sistema[]));
