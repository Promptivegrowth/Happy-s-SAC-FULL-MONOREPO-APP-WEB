-- ===========================================================================
-- HAPPY SAC — Operarios: horarios distintos por día.
-- ---------------------------------------------------------------------------
-- Hasta ahora un operario tenía jornada_inicio + jornada_fin + jornada_dias,
-- aplicando el mismo horario a todos los días seleccionados. El cliente pidió
-- poder tener horarios distintos por día (p.ej. L-V 08:00-17:00, sábado
-- 08:00-13:00). Agregamos una columna jsonb con el detalle por día.
--
-- Formato: [{"dia":"LUN","inicio":"08:00","fin":"17:00"}, ...]
--
-- Backward compatibility: jornada_inicio/fin/dias se mantienen y sirven como
-- fallback cuando jornada_horarios es null o vacío. Cuando jornada_horarios
-- está presente, prevalece.
-- ===========================================================================

alter table public.operarios
  add column if not exists jornada_horarios jsonb;

comment on column public.operarios.jornada_horarios is
  'Array de horarios por día: [{dia, inicio, fin}, ...]. Si está presente prevalece sobre jornada_inicio/jornada_fin/jornada_dias.';

-- Backfill: para los operarios que ya tenían jornada personalizada con un
-- único horario global, expandimos a un horario por día seleccionado para que
-- la nueva UI los muestre coherentemente. Idempotente: solo aplica si la
-- columna está vacía.
update public.operarios
   set jornada_horarios = (
     select jsonb_agg(jsonb_build_object('dia', d, 'inicio', to_char(jornada_inicio, 'HH24:MI'), 'fin', to_char(jornada_fin, 'HH24:MI')))
       from unnest(jornada_dias) as d
   )
 where jornada_personalizada = true
   and jornada_horarios is null
   and jornada_inicio is not null
   and jornada_fin is not null
   and jornada_dias is not null
   and array_length(jornada_dias, 1) > 0;
