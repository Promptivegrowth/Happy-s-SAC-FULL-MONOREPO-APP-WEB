-- 89_plan_solicitud_aprobacion
-- Producción arma el plan y, cuando termina, lo ENVÍA a gerencia para su
-- aprobación con un botón (pedido cliente 2026-09-10). Guardamos quién y cuándo
-- lo solicitó para mostrarlo en el plan y evitar reenvíos a ciegas.

alter table public.plan_maestro
  add column if not exists aprobacion_solicitada_por uuid references public.perfiles(id),
  add column if not exists aprobacion_solicitada_en timestamptz;

comment on column public.plan_maestro.aprobacion_solicitada_en is
  'Fecha en que producción envió el plan a gerencia para aprobación (botón "Enviar a gerencia").';
