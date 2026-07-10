-- =============================================================================
-- Migración 62: cuentas bancarias (medios de pago para POS + Yape/Plin web)
-- =============================================================================
-- Contexto: el cliente pasó su lista real de cuentas (2026-07-10):
--   POS  → EFECTIVO, BCP HAPPYS, BCP JAVIER, INTERBANK HAPPYS, INTERBANK JAVIER, BBVA
--   WEB  → Yape/Plin al 915109463 (para pagos de pedidos WhatsApp)
--
-- El enum tipo_metodo_pago sigue como está (EFECTIVO / YAPE / PLIN / TARJETA /
-- TRANSFERENCIA / DEPOSITO / CREDITO / WHATSAPP_PENDIENTE) — es lo que se
-- guarda en `ventas_pagos.metodo` para reportes. Esta tabla es sólo la lista
-- editable de CUENTAS DESTINO — un layer visual sobre el enum.
--
-- Cuando el cajero cobra por transferencia/depósito, elige una cuenta de esta
-- tabla y la venta guarda:
--    metodo   = 'TRANSFERENCIA'
--    referencia = 'BCP HAPPYS'
-- El enum se mantiene para no romper reportes / caja / sueldos.
-- =============================================================================

create table if not exists public.cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  nombre_corto text not null,        -- 'BCP HAPPYS', 'BBVA', 'YAPE/PLIN', etc.
  banco text,                        -- 'BCP', 'INTERBANK', 'BBVA', 'YAPE/PLIN'
  titular text,                      -- 'HAPPY SAC', 'JAVIER (persona)'
  numero_cuenta text,                -- número de cuenta corriente/ahorro
  numero_cci text,                   -- CCI para transferencias interbancarias
  numero_telefono text,              -- para Yape/Plin
  metodo_default text not null default 'TRANSFERENCIA',
    -- valor del enum tipo_metodo_pago que se guardará en ventas_pagos.metodo
    -- cuando se seleccione esta cuenta. Ej. 'TRANSFERENCIA' para BCP,
    -- 'YAPE' para la cuenta yape. NO usamos el enum como tipo de columna
    -- para permitir agregar 'DEPOSITO', 'TARJETA_CREDITO', etc.
  visible_pos boolean not null default true,
  visible_web boolean not null default false,
  orden int not null default 0,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cuentas_bancarias_nombre_unico unique (nombre_corto)
);

create index if not exists idx_cuentas_bancarias_visible_pos on public.cuentas_bancarias(visible_pos) where visible_pos and activo;
create index if not exists idx_cuentas_bancarias_visible_web on public.cuentas_bancarias(visible_web) where visible_web and activo;

-- Trigger updated_at (usa el helper existente tg_set_updated_at)
drop trigger if exists trg_cuentas_bancarias_updated_at on public.cuentas_bancarias;
create trigger trg_cuentas_bancarias_updated_at
  before update on public.cuentas_bancarias
  for each row execute function public.tg_set_updated_at();

-- RLS: sólo staff autenticado (mismo patrón que areas_produccion / catálogo)
alter table public.cuentas_bancarias enable row level security;

drop policy if exists "cuentas_bancarias_select_staff" on public.cuentas_bancarias;
create policy "cuentas_bancarias_select_staff" on public.cuentas_bancarias
  for select using (auth.role() = 'authenticated');

drop policy if exists "cuentas_bancarias_all_staff" on public.cuentas_bancarias;
create policy "cuentas_bancarias_all_staff" on public.cuentas_bancarias
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Además, permitir SELECT anónimo de las cuentas marcadas visible_web=true
-- para que el checkout público de apps/web pueda mostrarlas sin auth.
drop policy if exists "cuentas_bancarias_web_publico" on public.cuentas_bancarias;
create policy "cuentas_bancarias_web_publico" on public.cuentas_bancarias
  for select using (visible_web = true and activo = true);

-- =============================================================================
-- SEED: cuentas iniciales del cliente
-- =============================================================================
insert into public.cuentas_bancarias
  (nombre_corto, banco, titular, metodo_default, visible_pos, visible_web, orden, notas)
values
  ('BCP HAPPYS',       'BCP',       'HAPPY SAC',        'TRANSFERENCIA', true,  false, 10, null),
  ('BCP JAVIER',       'BCP',       'JAVIER',           'TRANSFERENCIA', true,  false, 20, null),
  ('INTERBANK HAPPYS', 'INTERBANK', 'HAPPY SAC',        'TRANSFERENCIA', true,  false, 30, null),
  ('INTERBANK JAVIER', 'INTERBANK', 'JAVIER',           'TRANSFERENCIA', true,  false, 40, null),
  ('BBVA',             'BBVA',      null,               'TRANSFERENCIA', true,  false, 50, null)
on conflict on constraint cuentas_bancarias_nombre_unico do nothing;

-- Yape/Plin: cuenta para pagos web al 915109463
insert into public.cuentas_bancarias
  (nombre_corto, banco, titular, numero_telefono, metodo_default, visible_pos, visible_web, orden, notas)
values
  ('YAPE/PLIN',        'YAPE/PLIN', 'HAPPY SAC',        '915109463',    'YAPE',          false, true,  60, 'Número para pagos web por Yape y Plin.')
on conflict on constraint cuentas_bancarias_nombre_unico do nothing;
