-- ===========================================================================
-- HAPPY SAC — Funciones de negocio + vistas para dashboards y reportes
-- ===========================================================================

-- ==========================================================================
-- 1) Explosión de materiales del plan maestro
-- ==========================================================================
create or replace function public.explosion_materiales_plan(p_plan uuid)
  returns table (
    material_id uuid,
    material_codigo text,
    material_nombre text,
    categoria categoria_material,
    unidad text,
    cantidad_total numeric
  )
  language sql stable as $$
  select
    m.id,
    m.codigo,
    m.nombre,
    m.categoria,
    coalesce(u.codigo, ''),
    sum(rl.cantidad * pml.cantidad_planificada)
  from public.plan_maestro_lineas pml
    join public.recetas r on r.producto_id = pml.producto_id and r.activa
    join public.recetas_lineas rl on rl.receta_id = r.id and rl.talla = pml.talla
    join public.materiales m on m.id = rl.material_id
    left join public.unidades_medida u on u.id = rl.unidad_id
  where pml.plan_id = p_plan
  group by m.id, m.codigo, m.nombre, m.categoria, u.codigo
  order by m.categoria, m.nombre;
$$;

-- ==========================================================================
-- 2) Costeo total de variante (materiales + servicios + indirectos)
-- ==========================================================================
create or replace function public.costeo_variante(p_variante uuid)
  returns table (
    costo_materiales numeric,
    costo_confeccion numeric,
    costo_indirectos numeric,
    costo_total numeric
  )
  language plpgsql stable as $$
declare
  v_producto uuid;
  v_talla talla_prenda;
  v_costo_mat numeric := 0;
  v_costo_conf numeric := 0;
  v_costo_ind numeric := 0;
begin
  select producto_id, talla into v_producto, v_talla
  from public.productos_variantes where id = p_variante;

  select coalesce(sum(rl.cantidad * m.precio_unitario), 0) into v_costo_mat
  from public.recetas r
    join public.recetas_lineas rl on rl.receta_id = r.id
    join public.materiales m on m.id = rl.material_id
  where r.producto_id = v_producto and r.activa and rl.talla = v_talla;

  select coalesce(public.costo_confeccion(v_producto, v_talla), 0) into v_costo_conf;

  -- Costo indirecto simplificado: 5% del costo materiales (placeholder)
  v_costo_ind := v_costo_mat * 0.05;

  return query select v_costo_mat, v_costo_conf, v_costo_ind, (v_costo_mat + v_costo_conf + v_costo_ind);
end;
$$;

-- ==========================================================================
-- 3) Generador de número OT con prefijo según año
-- ==========================================================================
create or replace function public.generar_numero_ot()
  returns text language sql as $$
  select 'OT-' || to_char(current_date,'YY') || '-' || public.next_correlativo('OT_' || to_char(current_date,'YY'), 5);
$$;

create or replace function public.generar_numero_oc()
  returns text language sql as $$
  select 'OC-' || to_char(current_date,'YY') || '-' || public.next_correlativo('OC_' || to_char(current_date,'YY'), 5);
$$;

create or replace function public.generar_numero_pedido_web()
  returns text language sql as $$
  select 'WEB-' || to_char(current_date,'YYMM') || '-' || public.next_correlativo('WEB_' || to_char(current_date,'YYMM'), 5);
$$;

create or replace function public.generar_numero_reclamo()
  returns text language sql as $$
  select 'REC-' || to_char(current_date,'YYYY') || '-' || public.next_correlativo('REC_' || to_char(current_date,'YYYY'), 5);
$$;

-- ==========================================================================
-- 4) Stock por tienda + alertas
-- ==========================================================================
create or replace view public.v_stock_alertas as
select
  sa.almacen_id,
  a.nombre as almacen,
  sa.variante_id,
  pv.sku,
  p.nombre as producto,
  pv.talla,
  sa.cantidad,
  m_metric.stock_minimo
from public.stock_actual sa
  join public.almacenes a on a.id = sa.almacen_id
  join public.productos_variantes pv on pv.id = sa.variante_id
  join public.productos p on p.id = pv.producto_id
  cross join lateral (select 5::numeric as stock_minimo) m_metric  -- TODO: stock mínimo por variante/almacén
where sa.variante_id is not null
  and sa.cantidad <= 5;

-- ==========================================================================
-- 5) KPIs dashboard gerencial
-- ==========================================================================
create or replace view public.v_kpi_ventas_dia as
select
  date_trunc('day', fecha) as dia,
  canal,
  count(*) as ventas_count,
  sum(total) as monto_total
from public.ventas
where estado = 'COMPLETADA'
group by date_trunc('day', fecha), canal
order by dia desc;

create or replace view public.v_top_productos as
select
  pv.producto_id,
  p.nombre as producto,
  count(distinct vl.venta_id) as ventas_count,
  sum(vl.cantidad) as unidades_vendidas,
  sum(vl.sub_total) as monto_total
from public.ventas_lineas vl
  join public.productos_variantes pv on pv.id = vl.variante_id
  join public.productos p on p.id = pv.producto_id
  join public.ventas v on v.id = vl.venta_id and v.estado = 'COMPLETADA'
where v.fecha >= now() - interval '90 days'
group by pv.producto_id, p.nombre
order by monto_total desc;

create or replace view public.v_ots_pendientes as
select
  o.id,
  o.numero,
  o.estado,
  o.fecha_apertura,
  o.fecha_entrega_objetivo,
  o.fecha_entrega_objetivo - current_date as dias_restantes,
  case
    when o.fecha_entrega_objetivo < current_date then true
    else false
  end as atrasada,
  sum(ol.cantidad_planificada) as cantidad_planificada,
  sum(ol.cantidad_terminada) as cantidad_terminada
from public.ot o
  left join public.ot_lineas ol on ol.ot_id = o.id
where o.estado not in ('COMPLETADA','CANCELADA')
group by o.id;

-- ==========================================================================
-- 6) Trazabilidad: timeline de un lote
-- ==========================================================================
create or replace function public.timeline_lote(p_lote uuid)
  returns table (
    fecha timestamptz,
    tipo text,
    descripcion text,
    cantidad integer,
    almacen_origen text,
    almacen_destino text,
    operario text,
    cliente text
  )
  language sql stable as $$
  select
    e.fecha,
    e.tipo,
    case e.tipo
      when 'PRODUCCION' then 'Producido en OT ' || coalesce((select numero from public.ot where id = e.ot_id), '')
      when 'TRASLADO' then 'Trasladado'
      when 'VENTA' then 'Vendido'
      else e.tipo
    end,
    e.cantidad,
    (select nombre from public.almacenes where id = e.almacen_origen),
    (select nombre from public.almacenes where id = e.almacen_destino),
    (select nombres || ' ' || coalesce(apellido_paterno,'') from public.operarios where id = e.operario_id),
    (select coalesce(razon_social, nombres) from public.clientes where id = e.cliente_id)
  from public.trazabilidad_eventos e
  where e.lote_pt_id = p_lote
  order by e.fecha;
$$;
