-- 88_calificacion_taller_automatica
-- La CALIFICACIÓN de un taller deja de ser un número manual: se calcula sola a
-- partir de los REGISTROS DE CALIDAD de los servicios que retornan de ese taller
-- (pedido cliente 2026-09-10: "todos inician con 5 pero que se recalcule con los
-- registros de calidad de los servicios").
--
-- Fuente: controles_calidad. El control se atribuye al taller por
-- `responsable_taller_id` y, si viene vacío, por la OS (`os_id` -> ordenes_servicio.taller_id).
--
-- Fórmula: calificacion = 5 * (cantidad_ok / cantidad_revisada), acotada a [1, 5].
--   100% conforme -> 5.00 · 90% -> 4.50 · 80% -> 4.00 · <=20% -> 1.00
-- Sin registros de calidad -> 5.00 (todos arrancan en 5).

create or replace function public.recalcular_calificacion_taller(p_taller_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revisada numeric := 0;
  v_ok       numeric := 0;
  v_calif    numeric;
begin
  if p_taller_id is null then return; end if;

  select coalesce(sum(cc.cantidad_revisada), 0), coalesce(sum(cc.cantidad_ok), 0)
    into v_revisada, v_ok
  from public.controles_calidad cc
  left join public.ordenes_servicio os on os.id = cc.os_id
  where coalesce(cc.responsable_taller_id, os.taller_id) = p_taller_id;

  if v_revisada <= 0 then
    v_calif := 5.00;                                  -- aún sin evaluar
  else
    v_calif := round(least(5, greatest(1, 5 * (v_ok / v_revisada)))::numeric, 2);
  end if;

  update public.talleres
     set calificacion = v_calif,
         updated_at = now()
   where id = p_taller_id
     and calificacion is distinct from v_calif;
end $$;

-- Trigger: recalcula al crear / editar / borrar un control de calidad.
create or replace function public.tg_recalcular_calificacion_taller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := OLD.responsable_taller_id;
    if v_old is null and OLD.os_id is not null then
      select taller_id into v_old from public.ordenes_servicio where id = OLD.os_id;
    end if;
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := NEW.responsable_taller_id;
    if v_new is null and NEW.os_id is not null then
      select taller_id into v_new from public.ordenes_servicio where id = NEW.os_id;
    end if;
  end if;

  if v_old is not null then
    perform public.recalcular_calificacion_taller(v_old);
  end if;
  if v_new is not null and v_new is distinct from v_old then
    perform public.recalcular_calificacion_taller(v_new);
  end if;

  return null;
end $$;

drop trigger if exists controles_calidad_calificacion_taller on public.controles_calidad;
create trigger controles_calidad_calificacion_taller
  after insert or update or delete on public.controles_calidad
  for each row execute function public.tg_recalcular_calificacion_taller();

-- Backfill: deja a todos los talleres con su calificación calculada (5.00 si
-- todavía no tienen registros de calidad).
do $$
declare r record;
begin
  for r in select id from public.talleres loop
    perform public.recalcular_calificacion_taller(r.id);
  end loop;
end $$;

comment on column public.talleres.calificacion is
  'Calculada automáticamente desde controles_calidad (5 * ok/revisada, acotada a 1-5). 5.00 si aún no tiene registros de calidad. No editar a mano: el trigger la recalcula.';
