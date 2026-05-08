-- ===========================================================================
-- HAPPY SAC — OS con adicionales proporcionales y tickets vinculados a la OS
-- ---------------------------------------------------------------------------
-- 1) Adicionales movilidad/campaña expresados POR UNIDAD enviada:
--    el monto total que paga la empresa = por_unidad * unidades enviadas.
--    Mantenemos las columnas totales existentes para compatibilidad y para
--    permitir override manual.
-- 2) tickets_operacion vinculables a una OS específica para registrar el
--    avance del trabajo en taller (quién, cuánto tiempo, qué proceso).
-- ===========================================================================

alter table public.ordenes_servicio
  add column if not exists movilidad_por_unidad numeric(12,4) default 0,
  add column if not exists campana_por_unidad numeric(12,4) default 0;

comment on column public.ordenes_servicio.movilidad_por_unidad is
  'Movilidad pagada por unidad enviada al taller. El total se calcula al guardar.';
comment on column public.ordenes_servicio.campana_por_unidad is
  'Adicional de campaña pagado por unidad enviada al taller.';

-- Backfill: si ya hay totales y unidades, derivar el por-unidad.
-- Cuando no podamos calcular (sin líneas, división por cero), dejar 0.
update public.ordenes_servicio os
   set movilidad_por_unidad = case when u > 0 then round(coalesce(os.adicional_movilidad,0)::numeric / u, 4) else 0 end,
       campana_por_unidad   = case when u > 0 then round(coalesce(os.adicional_campana,0)::numeric  / u, 4) else 0 end
  from (
    select os_id, sum(cantidad)::numeric as u
      from public.ordenes_servicio_lineas
     group by os_id
  ) t
 where t.os_id = os.id
   and (os.movilidad_por_unidad is null or os.campana_por_unidad is null
        or os.movilidad_por_unidad = 0 and os.adicional_movilidad > 0
        or os.campana_por_unidad = 0 and os.adicional_campana > 0);

-- Tickets: vínculo opcional a la OS (cuando el ticket pertenece a un trabajo
-- en taller). Mantenemos ot_id y corte_id por compatibilidad y porque los
-- tickets internos de planta pueden no tener OS.
alter table public.tickets_operacion
  add column if not exists os_id uuid references public.ordenes_servicio(id) on delete set null;

create index if not exists tickets_operacion_os_idx on public.tickets_operacion (os_id);

comment on column public.tickets_operacion.os_id is
  'OS asociada al ticket cuando el trabajo se ejecutó dentro de una orden de servicio.';
