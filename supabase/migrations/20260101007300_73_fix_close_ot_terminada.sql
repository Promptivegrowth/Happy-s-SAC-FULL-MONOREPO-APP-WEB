-- FIX CRÍTICO (reportado 21/07/2026): ninguna OT generaba stock de Producto
-- Terminado. La columna ot_lineas.cantidad_terminada tiene DEFAULT 0 (no null),
-- así que en close_ot_atomic el `coalesce(cantidad_terminada, cantidad_cortada)`
-- siempre tomaba 0 → cada línea daba `0 - fallas <= 0` y se saltaba, creando el
-- ingreso PT vacío (0 lotes) y dejando terminado en 0 sin stock.
--
-- Solución: tratar cantidad_terminada = 0 como "no declarado" con nullif(), de
-- modo que caiga a cantidad_cortada. Así terminada = cortada - fallas, salvo que
-- se haya declarado explícitamente un terminado > 0 (override manual).
CREATE OR REPLACE FUNCTION public.close_ot_atomic(p_ot_id uuid, p_almacen_destino uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_estado text;
  v_numero text;
  v_total_cortado numeric := 0;
  v_ingreso_id uuid;
  v_num_ingreso text;
  v_lotes_creados int := 0;
  v_linea record;
  v_variante record;
  v_cant_terminada numeric;
  v_num_lote text;
  v_codigo_lote text;
  v_lote_id uuid;
begin
  -- 1) Lock + estado
  select estado, numero into v_estado, v_numero
  from public.ot
  where id = p_ot_id
  for update;

  if v_estado is null then
    raise exception 'OT no encontrada';
  end if;
  if v_estado <> 'EN_CONTROL_CALIDAD' then
    raise exception 'La OT debe estar en estado "Control de Calidad" para cerrarse (actualmente: %)',
      replace(v_estado, '_', ' ');
  end if;

  -- 2) Verificar líneas y total cortado
  select coalesce(sum(cantidad_cortada), 0) into v_total_cortado
  from public.ot_lineas
  where ot_id = p_ot_id;

  if v_total_cortado <= 0 then
    raise exception 'Declara la cantidad cortada en al menos una línea antes de cerrar la OT';
  end if;

  -- 3) Validar cantidades (nullif: 0 en terminada = no declarado → usa cortada)
  for v_linea in
    select id, talla, cantidad_planificada,
           coalesce(nullif(cantidad_terminada, 0), cantidad_cortada, 0) - coalesce(cantidad_fallas, 0) as cant_neta
      from public.ot_lineas
     where ot_id = p_ot_id
  loop
    if v_linea.cant_neta > v_linea.cantidad_planificada then
      raise exception 'Línea %: cantidad terminada (%) supera planificada (%). Revisá la declaración antes de cerrar.',
        v_linea.talla, v_linea.cant_neta, v_linea.cantidad_planificada;
    end if;
  end loop;

  -- 4) Crear ingreso PT
  select public.next_correlativo('INGPT', 6) into v_num_ingreso;
  insert into public.ingresos_pt (numero, ot_id, almacen_destino, declarado_por, observacion)
  values ('INGPT-' || v_num_ingreso, p_ot_id, p_almacen_destino, p_user_id,
          'Cierre de OT ' || v_numero)
  returning id into v_ingreso_id;

  -- 5) Por cada línea con cantidad terminada > 0
  for v_linea in
    select id, producto_id, talla, cantidad_planificada,
           cantidad_cortada, cantidad_terminada, cantidad_fallas
      from public.ot_lineas
     where ot_id = p_ot_id
  loop
    -- nullif: si terminada quedó en 0 (default), usar lo cortado.
    v_cant_terminada := coalesce(nullif(v_linea.cantidad_terminada, 0), v_linea.cantidad_cortada, 0)
                      - coalesce(v_linea.cantidad_fallas, 0);
    if v_cant_terminada <= 0 then
      continue;
    end if;

    -- Variante (producto + talla)
    select id, sku, precio_costo_estandar into v_variante
    from public.productos_variantes
    where producto_id = v_linea.producto_id and talla = v_linea.talla
    limit 1;
    if v_variante.id is null then
      continue;
    end if;

    -- Lote PT
    select public.next_correlativo('LOTPT', 6) into v_num_lote;
    v_codigo_lote := 'LT-' || to_char(now(), 'YYYYMMDD') || '-' || v_variante.sku || '-' || v_num_lote;

    insert into public.lotes_pt (
      codigo, ot_id, ingreso_pt_id, variante_id,
      cantidad_inicial, cantidad_actual, costo_unitario, almacen_actual, estado
    ) values (
      v_codigo_lote, p_ot_id, v_ingreso_id, v_variante.id,
      v_cant_terminada, v_cant_terminada, v_variante.precio_costo_estandar,
      p_almacen_destino, 'DISPONIBLE'
    ) returning id into v_lote_id;

    -- Línea de ingreso
    insert into public.ingresos_pt_lineas (
      ingreso_id, variante_id, cantidad, cantidad_falla,
      costo_unitario_total, lote_pt_id
    ) values (
      v_ingreso_id, v_variante.id, v_cant_terminada,
      coalesce(v_linea.cantidad_fallas, 0), v_variante.precio_costo_estandar, v_lote_id
    );

    -- Kardex
    insert into public.kardex_movimientos (
      tipo, almacen_id, variante_id, cantidad, costo_unitario, costo_total,
      referencia_tipo, referencia_id, usuario_id, lote_pt_id, observacion
    ) values (
      'ENTRADA_PRODUCCION', p_almacen_destino, v_variante.id, v_cant_terminada,
      v_variante.precio_costo_estandar,
      v_cant_terminada * coalesce(v_variante.precio_costo_estandar, 0),
      'INGRESO_PT', v_ingreso_id, p_user_id, v_lote_id,
      'Cierre OT ' || v_numero
    );

    -- Trazabilidad
    insert into public.trazabilidad_eventos (
      lote_pt_id, variante_id, tipo, almacen_destino, ot_id, usuario_id,
      cantidad, observacion
    ) values (
      v_lote_id, v_variante.id, 'PRODUCCION', p_almacen_destino, p_ot_id, p_user_id,
      v_cant_terminada, 'Producción cerrada de OT ' || v_numero
    );

    -- Actualizar línea con cantidad_terminada efectiva
    update public.ot_lineas
       set cantidad_terminada = v_cant_terminada
     where id = v_linea.id;

    v_lotes_creados := v_lotes_creados + 1;
  end loop;

  -- 6) Marcar OT como COMPLETADA + evento
  update public.ot
     set estado = 'COMPLETADA',
         fecha_cierre = current_date
   where id = p_ot_id;

  insert into public.ot_eventos (
    ot_id, tipo, estado_nuevo, usuario_id, detalle
  ) values (
    p_ot_id, 'ESTADO_CAMBIO', 'COMPLETADA', p_user_id,
    'Cierre de OT con ' || v_lotes_creados || ' lote(s) PT generados'
  );

  return jsonb_build_object('lotes', v_lotes_creados);
end;
$function$;
