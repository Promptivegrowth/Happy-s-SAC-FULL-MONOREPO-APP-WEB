-- 91_centro_costos_por_area
--
-- Pedido cliente 2026-09-10: "Referente al valor minuto por área, indicar dónde
-- realizar el registro de los costos y pagos por centro de costo para
-- actualizar y sistematizar el cálculo del valor minuto".
--
-- Hasta ahora el VALOR MINUTO de cada área se escribía a mano (areas_produccion
-- .valor_minuto) y solo quedaba el histórico del número, sin el respaldo de
-- cómo se llegó a él. Con estas dos tablas cada área pasa a funcionar como un
-- CENTRO DE COSTO mensual:
--
--   areas_costos_mensuales   -> los costos y pagos del mes de esa área
--                               (planilla, alquiler, luz, depreciación, etc.)
--   areas_costos_parametros  -> los supuestos del mes para repartir ese costo
--                               (días hábiles, % de ocupación, o los minutos
--                               fijados a mano si se prefiere)
--
-- valor minuto = total de costos del mes / minutos productivos del mes
-- y al aplicarlo queda registrado en areas_valor_minuto_historial, que ya
-- existía, con la nota de cómo se calculó.

create table if not exists public.areas_costos_mensuales (
  id             uuid primary key default gen_random_uuid(),
  area_id        uuid not null references public.areas_produccion(id) on delete cascade,
  periodo        text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),  -- 'YYYY-MM'
  categoria      text not null check (categoria in (
                   'MANO_OBRA', 'ALQUILER', 'SERVICIOS', 'DEPRECIACION',
                   'MANTENIMIENTO', 'INSUMOS', 'OTROS')),
  concepto       text not null check (length(trim(concepto)) > 0),
  monto          numeric(12,2) not null check (monto >= 0),
  observacion    text,
  registrado_por uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_areas_costos_mensuales_area_periodo
  on public.areas_costos_mensuales (area_id, periodo);

create table if not exists public.areas_costos_parametros (
  area_id          uuid not null references public.areas_produccion(id) on delete cascade,
  periodo          text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  -- % del tiempo de jornada que efectivamente se trabaja en producción
  -- (descuenta paradas, cambios de modelo, limpieza, etc.).
  ocupacion_pct    numeric(5,2) not null default 85 check (ocupacion_pct > 0 and ocupacion_pct <= 100),
  -- Si el área prefiere fijar los minutos a mano, este valor manda sobre el cálculo.
  minutos_override numeric(12,2) check (minutos_override is null or minutos_override > 0),
  notas            text,
  updated_at       timestamptz not null default now(),
  primary key (area_id, periodo)
);

comment on table public.areas_costos_mensuales is
  'Costos y pagos del mes imputados a un área (centro de costo). Alimentan el cálculo del valor minuto.';
comment on table public.areas_costos_parametros is
  'Supuestos del mes para repartir el costo del área: % de ocupación y, opcionalmente, minutos fijados a mano.';

-- RLS ------------------------------------------------------------------------
alter table public.areas_costos_mensuales  enable row level security;
alter table public.areas_costos_parametros enable row level security;

drop policy if exists areas_costos_mensuales_read on public.areas_costos_mensuales;
create policy areas_costos_mensuales_read on public.areas_costos_mensuales
  for select using (auth.uid() is not null);

drop policy if exists areas_costos_mensuales_staff on public.areas_costos_mensuales;
create policy areas_costos_mensuales_staff on public.areas_costos_mensuales
  for all
  using (auth.uid() is not null and public.tiene_algun_rol(array['gerente','jefe_produccion','contador']::rol_sistema[]))
  with check (auth.uid() is not null and public.tiene_algun_rol(array['gerente','jefe_produccion','contador']::rol_sistema[]));

drop policy if exists areas_costos_parametros_read on public.areas_costos_parametros;
create policy areas_costos_parametros_read on public.areas_costos_parametros
  for select using (auth.uid() is not null);

drop policy if exists areas_costos_parametros_staff on public.areas_costos_parametros;
create policy areas_costos_parametros_staff on public.areas_costos_parametros
  for all
  using (auth.uid() is not null and public.tiene_algun_rol(array['gerente','jefe_produccion','contador']::rol_sistema[]))
  with check (auth.uid() is not null and public.tiene_algun_rol(array['gerente','jefe_produccion','contador']::rol_sistema[]));

-- updated_at -----------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists areas_costos_mensuales_touch on public.areas_costos_mensuales;
create trigger areas_costos_mensuales_touch
  before update on public.areas_costos_mensuales
  for each row execute function public.tg_touch_updated_at();

drop trigger if exists areas_costos_parametros_touch on public.areas_costos_parametros;
create trigger areas_costos_parametros_touch
  before update on public.areas_costos_parametros
  for each row execute function public.tg_touch_updated_at();
