-- ===========================================================================
-- HAPPY SAC — Pagos a talleres
-- ===========================================================================
-- Permite registrar cada pago semanal/puntual que se le hace a un taller
-- tercerizado, con medio de pago, banco, comprobante adjunto y opcional
-- vínculo a una OS específica. Sirve para llevar control histórico y
-- generar reportes de pagos por taller / mes / banco.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'medio_pago_taller') then
    create type medio_pago_taller as enum (
      'TRANSFERENCIA',
      'YAPE',
      'PLIN',
      'EFECTIVO',
      'CHEQUE',
      'DEPOSITO',
      'OTRO'
    );
  end if;
end$$;

create table if not exists public.pagos_talleres (
  id                  uuid primary key default gen_random_uuid(),
  taller_id           uuid not null references public.talleres(id) on delete restrict,
  fecha               date not null default current_date,
  monto               numeric(12,2) not null check (monto > 0),
  medio_pago          medio_pago_taller not null default 'TRANSFERENCIA',
  banco_destino       text,                                -- a qué banco/cuenta del taller fue
  numero_operacion    text,                                -- N° de operación o voucher
  comprobante_url     text,                                -- URL al voucher subido (opcional)
  os_id               uuid references public.ordenes_servicio(id) on delete set null,
  concepto            text,                                -- 'Pago semana 18 abril', 'Pago OS-000123', etc.
  observacion         text,
  registrado_por      uuid references auth.users(id),
  created_at          timestamptz not null default now()
);

create index if not exists idx_pagos_talleres_taller on public.pagos_talleres (taller_id, fecha desc);
create index if not exists idx_pagos_talleres_fecha on public.pagos_talleres (fecha desc);
create index if not exists idx_pagos_talleres_os on public.pagos_talleres (os_id) where os_id is not null;

comment on table public.pagos_talleres is
  'Pagos individuales hechos a talleres tercerizados. Permite llevar histórico semanal y generar reportes por taller/mes/medio.';

-- RLS: gerente, contador, almacenero, jefe_produccion pueden crear/ver.
-- Cajero NO (no debería autorizar pagos a talleres).
alter table public.pagos_talleres enable row level security;

drop policy if exists pagos_talleres_staff on public.pagos_talleres;
create policy pagos_talleres_staff on public.pagos_talleres
  for all
  using (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','contador']::rol_sistema[]
    )
  )
  with check (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','contador']::rol_sistema[]
    )
  );

-- Vista agregada por taller + mes (útil para dashboard / reporte).
create or replace view public.v_pagos_talleres_mes as
select
  taller_id,
  date_trunc('month', fecha)::date as mes,
  count(*) as cantidad_pagos,
  sum(monto) as total_pagado,
  array_agg(distinct medio_pago::text) as medios_usados
from public.pagos_talleres
group by taller_id, date_trunc('month', fecha);

comment on view public.v_pagos_talleres_mes is
  'Agregado mensual de pagos por taller. Para tablero/reporte rápido.';
