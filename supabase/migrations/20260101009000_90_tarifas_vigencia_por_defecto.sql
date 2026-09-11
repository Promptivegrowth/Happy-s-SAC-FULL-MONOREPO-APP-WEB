-- 90_tarifas_vigencia_por_defecto
--
-- Una tarifa SIN fecha de inicio vale desde siempre. La pantalla de tarifas no
-- pide vigencia, así que la tarifa se guardaba con `vigente_desde = NULL`;
-- como la búsqueda filtraba `vigente_desde <= hoy` y en SQL una comparación
-- contra NULL nunca es verdadera, esas tarifas quedaban INVISIBLES: el usuario
-- cargaba la tarifa del producto y la orden de servicio seguía avisando que no
-- había tarifa configurada (reporte cliente 2026-09-11).
--
-- La aplicación ya quedó corregida por los dos lados (guarda la fecha de hoy y
-- la lectura acepta filas sin fecha). Acá se cierra el agujero en la base:
--   1) backfill de las filas que hayan quedado sin fecha,
--   2) DEFAULT + trigger para que nunca más entre una tarifa sin vigencia,
--      incluso si el INSERT manda NULL explícito (el DEFAULT no aplica en ese
--      caso, por eso además va el trigger).

-- 1) Backfill -----------------------------------------------------------------
update public.tarifas_servicios
   set vigente_desde = coalesce(created_at::date, current_date)
 where vigente_desde is null;

update public.talleres_tarifas
   set vigente_desde = coalesce(created_at::date, current_date)
 where vigente_desde is null;

-- 2) Defaults y trigger -------------------------------------------------------
alter table public.tarifas_servicios alter column vigente_desde set default current_date;
alter table public.talleres_tarifas  alter column vigente_desde set default current_date;

create or replace function public.tg_tarifa_vigencia_por_defecto()
returns trigger
language plpgsql
as $$
begin
  if NEW.vigente_desde is null then
    NEW.vigente_desde := current_date;
  end if;
  return NEW;
end $$;

drop trigger if exists tarifas_servicios_vigencia on public.tarifas_servicios;
create trigger tarifas_servicios_vigencia
  before insert or update on public.tarifas_servicios
  for each row execute function public.tg_tarifa_vigencia_por_defecto();

drop trigger if exists talleres_tarifas_vigencia on public.talleres_tarifas;
create trigger talleres_tarifas_vigencia
  before insert or update on public.talleres_tarifas
  for each row execute function public.tg_tarifa_vigencia_por_defecto();

comment on column public.tarifas_servicios.vigente_desde is
  'Fecha desde la que rige la tarifa. Nunca NULL: si el alta no la manda, el trigger pone la fecha del día. Una tarifa sin fecha quedaba invisible para el cálculo de la orden de servicio.';
comment on column public.talleres_tarifas.vigente_desde is
  'Fecha desde la que rige el override de este taller. Nunca NULL (mismo criterio que tarifas_servicios).';
