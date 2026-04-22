-- ===========================================================================
-- HAPPY SAC — Recetas (BOM) versionadas por producto, con consumo por talla
-- ===========================================================================

create table if not exists public.recetas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  version text not null default 'v1.0',
  descripcion text,
  activa boolean not null default true,            -- solo una receta activa por producto
  fecha_vigencia_desde date default current_date,
  fecha_vigencia_hasta date,
  creado_por uuid references auth.users(id),
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (producto_id, version)
);
create trigger recetas_updated_at before update on public.recetas
  for each row execute function public.tg_set_updated_at();

-- Solo una receta activa por producto
create unique index recetas_unica_activa_idx on public.recetas (producto_id) where activa;

-- Líneas de receta: por material, con cantidad por talla
-- Formato del Excel del cliente: CDG_PROD | CATEGORIA | PROD_TERMINADO | CLASIFICACIÓN |
-- DESCRIPCION MATERIAL | CANTIDAD (M) | UNIDAD | ... | SI_SALE_A_SERVICIO | CANT_ALMACEN
create table if not exists public.recetas_lineas (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references public.recetas(id) on delete cascade,
  material_id uuid not null references public.materiales(id),
  talla talla_prenda not null,
  cantidad numeric(14,6) not null,
  unidad_id uuid references public.unidades_medida(id),
  sale_a_servicio boolean not null default true,  -- se envía junto con el corte al taller
  cantidad_almacen numeric(14,6) default 0,       -- lo que se queda en almacén
  observacion text,
  orden integer default 100,
  created_at timestamptz default now(),
  unique (receta_id, material_id, talla)
);
create index recetas_lineas_receta_idx on public.recetas_lineas (receta_id);
create index recetas_lineas_material_idx on public.recetas_lineas (material_id);

-- Vista conveniente: BOM activo por producto/talla
create or replace view public.v_bom_activo as
select
  p.id as producto_id,
  p.codigo as producto_codigo,
  p.nombre as producto_nombre,
  r.id as receta_id,
  r.version as receta_version,
  rl.talla,
  rl.material_id,
  m.codigo as material_codigo,
  m.nombre as material_nombre,
  m.categoria,
  rl.cantidad,
  rl.unidad_id,
  u.codigo as unidad_codigo,
  rl.sale_a_servicio,
  rl.cantidad_almacen,
  m.precio_unitario,
  (rl.cantidad * m.precio_unitario) as costo_linea
from public.recetas r
  join public.productos p on p.id = r.producto_id
  join public.recetas_lineas rl on rl.receta_id = r.id
  join public.materiales m on m.id = rl.material_id
  left join public.unidades_medida u on u.id = rl.unidad_id
where r.activa;

-- Cálculo del costo de materiales por producto/talla (suma agregada)
create or replace view public.v_costo_materiales_producto as
select
  producto_id,
  producto_codigo,
  talla,
  sum(costo_linea) as costo_materiales
from public.v_bom_activo
group by producto_id, producto_codigo, talla;
