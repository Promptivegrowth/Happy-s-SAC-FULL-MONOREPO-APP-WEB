-- ===========================================================================
-- HAPPY SAC — Categorías extra para productos (red de seguridad)
-- ===========================================================================
-- Un producto sigue teniendo UNA categoría principal (`productos.categoria_id`)
-- que define su URL, código y breadcrumb. Esta tabla agrega hasta 2
-- categorías EXTRA (opcionales) para que el producto siga apareciendo en la
-- web aunque se apague la categoría principal — útil al rotar temporadas.
--
-- Reglas:
--  - Producto puede tener 0, 1 o 2 categorías extra.
--  - La extra no puede ser la misma que la principal (constraint a nivel app).
--  - Se elimina en cascada si se borra el producto o la categoría.
--  - El producto se considera publicable en la web mientras tenga AL MENOS
--    una categoría activa (principal o extra) y `productos_publicacion.publicado`
--    siga en true.
-- ===========================================================================

create table if not exists public.productos_categorias_extra (
  producto_id  uuid not null references public.productos(id)  on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  created_at   timestamptz default now(),
  primary key (producto_id, categoria_id)
);

create index if not exists idx_pce_categoria on public.productos_categorias_extra (categoria_id);

-- Constraint: máximo 2 extras por producto. Se valida con un trigger
-- (CHECK con subquery no es portable en PG).
create or replace function public.tg_pce_max_dos()
returns trigger language plpgsql as $$
declare
  v_count int;
begin
  select count(*) into v_count
    from public.productos_categorias_extra
    where producto_id = new.producto_id;
  if v_count >= 2 then
    raise exception 'Un producto solo puede tener hasta 2 categorías extra';
  end if;
  return new;
end;
$$;

drop trigger if exists pce_max_dos on public.productos_categorias_extra;
create trigger pce_max_dos
  before insert on public.productos_categorias_extra
  for each row execute function public.tg_pce_max_dos();

-- RLS: misma política que categorias_staff_full (gerente, jefe_produccion,
-- almacenero, vendedor_b2b, contador). Cliente público solo SELECT (para que
-- la web pueda leer las extras al armar listados).
alter table public.productos_categorias_extra enable row level security;

drop policy if exists pce_read on public.productos_categorias_extra;
create policy pce_read on public.productos_categorias_extra
  for select using (true);

drop policy if exists pce_staff_write on public.productos_categorias_extra;
create policy pce_staff_write on public.productos_categorias_extra
  for all
  using (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador']::rol_sistema[]
    )
  )
  with check (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador']::rol_sistema[]
    )
  );

comment on table public.productos_categorias_extra is
  'Hasta 2 categorías extras opcionales por producto. Sirven para que el producto siga apareciendo en la web cuando se apaga su categoría principal (red de seguridad por temporada).';
