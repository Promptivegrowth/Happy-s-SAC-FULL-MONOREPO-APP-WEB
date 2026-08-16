-- Migración 81: vista de stock de MATERIALES por almacén.
--
-- El modelo de datos de stock de material ya existe (stock_actual.material_id +
-- kardex_movimientos.material_id + trigger tg_actualizar_stock). Faltaba una
-- vista operativa para verlo por almacén (análoga a v_stock_alertas de variantes).
-- Pedido del cliente 2026-08-16: hacer funcionar el Almacén de Materia Prima.

create or replace view public.v_stock_material as
select
  sa.almacen_id,
  al.codigo               as almacen_codigo,
  al.nombre               as almacen_nombre,
  al.tipo                 as almacen_tipo,
  sa.material_id,
  m.codigo                as material_codigo,
  m.nombre                as material_nombre,
  m.categoria             as categoria,
  um.codigo               as unidad,
  m.precio_unitario       as precio_unitario,
  m.stock_minimo          as stock_minimo,
  m.stock_maximo          as stock_maximo,
  sum(sa.cantidad)        as cantidad,
  case when sum(sa.cantidad) > 0
       then sum(sa.cantidad * coalesce(sa.costo_promedio, 0)) / sum(sa.cantidad)
       else max(sa.costo_promedio)
  end                     as costo_promedio
from public.stock_actual sa
join public.materiales m   on m.id = sa.material_id
join public.almacenes al   on al.id = sa.almacen_id
left join public.unidades_medida um on um.id = m.unidad_consumo_id
where sa.material_id is not null
group by
  sa.almacen_id, al.codigo, al.nombre, al.tipo,
  sa.material_id, m.codigo, m.nombre, m.categoria,
  um.codigo, m.precio_unitario, m.stock_minimo, m.stock_maximo;

grant select on public.v_stock_material to authenticated;
grant select on public.v_stock_material to service_role;
