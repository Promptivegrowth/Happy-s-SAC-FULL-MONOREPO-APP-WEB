-- =============================================================================
-- Migración 65: FAMILIAS DE PRODUCTO (agrupación por color)
-- =============================================================================
-- Pedido cliente 2026-07-14: "consolidar el stock de producto con variante de
-- color — ej. Polca rojo, Polca fucsia, Polca oro en un producto llamado
-- 'Polca para niña', para el POS y para la web".
--
-- Diseño: cada color SIGUE siendo un producto independiente (receta, costo,
-- stock, kardex y producción intactos). La familia es una capa de agrupación
-- visual encima:
--   - POS: una tarjeta por familia con stock consolidado; al abrirla se
--     elige color → talla.
--   - WEB: selector de color en la página del producto (navega entre los
--     hermanos publicados de la familia).
--
-- El "color" mostrado se toma de productos.color_variante (texto corto,
-- ej. "Rojo") — si está vacío se usa el nombre del producto.

create table if not exists public.productos_familias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,               -- "Polca para niña"
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint productos_familias_nombre_unico unique (nombre)
);

drop trigger if exists trg_productos_familias_updated_at on public.productos_familias;
create trigger trg_productos_familias_updated_at
  before update on public.productos_familias
  for each row execute function public.tg_set_updated_at();

alter table public.productos
  add column if not exists familia_id uuid references public.productos_familias(id) on delete set null;

-- Etiqueta corta del color de ESTE producto dentro de la familia
-- (ej. "Rojo", "Fucsia", "Amarillo oro"). Independiente de familia_id para
-- poder precargarla aunque aún no exista la familia.
alter table public.productos
  add column if not exists color_variante text;

create index if not exists idx_productos_familia on public.productos(familia_id) where familia_id is not null;

comment on table public.productos_familias is
  'Agrupa productos-color en una familia visual (Polca para niña ⊃ Polca rojo/fucsia/oro). Ver mig 65.';
comment on column public.productos.color_variante is
  'Color de este producto dentro de su familia (texto corto para el selector). Ver mig 65.';

-- RLS: staff todo; anon solo lectura (la web pública necesita resolver la
-- familia y sus hermanos publicados).
alter table public.productos_familias enable row level security;

drop policy if exists "familias_select_todos" on public.productos_familias;
create policy "familias_select_todos" on public.productos_familias
  for select using (true);

drop policy if exists "familias_all_staff" on public.productos_familias;
create policy "familias_all_staff" on public.productos_familias
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
