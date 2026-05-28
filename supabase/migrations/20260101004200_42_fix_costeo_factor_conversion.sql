-- ===========================================================================
-- HAPPY SAC — Fix costeo de materiales: aplicar factor_conversion.
-- ---------------------------------------------------------------------------
-- La función costeo_variante (mig 22) calculaba el costo de materiales como
-- rl.cantidad * m.precio_unitario, SIN dividir por factor_conversion. Eso
-- inflaba el costo cuando el precio era por unidad de COMPRA (ej. millar a
-- S/50) y la cantidad de receta estaba en unidad de CONSUMO (ej. botones).
--
-- Cálculo correcto: rl.cantidad * (m.precio_unitario / m.factor_conversion)
--
-- Mismo fix también para explosion_materiales_plan no requiere cambio porque
-- esa función NO calcula costos, solo suma cantidades por material.
-- ===========================================================================

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

  -- Dividir por factor_conversion (default 1) para convertir precio de
  -- COMPRA a precio por unidad de CONSUMO antes de multiplicar por la
  -- cantidad de la receta.
  select coalesce(sum(rl.cantidad * (m.precio_unitario / nullif(m.factor_conversion, 0))), 0) into v_costo_mat
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
