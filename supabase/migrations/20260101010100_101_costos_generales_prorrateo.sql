-- ===========================================================================
-- 101 — Costos generales de la empresa, repartidos entre las áreas
-- ===========================================================================
--
-- Hasta ahora todo costo se cargaba ÁREA POR ÁREA. Para el alquiler de una
-- máquina de bordado está bien: es de bordado y de nadie más. Para la luz y el
-- agua no: llega un recibo por todo el local y había que partirlo a mano y
-- tipearlo siete veces, una por área, cada mes. Lo pidió el cliente el
-- 16/09/2026: "debería existir un campo para ingresar esos costos globales de
-- la empresa y opción para ingresar un % de prorrateo o participación por
-- área, para no ingresar luz en cada área".
--
-- Quedan dos piezas:
--
--   · costos_generales_mensuales — el recibo entero, una vez por mes.
--   · areas_produccion.prorrateo_pct — qué porción de eso le toca a cada área.
--
-- El porcentaje vive en el área y no por mes a propósito: es una característica
-- del local —cuántos metros ocupa, cuántas máquinas tiene— que no cambia de un
-- mes al otro. Si algún día cambia, se edita y vale de ahí en adelante; los
-- valores de minuto ya calculados quedan guardados en su histórico.

create table if not exists public.costos_generales_mensuales (
  id              uuid primary key default gen_random_uuid(),
  periodo         text not null check (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  categoria       text not null check (categoria in (
                    'MANO_OBRA', 'ALQUILER', 'SERVICIOS', 'DEPRECIACION',
                    'MANTENIMIENTO', 'INSUMOS', 'OTROS')),
  concepto        text not null check (length(trim(concepto)) > 0),
  monto           numeric(14,2) not null check (monto >= 0),
  observacion     text,
  registrado_por  uuid references auth.users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

comment on table public.costos_generales_mensuales is
  'Costos de toda la empresa en un mes (luz, agua, internet, alquiler del '
  'local). Se reparten entre las areas segun areas_produccion.prorrateo_pct.';

create index if not exists costos_generales_periodo_idx
  on public.costos_generales_mensuales (periodo);

-- El pedazo de los costos generales que carga cada área.
alter table public.areas_produccion
  add column if not exists prorrateo_pct numeric(5,2) not null default 0
    check (prorrateo_pct >= 0 and prorrateo_pct <= 100);

comment on column public.areas_produccion.prorrateo_pct is
  'Que porcentaje de los costos generales de la empresa carga esta area. La '
  'suma de todas las areas deberia dar 100; si da menos, la parte que falta '
  'no se le carga a ninguna y el costo por minuto sale mas barato de lo real.';

alter table public.costos_generales_mensuales enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'costos_generales_mensuales'
       and policyname = 'costos_generales_autenticados'
  ) then
    create policy costos_generales_autenticados
      on public.costos_generales_mensuales
      for all to authenticated
      using (true) with check (true);
  end if;
end $$;
