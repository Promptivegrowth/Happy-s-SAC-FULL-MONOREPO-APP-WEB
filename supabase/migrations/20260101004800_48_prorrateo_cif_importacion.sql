-- Migración 48: prorrateo CIF en importaciones
--
-- Objetivo: distribuir los costos adicionales de una importación (flete,
-- seguro, aduanas, otros_costos) sobre las líneas de las OCs vinculadas
-- proporcionalmente al valor FOB de cada línea.
--
-- Resultado: cada `oc_recepciones_lineas` recibe:
--   - `costo_adicional_prorrateado` (monto absoluto del CIF que le toca, en PEN)
--   - `costo_unitario_cif` (= costo_unitario + costo_adicional_prorrateado / cantidad)
--
-- IMPORTANTE: NO se tocan `kardex_movimientos` (el kardex es histórico y refleja
-- el costo FOB al momento de la recepción). El `costo_unitario_cif` queda
-- disponible para reportes de valuación y se usa como referencia para actualizar
-- `materiales.precio_unitario` al cierre de la importación.
--
-- Idempotente: ejecutar dos veces da el mismo resultado. Se puede re-ejecutar
-- si después se ajustan los costos adicionales (siempre que la importación no
-- esté CANCELADA).

alter table public.oc_recepciones_lineas
  add column if not exists costo_adicional_prorrateado numeric(12,4) default 0,
  add column if not exists costo_unitario_cif numeric(12,4);

alter table public.importaciones
  add column if not exists cif_prorrateado_en timestamptz,
  add column if not exists cif_prorrateado_por uuid references auth.users(id),
  add column if not exists cif_total_distribuido numeric(14,2) default 0;

-- Función principal de prorrateo
-- Devuelve JSON con resumen { ok, lineas_actualizadas, costo_total_distribuido,
-- valor_fob_total, materiales_actualizados, mensaje }
create or replace function public.prorratear_cif_importacion(p_imp_id uuid)
  returns json
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_imp record;
  v_costo_adicional_pen numeric(14,2);
  v_valor_fob_total numeric(14,2);
  v_lineas_actualizadas int := 0;
  v_materiales_actualizados int := 0;
  v_total_distribuido numeric(14,2) := 0;
  r record;
  v_peso numeric(20,10);
  v_prorrateo_linea numeric(14,4);
  v_costo_cif numeric(14,4);
begin
  -- 1. Leer importación
  select * into v_imp from public.importaciones where id = p_imp_id;
  if v_imp is null then
    return json_build_object('ok', false, 'mensaje', 'Importación no encontrada');
  end if;
  if v_imp.estado = 'CANCELADA' then
    return json_build_object('ok', false, 'mensaje', 'Importación cancelada — no se puede prorratear');
  end if;

  -- 2. Calcular costos adicionales totales en PEN
  v_costo_adicional_pen := (
    coalesce(v_imp.flete, 0) +
    coalesce(v_imp.seguro, 0) +
    coalesce(v_imp.aduanas, 0) +
    coalesce(v_imp.otros_costos, 0)
  ) * coalesce(v_imp.tipo_cambio, 1);

  if v_costo_adicional_pen <= 0 then
    return json_build_object(
      'ok', true,
      'lineas_actualizadas', 0,
      'costo_total_distribuido', 0,
      'mensaje', 'Sin costos adicionales para prorratear'
    );
  end if;

  -- 3. Calcular valor FOB total de líneas recibidas en OCs vinculadas
  --    Valor FOB = cantidad_recibida × costo_unitario (en moneda local de OC,
  --    convertido a PEN con tipo_cambio si la OC no es en PEN).
  select coalesce(sum(
    rl.cantidad_recibida * coalesce(rl.costo_unitario, 0)
    * coalesce(case when oc.moneda = 'PEN' then 1 else oc.tipo_cambio end, 1)
  ), 0)
  into v_valor_fob_total
  from public.oc_recepciones_lineas rl
  join public.oc_recepciones rc on rc.id = rl.recepcion_id
  join public.oc on oc.id = rc.oc_id
  where oc.importacion_id = p_imp_id
    and coalesce(rl.costo_unitario, 0) > 0;

  if v_valor_fob_total <= 0 then
    return json_build_object(
      'ok', false,
      'mensaje', 'No hay líneas recibidas con costo unitario > 0. Registre recepciones antes de prorratear.'
    );
  end if;

  -- 4. Para cada línea de recepción, calcular el prorrateo
  for r in
    select rl.id, rl.cantidad_recibida, rl.costo_unitario, rl.material_id,
           oc.moneda, oc.tipo_cambio as oc_tc
    from public.oc_recepciones_lineas rl
    join public.oc_recepciones rc on rc.id = rl.recepcion_id
    join public.oc on oc.id = rc.oc_id
    where oc.importacion_id = p_imp_id
      and coalesce(rl.costo_unitario, 0) > 0
  loop
    -- Valor FOB de esta línea en PEN
    v_peso := (
      r.cantidad_recibida * r.costo_unitario
      * coalesce(case when r.moneda = 'PEN' then 1 else r.oc_tc end, 1)
    ) / v_valor_fob_total;
    v_prorrateo_linea := round((v_peso * v_costo_adicional_pen)::numeric, 4);
    v_costo_cif := r.costo_unitario + (v_prorrateo_linea / nullif(r.cantidad_recibida, 0));

    update public.oc_recepciones_lineas
       set costo_adicional_prorrateado = v_prorrateo_linea,
           costo_unitario_cif = v_costo_cif
     where id = r.id;

    v_total_distribuido := v_total_distribuido + v_prorrateo_linea;
    v_lineas_actualizadas := v_lineas_actualizadas + 1;
  end loop;

  -- 5. Actualizar materiales.precio_unitario con el costo CIF más reciente
  --    (toma el último costo CIF de cada material en esta importación)
  with ultimos as (
    select distinct on (rl.material_id)
      rl.material_id, rl.costo_unitario_cif
    from public.oc_recepciones_lineas rl
    join public.oc_recepciones rc on rc.id = rl.recepcion_id
    join public.oc on oc.id = rc.oc_id
    where oc.importacion_id = p_imp_id
      and rl.material_id is not null
      and rl.costo_unitario_cif is not null
    order by rl.material_id, rc.fecha desc
  )
  update public.materiales m
     set precio_unitario = u.costo_unitario_cif
    from ultimos u
   where m.id = u.material_id;
  get diagnostics v_materiales_actualizados = row_count;

  -- 6. Marcar importación como prorrateada
  update public.importaciones
     set cif_prorrateado_en = now(),
         cif_prorrateado_por = auth.uid(),
         cif_total_distribuido = v_total_distribuido
   where id = p_imp_id;

  return json_build_object(
    'ok', true,
    'lineas_actualizadas', v_lineas_actualizadas,
    'costo_total_distribuido', v_total_distribuido,
    'valor_fob_total', v_valor_fob_total,
    'materiales_actualizados', v_materiales_actualizados,
    'mensaje', format('CIF distribuido: S/ %s en %s líneas', round(v_total_distribuido, 2), v_lineas_actualizadas)
  );
end;
$$;

grant execute on function public.prorratear_cif_importacion(uuid) to authenticated, service_role;

comment on function public.prorratear_cif_importacion(uuid) is
  'Distribuye flete + seguro + aduanas + otros_costos de una importación proporcionalmente al valor FOB de cada línea de recepción vinculada. Idempotente.';
