-- Migración 49: poblar trazabilidad_eventos automáticamente desde kardex_movimientos
--
-- Contexto: hasta ahora trazabilidad_eventos solo se llenaba al cerrar una OT
-- (PRODUCCION). Ningún otro movimiento (VENTA, TRASLADO, DEVOLUCION, MERMA)
-- se reflejaba — la pantalla /trazabilidad mostraba "sin eventos" aunque
-- hubiera movimientos reales en kardex.
--
-- Solución: trigger AFTER INSERT en kardex_movimientos que mapea movimientos
-- de VARIANTES (prendas terminadas, no insumos) al esquema de
-- trazabilidad_eventos. Los inserts manuales de cerrar_ot_atomico siguen
-- funcionando (el trigger detecta duplicados por referencia y los omite).
--
-- Backfill al final: hace lo mismo para todos los movimientos históricos
-- de variantes que NO tengan ya un evento en trazabilidad_eventos.

-- Mapeo tipo kardex → tipo traza (solo los que vale rastrear de prendas)
create or replace function public.tg_kardex_to_traza()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_tipo text;
  v_cliente_id uuid;
  v_alm_origen uuid;
  v_alm_destino uuid;
  v_ya_existe boolean;
begin
  -- Solo movimientos de variantes (prendas terminadas), no insumos
  if new.variante_id is null then
    return new;
  end if;

  -- Mapeo
  v_tipo := case new.tipo
    when 'ENTRADA_PRODUCCION' then 'PRODUCCION'
    when 'SALIDA_VENTA' then 'VENTA'
    when 'ENTRADA_DEVOLUCION_CLIENTE' then 'DEVOLUCION'
    when 'ENTRADA_DEVOLUCION_TALLER' then 'DEVOLUCION'
    when 'SALIDA_TRASLADO' then 'TRASLADO'
    when 'ENTRADA_TRASLADO' then null  -- el SALIDA_TRASLADO ya cubre con almacen_destino
    when 'SALIDA_MERMA' then 'MERMA'
    when 'ENTRADA_AJUSTE' then 'AJUSTE_ENTRADA'
    when 'SALIDA_AJUSTE' then 'AJUSTE_SALIDA'
    else null
  end;

  if v_tipo is null then
    return new;
  end if;

  -- Evitar duplicados: si ya existe un evento para el mismo movimiento
  -- (mismo referencia_tipo + referencia_id + variante + fecha cercana), saltar.
  -- Esto evita que el insert manual de cerrar_ot_atomico se dupliqui aquí.
  if new.referencia_id is not null then
    select exists(
      select 1 from public.trazabilidad_eventos te
      where te.variante_id = new.variante_id
        and te.tipo = v_tipo
        and te.referencia_id = new.referencia_id
        and te.referencia_tipo is not distinct from new.referencia_tipo
        and te.cantidad = new.cantidad::integer
        and abs(extract(epoch from (te.fecha - new.fecha))) < 5  -- 5s de tolerancia
    ) into v_ya_existe;
    if v_ya_existe then
      return new;
    end if;
  end if;

  -- Determinar almacenes origen/destino según tipo
  if v_tipo in ('VENTA','MERMA','AJUSTE_SALIDA') then
    v_alm_origen := new.almacen_id;
    v_alm_destino := null;
  elsif v_tipo = 'TRASLADO' then
    v_alm_origen := new.almacen_id;
    v_alm_destino := new.almacen_contraparte;
  else  -- PRODUCCION, DEVOLUCION, AJUSTE_ENTRADA
    v_alm_origen := null;
    v_alm_destino := new.almacen_id;
  end if;

  -- Para ventas, buscar cliente_id desde el comprobante
  if v_tipo = 'VENTA' and new.referencia_id is not null then
    if new.referencia_tipo = 'VENTA' then
      select cliente_id into v_cliente_id from public.ventas where id = new.referencia_id;
    elsif new.referencia_tipo = 'PEDIDO_WEB' then
      -- pedido web: tiene venta_id que lleva al cliente
      select v.cliente_id into v_cliente_id
        from public.ventas v
        join public.pedidos_web pw on pw.venta_id = v.id
       where pw.id = new.referencia_id
       limit 1;
    end if;
  end if;

  insert into public.trazabilidad_eventos (
    lote_pt_id, variante_id, fecha, tipo,
    almacen_origen, almacen_destino, cliente_id,
    usuario_id, cantidad, referencia_tipo, referencia_id, observacion
  ) values (
    new.lote_pt_id,
    new.variante_id,
    new.fecha,
    v_tipo,
    v_alm_origen,
    v_alm_destino,
    v_cliente_id,
    new.usuario_id,
    coalesce(new.cantidad, 0)::integer,
    new.referencia_tipo,
    new.referencia_id,
    new.observacion
  );

  return new;
end;
$$;

grant execute on function public.tg_kardex_to_traza() to authenticated, service_role;

-- Drop trigger anterior si existe, crear de nuevo
drop trigger if exists tg_kardex_trazabilidad on public.kardex_movimientos;
create trigger tg_kardex_trazabilidad
  after insert on public.kardex_movimientos
  for each row execute function public.tg_kardex_to_traza();

-- ----------------------------------------------------------------------------
-- BACKFILL: insertar eventos para movimientos históricos que aún no estén
-- ----------------------------------------------------------------------------
-- Hacemos lo mismo que el trigger pero en batch para movimientos pasados.
-- Como el trigger es AFTER INSERT, los movimientos viejos no lo dispararon.

with mov as (
  select
    km.lote_pt_id,
    km.variante_id,
    km.fecha,
    case km.tipo::text
      when 'ENTRADA_PRODUCCION' then 'PRODUCCION'
      when 'SALIDA_VENTA' then 'VENTA'
      when 'ENTRADA_DEVOLUCION_CLIENTE' then 'DEVOLUCION'
      when 'ENTRADA_DEVOLUCION_TALLER' then 'DEVOLUCION'
      when 'SALIDA_TRASLADO' then 'TRASLADO'
      when 'SALIDA_MERMA' then 'MERMA'
      when 'ENTRADA_AJUSTE' then 'AJUSTE_ENTRADA'
      when 'SALIDA_AJUSTE' then 'AJUSTE_SALIDA'
    end as tipo_traza,
    case
      when km.tipo::text in ('SALIDA_VENTA','SALIDA_MERMA','SALIDA_AJUSTE') then km.almacen_id
      when km.tipo::text = 'SALIDA_TRASLADO' then km.almacen_id
      else null
    end as almacen_origen,
    case
      when km.tipo::text = 'SALIDA_TRASLADO' then km.almacen_contraparte
      when km.tipo::text in ('ENTRADA_PRODUCCION','ENTRADA_DEVOLUCION_CLIENTE','ENTRADA_DEVOLUCION_TALLER','ENTRADA_AJUSTE') then km.almacen_id
      else null
    end as almacen_destino,
    case
      when km.tipo::text = 'SALIDA_VENTA' and km.referencia_tipo = 'VENTA' then
        (select v.cliente_id from public.ventas v where v.id = km.referencia_id)
      when km.tipo::text = 'SALIDA_VENTA' and km.referencia_tipo = 'PEDIDO_WEB' then
        (select v.cliente_id from public.ventas v
         join public.pedidos_web pw on pw.venta_id = v.id
         where pw.id = km.referencia_id limit 1)
      else null
    end as cliente_id,
    km.usuario_id,
    coalesce(km.cantidad, 0)::integer as cantidad,
    km.referencia_tipo,
    km.referencia_id,
    km.observacion
  from public.kardex_movimientos km
  where km.variante_id is not null
    and km.tipo::text in (
      'ENTRADA_PRODUCCION','SALIDA_VENTA','ENTRADA_DEVOLUCION_CLIENTE',
      'ENTRADA_DEVOLUCION_TALLER','SALIDA_TRASLADO','SALIDA_MERMA',
      'ENTRADA_AJUSTE','SALIDA_AJUSTE'
    )
)
insert into public.trazabilidad_eventos (
  lote_pt_id, variante_id, fecha, tipo,
  almacen_origen, almacen_destino, cliente_id,
  usuario_id, cantidad, referencia_tipo, referencia_id, observacion
)
select
  m.lote_pt_id, m.variante_id, m.fecha, m.tipo_traza,
  m.almacen_origen, m.almacen_destino, m.cliente_id,
  m.usuario_id, m.cantidad, m.referencia_tipo, m.referencia_id, m.observacion
from mov m
where m.tipo_traza is not null
  and not exists (
    select 1 from public.trazabilidad_eventos te
    where te.variante_id = m.variante_id
      and te.tipo = m.tipo_traza
      and te.referencia_id is not distinct from m.referencia_id
      and te.referencia_tipo is not distinct from m.referencia_tipo
      and te.cantidad = m.cantidad
      and abs(extract(epoch from (te.fecha - m.fecha))) < 5
  );

comment on function public.tg_kardex_to_traza() is
  'Trigger AFTER INSERT en kardex_movimientos: replica movimientos de variantes a trazabilidad_eventos. Idempotente (evita duplicados).';
