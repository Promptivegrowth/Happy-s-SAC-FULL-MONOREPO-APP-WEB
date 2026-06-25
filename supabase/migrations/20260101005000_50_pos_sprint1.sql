-- Migración 50: Sprint 1 POS — soporte de
--   1) Cierres parciales de caja (cambio de turno sin cerrar sesión)
--   2) Categorías de gastos para caja chica
--   3) Adelantos de cliente (saldo a favor)
--
-- Las tres son aditivas, no rompen nada existente. Las tablas
-- caja_chica_movimientos y cajas_sesiones ya existen; acá solo agregamos
-- columnas/tablas complementarias.

-- ============================================================================
-- 1) CIERRES PARCIALES (cambio de turno)
-- ============================================================================
-- Un cierre parcial cuadra la caja hasta un momento dado SIN cerrar la sesión.
-- Sirve para cambio de cajero a mitad del día: el saliente cuadra su efectivo,
-- el entrante sigue con la misma sesión y el monto contado pasa a ser la nueva
-- "base" para su turno.
--
-- La sesión sigue abierta. El cierre definitivo sigue siendo único por sesión.

create table if not exists public.cajas_cierres_parciales (
  id uuid primary key default gen_random_uuid(),
  sesion_id uuid not null references public.cajas_sesiones(id) on delete cascade,
  caja_id uuid not null references public.cajas(id),
  fecha timestamptz not null default now(),
  cajero_saliente uuid not null references auth.users(id),
  cajero_entrante uuid references auth.users(id),                 -- opcional (puede ser el mismo, o sin definir)
  -- Totales del turno (desde último cierre parcial o desde apertura)
  total_ventas integer not null default 0,
  total_efectivo numeric(12,2) not null default 0,
  total_yape numeric(12,2) not null default 0,
  total_plin numeric(12,2) not null default 0,
  total_tarjeta numeric(12,2) not null default 0,
  total_transferencia numeric(12,2) not null default 0,
  total_otros numeric(12,2) not null default 0,
  total_gastos numeric(12,2) not null default 0,                  -- egresos del turno
  -- Cuadre de efectivo
  efectivo_esperado numeric(12,2) not null default 0,             -- apertura + cobrado - gastos
  efectivo_contado numeric(12,2) not null default 0,              -- lo que cuenta físicamente el cajero
  diferencia numeric(12,2) not null default 0,                    -- contado - esperado (negativo = falta)
  observaciones text,
  created_at timestamptz default now()
);

create index cajas_cierres_parciales_sesion_idx
  on public.cajas_cierres_parciales (sesion_id, fecha desc);

comment on table public.cajas_cierres_parciales is
  'Cierres intermedios de turno sin cerrar la sesión. Útil para cambio de cajero a mitad del día.';

-- RLS: igual que cajas_sesiones — solo cajeros del POS pueden leer/insertar
alter table public.cajas_cierres_parciales enable row level security;

drop policy if exists "cierres_parciales_select" on public.cajas_cierres_parciales;
create policy "cierres_parciales_select" on public.cajas_cierres_parciales
  for select using (auth.uid() is not null);

drop policy if exists "cierres_parciales_insert" on public.cajas_cierres_parciales;
create policy "cierres_parciales_insert" on public.cajas_cierres_parciales
  for insert with check (auth.uid() is not null);

-- ============================================================================
-- 2) CATEGORÍAS DE GASTOS PARA CAJA CHICA
-- ============================================================================
-- Catálogo de categorías predefinidas (combustible, comida, transporte, etc.)
-- El usuario puede agregar más. Cada gasto opcionalmente elige una categoría
-- (puede dejarse "Otro" con texto libre).

create table if not exists public.caja_chica_categorias (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                                    -- 'COMBUSTIBLE', 'COMIDA', etc.
  nombre text not null,
  icono text,                                                     -- nombre de ícono lucide opcional
  orden integer default 100,                                      -- para ordenar en UI
  activo boolean not null default true,
  created_at timestamptz default now()
);

-- Seed inicial con categorías comunes
insert into public.caja_chica_categorias (codigo, nombre, icono, orden) values
  ('COMBUSTIBLE',   'Combustible',          'Fuel',         10),
  ('COMIDA',        'Comida / Refrigerio',  'Coffee',       20),
  ('TRANSPORTE',    'Transporte / Taxi',    'Car',          30),
  ('MATERIALES',    'Materiales urgentes',  'Package',      40),
  ('LIMPIEZA',      'Limpieza / Higiene',   'Sparkles',     50),
  ('OFICINA',       'Útiles de oficina',    'Pen',          60),
  ('SERVICIOS',     'Servicios (luz/agua/internet)', 'Plug', 70),
  ('OTROS',         'Otros',                'MoreHorizontal', 999)
on conflict (codigo) do nothing;

-- Agregar FK opcional desde caja_chica_movimientos a categorías
alter table public.caja_chica_movimientos
  add column if not exists categoria_id uuid references public.caja_chica_categorias(id);

create index if not exists caja_chica_mov_cat_idx
  on public.caja_chica_movimientos (categoria_id);

-- RLS para categorías (lectura pública para todos los usuarios)
alter table public.caja_chica_categorias enable row level security;
drop policy if exists "cat_gastos_select" on public.caja_chica_categorias;
create policy "cat_gastos_select" on public.caja_chica_categorias
  for select using (true);
drop policy if exists "cat_gastos_admin" on public.caja_chica_categorias;
create policy "cat_gastos_admin" on public.caja_chica_categorias
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ============================================================================
-- 3) ADELANTOS DE CLIENTE (saldo a favor)
-- ============================================================================
-- El cliente puede dejar dinero como adelanto sin definir qué productos
-- comprará. Al volver, ese saldo se aplica automáticamente a su próxima venta.
--
-- Cada movimiento tiene tipo:
--   ENTRADA: el cliente deja plata (caja recibe)
--   APLICACION: se descuenta del saldo al pagar una venta
--   DEVOLUCION: el cliente se arrepiente y se le devuelve el dinero

create table if not exists public.clientes_adelantos (
  id uuid primary key default gen_random_uuid(),
  numero text unique not null,                                    -- 'ADL-NNNNNN'
  cliente_id uuid not null references public.clientes(id),
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('ENTRADA', 'APLICACION', 'DEVOLUCION')),
  monto numeric(12,2) not null check (monto > 0),                 -- siempre positivo, el tipo define el signo
  metodo_pago text,                                               -- método con que se recibió/devolvió (solo ENTRADA/DEVOLUCION)
  caja_sesion_id uuid references public.cajas_sesiones(id),       -- la sesión POS donde ocurrió
  venta_id uuid references public.ventas(id),                     -- solo APLICACION: a qué venta se aplicó
  registrado_por uuid references auth.users(id),
  observacion text,
  created_at timestamptz default now()
);

create index clientes_adelantos_cliente_idx
  on public.clientes_adelantos (cliente_id, fecha desc);
create index clientes_adelantos_sesion_idx
  on public.clientes_adelantos (caja_sesion_id);

comment on table public.clientes_adelantos is
  'Movimientos de adelantos de cliente. Saldo = sum(ENTRADA) - sum(APLICACION) - sum(DEVOLUCION) por cliente.';

-- Vista de saldos por cliente (para consultar saldo disponible)
create or replace view public.v_clientes_saldos as
select
  c.id as cliente_id,
  c.razon_social,
  c.nombres,
  c.numero_documento,
  coalesce(sum(case when ca.tipo = 'ENTRADA' then ca.monto else 0 end), 0)
    - coalesce(sum(case when ca.tipo in ('APLICACION', 'DEVOLUCION') then ca.monto else 0 end), 0)
    as saldo_disponible
from public.clientes c
left join public.clientes_adelantos ca on ca.cliente_id = c.id
group by c.id, c.razon_social, c.nombres, c.numero_documento
having (
  coalesce(sum(case when ca.tipo = 'ENTRADA' then ca.monto else 0 end), 0)
  - coalesce(sum(case when ca.tipo in ('APLICACION', 'DEVOLUCION') then ca.monto else 0 end), 0)
) > 0.01;

-- RLS
alter table public.clientes_adelantos enable row level security;
drop policy if exists "adelantos_select" on public.clientes_adelantos;
create policy "adelantos_select" on public.clientes_adelantos
  for select using (auth.uid() is not null);
drop policy if exists "adelantos_insert" on public.clientes_adelantos;
create policy "adelantos_insert" on public.clientes_adelantos
  for insert with check (auth.uid() is not null);

-- ============================================================================
-- COMENTARIOS FINALES
-- ============================================================================
comment on column public.cajas_cierres_parciales.total_gastos is
  'Suma de egresos (caja_chica_movimientos tipo=EGRESO) del turno hasta el momento del cierre parcial.';
comment on column public.clientes_adelantos.metodo_pago is
  'Solo para tipo ENTRADA o DEVOLUCION. Para APLICACION queda NULL (se descuenta del saldo).';
