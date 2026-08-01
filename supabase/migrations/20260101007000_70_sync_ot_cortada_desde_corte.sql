-- Mig 70 — La OT jala en vivo las unidades cortadas declaradas en el/los
-- corte(s). Pedido del cliente (21/07/2026): "las órdenes de trabajo deben
-- jalar las unidades cortadas declaradas en la orden de corte".
--
-- Antes: close_corte_atomic SUMABA cantidad_real a ot_lineas.cantidad_cortada
-- SOLO al cerrar el corte (y sumar podía duplicar entre cortes). Ahora:
-- cantidad_cortada = SUMA de la cantidad_real de TODOS los cortes NO anulados
-- de esa OT+producto+talla. Se recalcula al declarar en el corte y al cerrar.

create or replace function public.sync_ot_cortada(p_ot_id uuid, p_producto_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas integer;
begin
  update public.ot_lineas l
     set cantidad_cortada = coalesce((
       select sum(cl.cantidad_real)
       from public.ot_corte c
       join public.ot_corte_lineas cl on cl.corte_id = c.id
       where c.ot_id = p_ot_id
         and c.producto_id = p_producto_id
         and cl.talla = l.talla
         and cl.cantidad_real is not null
         and c.estado <> 'ANULADO'
     ), 0)
   where l.ot_id = p_ot_id
     and l.producto_id = p_producto_id;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

-- close_corte_atomic ahora RECALCULA (no suma) vía sync_ot_cortada.
create or replace function public.close_corte_atomic(p_corte_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_estado text;
  v_ot_id uuid;
  v_producto_id uuid;
  v_synced int;
begin
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

  update public.ot_corte
     set estado = 'COMPLETADO',
         fecha_fin = now()
   where id = p_corte_id;

  -- Recalcular las unidades cortadas de la OT desde TODOS sus cortes.
  v_synced := public.sync_ot_cortada(v_ot_id, v_producto_id);

  return jsonb_build_object('ot_lineas_sync', v_synced);
end;
$$;
