-- ===========================================================================
-- HAPPY SAC — Historial de valor_minuto por área de producción
-- ---------------------------------------------------------------------------
-- El cliente pidió poder cambiar el valor por minuto cuando cambian los costos
-- (mes a mes) manteniendo trazabilidad de qué valor estaba vigente en cada
-- momento. Esto NO afecta el cálculo de recetas existente — sigue usando el
-- valor "actual" de areas_produccion.valor_minuto. El histórico solo guarda
-- snapshots para análisis y auditoría.
-- ===========================================================================

create table if not exists public.areas_valor_minuto_historial (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas_produccion(id) on delete cascade,
  periodo text,                       -- 'YYYY-MM' opcional para etiquetar período de aplicación
  valor_minuto numeric(10,6) not null,
  notas text,
  creado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists areas_valor_minuto_historial_area_idx
  on public.areas_valor_minuto_historial (area_id, created_at desc);

comment on table public.areas_valor_minuto_historial is
  'Snapshots de areas_produccion.valor_minuto cada vez que cambia. Permite trazabilidad y análisis de evolución del costo MO.';

-- Trigger: al INSERT o cuando UPDATE cambia valor_minuto, snapshot a histórico.
create or replace function public.tg_areas_valor_minuto_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if (TG_OP = 'INSERT' and NEW.valor_minuto is not null) then
    insert into public.areas_valor_minuto_historial(area_id, valor_minuto, notas, creado_por)
    values (NEW.id, NEW.valor_minuto, 'Valor inicial al crear el área', auth.uid());
  elsif (TG_OP = 'UPDATE' and NEW.valor_minuto is distinct from OLD.valor_minuto) then
    insert into public.areas_valor_minuto_historial(area_id, valor_minuto, notas, creado_por)
    values (NEW.id, NEW.valor_minuto, 'Cambio desde el gestor de áreas', auth.uid());
  end if;
  return NEW;
end;
$$;

drop trigger if exists areas_produccion_valor_minuto_snapshot on public.areas_produccion;
create trigger areas_produccion_valor_minuto_snapshot
  after insert or update on public.areas_produccion
  for each row execute function public.tg_areas_valor_minuto_snapshot();

-- Backfill: snapshot inicial de las áreas que ya existen (con su valor actual).
-- Solo si la tabla histórico está vacía, para idempotencia si la migración se
-- re-aplica accidentalmente.
do $$
begin
  if not exists (select 1 from public.areas_valor_minuto_historial limit 1) then
    insert into public.areas_valor_minuto_historial(area_id, valor_minuto, notas)
    select id, valor_minuto, 'Snapshot inicial al activar historial (mig 37)'
    from public.areas_produccion
    where valor_minuto is not null;
  end if;
end $$;

-- RLS: misma política que areas_produccion (staff full)
alter table public.areas_valor_minuto_historial enable row level security;

drop policy if exists "areas_valor_minuto_historial_select" on public.areas_valor_minuto_historial;
create policy "areas_valor_minuto_historial_select" on public.areas_valor_minuto_historial
  for select using (true);

drop policy if exists "areas_valor_minuto_historial_staff_full" on public.areas_valor_minuto_historial;
create policy "areas_valor_minuto_historial_staff_full" on public.areas_valor_minuto_historial
  for all
  using (public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador']::rol_sistema[]))
  with check (public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador']::rol_sistema[]));
