-- Migración 51: Escalones de precio por volumen.
--
-- El cliente vende mucho a mayoristas y necesita que el precio cambie
-- automáticamente según la cantidad comprada en una sola transacción.
-- Hay 3 niveles configurables:
--   1-N → precio_publico (escalón 0)
--   N+1 a M → precio_mayorista_a (escalón 1)
--   M+1+ → precio_industrial (escalón 2)
--
-- Por defecto: 1-2 público, 3-99 mayorista, 100+ industrial.
-- Se guardan los thresholds en empresa para que sean configurables
-- desde el ERP sin tocar código.

alter table public.empresa
  add column if not exists escalon_mayorista_desde integer not null default 3 check (escalon_mayorista_desde >= 2),
  add column if not exists escalon_industrial_desde integer not null default 100 check (escalon_industrial_desde >= 3),
  add column if not exists escalones_activos boolean not null default true;

comment on column public.empresa.escalon_mayorista_desde is
  'Cantidad mínima de unidades en una línea de venta para que el precio pase de público a mayorista. Default 3.';
comment on column public.empresa.escalon_industrial_desde is
  'Cantidad mínima de unidades para pasar de mayorista a industrial (precio de fábrica). Default 100.';
comment on column public.empresa.escalones_activos is
  'Si está en false, el POS siempre usa precio_publico sin aplicar escalones automáticos.';

-- Validar que mayorista_desde < industrial_desde
do $$
begin
  if exists (
    select 1 from public.empresa
    where escalon_mayorista_desde >= escalon_industrial_desde
  ) then
    update public.empresa
       set escalon_industrial_desde = greatest(escalon_industrial_desde, escalon_mayorista_desde + 1);
  end if;
end $$;
