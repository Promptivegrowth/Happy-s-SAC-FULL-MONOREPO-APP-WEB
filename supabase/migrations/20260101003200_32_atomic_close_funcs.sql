-- ===========================================================================
-- HAPPY SAC — Cierres atómicos para Corte y OT (PL/pgSQL)
-- ===========================================================================
-- Reemplazan la lógica del server action que hacía múltiples awaits sin
-- transacción. Ahora todo el cierre va dentro de una función SQL: si algo
-- falla, Postgres revierte automáticamente y los números correlativos
-- consumidos se liberan junto al rollback.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- close_corte_atomic(corte_id)
--   1. Verifica que el corte exista y esté ABIERTO o EN_PROCESO.
--   2. Suma cantidad_real (por talla) a ot_lineas.cantidad_cortada de la OT
--      del mismo producto.
--   3. Marca el corte como COMPLETADO con fecha_fin = now().
-- Retorna jsonb con el conteo de líneas sincronizadas.
-- ---------------------------------------------------------------------------
create or replace function public.close_corte_atomic(p_corte_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_estado text;
  v_ot_id uuid;
  v_producto_id uuid;
  v_synced int;
begin
  -- Lock + lectura del corte
  select estado, ot_id, producto_id
    into v_estado, v_ot_id, v_producto_id
  from public.ot_corte
  where id = p_corte_id
  for update;

  if v_estado is null then
    raise exception 'Corte no encontrado';
  end if;
  if v_estado = 'COMPLETADO' then
    raise exception 'Este corte ya está cerrado';
  end if;
  if v_estado = 'ANULADO' then
    raise exception 'No se puede cerrar un corte anulado';
  end if;

  -- Sincronizar cantidad_cortada en ot_lineas: para cada talla del corte,
  -- suma cantidad_real al cantidad_cortada de la línea de la OT que matchea
  -- producto + talla.
  with agregados as (
    select talla, coalesce(sum(cantidad_real), 0) as total
    from public.ot_corte_lineas
    where corte_id = p_corte_id and cantidad_real > 0
    group by talla
  ),
  upd as (
    update public.ot_lineas l
       set cantidad_cortada = coalesce(l.cantidad_cortada, 0) + a.total
      from agregados a
     where l.ot_id = v_ot_id
       and l.producto_id = v_producto_id
       and l.talla = a.talla
       and a.total > 0
    returning l.id
  )
  select count(*) into v_synced from upd;

  update public.ot_corte
     set estado = 'COMPLETADO',
         fecha_fin = now()
   where id = p_corte_id;

  return jsonb_build_object('ot_lineas_sync', v_synced);
end;
$$;

revoke all on function public.close_corte_atomic(uuid) from public;
grant execute on function public.close_corte_atomic(uuid) to authenticated;

comment on function public.close_corte_atomic(uuid) is
  'Cierra un corte y sincroniza atómicamente las cantidades cortadas en la OT correspondiente.';

-- ---------------------------------------------------------------------------
-- close_ot_atomic(ot_id, almacen_destino_id, user_id)
--   Lógica antes en JS (server action cerrarOT):
--     1. Valida que la OT esté EN_CONTROL_CALIDAD.
--     2. Valida cantidades (no superar planificada).
--     3. Crea ingresos_pt + por cada línea con cantidad terminada > 0:
--          - lotes_pt
--          - ingresos_pt_lineas
--          - kardex_movimientos (ENTRADA_PRODUCCION)
--          - trazabilidad_eventos (PRODUCCION)
--          - update ot_lineas.cantidad_terminada
--     4. Marca OT como COMPLETADA + evento.
--   Si algo falla en cualquier paso, ROLLBACK total — sin lotes huérfanos.
-- ---------------------------------------------------------------------------
create or replace function public.close_ot_atomic(
  p_ot_id uuid,
  p_almacen_destino uuid,
  p_user_id uuid
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_estado text;
  v_numero text;
  v_total_cortado numeric := 0;
  v_lote_max numeric;
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

  -- 3) Validar cantidades
  for v_linea in
    select id, talla, cantidad_planificada,
           coalesce(cantidad_terminada, cantidad_cortada, 0) - coalesce(cantidad_fallas, 0) as cant_neta
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
    v_cant_terminada := coalesce(v_linea.cantidad_terminada, v_linea.cantidad_cortada, 0)
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
$$;

revoke all on function public.close_ot_atomic(uuid, uuid, uuid) from public;
grant execute on function public.close_ot_atomic(uuid, uuid, uuid) to authenticated;

comment on function public.close_ot_atomic(uuid, uuid, uuid) is
  'Cierra una OT atómicamente: ingreso PT + lotes + kardex + trazabilidad. Si falla, ROLLBACK total.';
