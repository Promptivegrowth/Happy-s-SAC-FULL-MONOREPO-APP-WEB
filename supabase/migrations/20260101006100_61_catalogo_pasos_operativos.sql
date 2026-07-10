-- =============================================================================
-- Migración 61: catálogo maestro de PASOS OPERATIVOS por área
-- =============================================================================
-- Contexto: el cliente pasó el Excel AREAS-PROCESOS.xlsx (2026-07-10). Antes de
-- esta migración el catálogo vivía hardcodeado en el frontend en
-- apps/erp/src/lib/catalogo-procesos-por-area.ts. El cliente ahora pide poder
-- editarlo desde la UI. Esta migración crea la tabla + seed inicial con los
-- 65 pasos del Excel.
--
-- El "paso operativo" es un texto libre (ej. "DESEMBOLSADO DE PAQUETES") que
-- describe el trabajo concreto dentro de un área. NO es el enum
-- tipo_proceso_produccion (ese sigue vigente y sigue guardándose en
-- productos_procesos.proceso — es lo que usan reportes / tarifas / OTs).
-- La tabla nueva es solo un catálogo de sugerencias para poblar el dropdown
-- del editor de recetas.
-- =============================================================================

create table if not exists public.catalogo_pasos_operativos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas_produccion(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un mismo nombre no puede repetirse dentro de la misma área. Sí puede
  -- repetirse entre áreas distintas (SUBLIMADO 1 ARTE aparece en CORTE,
  -- ESTAMPADO y SUBLIMADO — confirmado con cliente).
  constraint catalogo_pasos_unique_area_nombre unique (area_id, nombre)
);

create index if not exists idx_catalogo_pasos_area on public.catalogo_pasos_operativos(area_id);
create index if not exists idx_catalogo_pasos_activo on public.catalogo_pasos_operativos(activo) where activo;

-- Trigger updated_at (asume que la función tick_updated_at ya existe de mig 10)
drop trigger if exists trg_catalogo_pasos_updated_at on public.catalogo_pasos_operativos;
create trigger trg_catalogo_pasos_updated_at
  before update on public.catalogo_pasos_operativos
  for each row execute function public.tg_set_updated_at();

-- RLS: solo staff autenticado (mismo patrón que areas_produccion)
alter table public.catalogo_pasos_operativos enable row level security;

drop policy if exists "catalogo_pasos_select_staff" on public.catalogo_pasos_operativos;
create policy "catalogo_pasos_select_staff" on public.catalogo_pasos_operativos
  for select using (auth.role() = 'authenticated');

drop policy if exists "catalogo_pasos_all_staff" on public.catalogo_pasos_operativos;
create policy "catalogo_pasos_all_staff" on public.catalogo_pasos_operativos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =============================================================================
-- SEED: 65 pasos desde AREAS-PROCESOS.xlsx del cliente (2026-07-10)
-- =============================================================================
-- Usamos INSERT ... SELECT + ON CONFLICT DO NOTHING para que sea idempotente.
-- El orden = 10, 20, 30, … (múltiplos de 10) para permitir insertar más adelante.

with seed(area_codigo, nombre, orden) as (
  values
    -- ACABADO (13)
    ('ACABADO', 'AMARRADO Y ETIQUETADO',        10),
    ('ACABADO', 'DECORACIÓN DE GALONES',         20),
    ('ACABADO', 'DECORACIÓN DE GORRO',           30),
    ('ACABADO', 'DECORACIÓN DE PECHERA',         40),
    ('ACABADO', 'DECORADO PRENDA',               50),
    ('ACABADO', 'DESEMBOLSADO DE PAQUETES',      60),
    ('ACABADO', 'DOBLADO Y EMBOLSADO',           70),
    ('ACABADO', 'HABILITADO',                    80),
    ('ACABADO', 'HABILITADO DE CORTE',           90),
    ('ACABADO', 'HABILITADO EN PROCESOS',       100),
    ('ACABADO', 'LIMPIEZA',                     110),
    ('ACABADO', 'MASCARA',                      120),
    ('ACABADO', 'PEGADO, MARC. Y CORTE GAL.',   130),
    -- BORDADO (11)
    ('BORDADO', 'BORDADO OTRO ARTE',             10),
    ('BORDADO', 'DELANTERO DER',                 20),
    ('BORDADO', 'DELANTERO INFERIOR',            30),
    ('BORDADO', 'DELANTERO IZQ',                 40),
    ('BORDADO', 'DELANTERO SUPERIOR',            50),
    ('BORDADO', 'ESPALDA',                       60),
    ('BORDADO', 'ESPALDA INFERIOR',              70),
    ('BORDADO', 'ESPALDA SUPERIOR',              80),
    ('BORDADO', 'FALDA',                         90),
    ('BORDADO', 'MANGA',                        100),
    ('BORDADO', 'PECHO',                        110),
    -- COSTURA (Confección) (2)
    ('COSTURA', 'BOBOS',                         10),
    ('COSTURA', 'CONFECCIÓN',                    20),
    -- CORTE (5)
    ('CORTE',   'CORTE',                         10),
    ('CORTE',   'HABILITADO',                    20),
    ('CORTE',   'HABILITADO DE CORTE',           30),
    ('CORTE',   'SUBLIMADO 1 ARTE',              40),
    ('CORTE',   'TENDIDO',                       50),
    -- DECORADO (8)
    ('DECORADO', 'AMARRADO Y ETIQUETADO',        10),
    ('DECORADO', 'DECORACIÓN DE GALONES',        20),
    ('DECORADO', 'DECORACIÓN DE GORRO',          30),
    ('DECORADO', 'DECORACIÓN DE PECHERA',        40),
    ('DECORADO', 'DECORADO PRENDA',              50),
    ('DECORADO', 'DOBLADO Y EMBOLSADO',          60),
    ('DECORADO', 'LIMPIEZA',                     70),
    ('DECORADO', 'PEGADO, MARC. Y CORTE GAL.',   80),
    -- ESTAMPADO (12)
    ('ESTAMPADO', 'BOTAS',                       10),
    ('ESTAMPADO', 'CORREA',                      20),
    ('ESTAMPADO', 'DELANTERO IZQ',               30),
    ('ESTAMPADO', 'DELANTERO SUPERIOR',          40),
    ('ESTAMPADO', 'ESPALDA',                     50),
    ('ESTAMPADO', 'ESPALDA SUPERIOR',            60),
    ('ESTAMPADO', 'MANGA',                       70),
    ('ESTAMPADO', 'MASCARA',                     80),
    ('ESTAMPADO', 'OTRA PZA ESTAMPADA',          90),
    ('ESTAMPADO', 'PECHO',                      100),
    ('ESTAMPADO', 'PIERNA',                     110),
    ('ESTAMPADO', 'SUBLIMADO 1 ARTE',           120),
    -- PLANCHADO (1)
    ('PLANCHADO', 'PLANCHADO',                   10),
    -- PLISADO (1)
    ('PLISADO', 'PLISADO',                       10),
    -- SUBLIMADO (2)
    ('SUBLIMADO', 'SUBLIMADO 1 ARTE',            10),
    ('SUBLIMADO', 'SUBLIMADO TOTAL',             20)
)
insert into public.catalogo_pasos_operativos (area_id, nombre, orden)
select a.id, s.nombre, s.orden
  from seed s
  join public.areas_produccion a on a.codigo = s.area_codigo
on conflict on constraint catalogo_pasos_unique_area_nombre do nothing;
