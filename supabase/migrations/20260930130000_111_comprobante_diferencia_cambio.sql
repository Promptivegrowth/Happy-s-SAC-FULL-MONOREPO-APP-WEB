-- 111 · El comprobante de la diferencia en un cambio de prenda
--
-- Decisión de Javier (30/09/2026). En un cambio con diferencia de precio:
--   · Si el cliente PAGA una diferencia: se le emite un comprobante del MISMO
--     tipo que su compra original (boleta, factura o nota de venta) solo por
--     esa diferencia, con una línea que dice qué se cambió y a qué compra
--     corresponde.
--   · Si se le DEVUELVE plata y la compra fue con boleta o factura: nota de
--     crédito por lo devuelto (motivo 07, devolución por ítem), enlazada a la
--     compra original.
--   · Mismo precio, o nota de venta con devolución: no se emite nada; queda el
--     registro del cambio.
--
-- Todo en una función para que sea todo o nada, como la anulación (mig 108).
-- La llama la caja al registrar el cambio; solo el servidor.

create or replace function public.emitir_diferencia_cambio(
  p_venta_nueva uuid, p_devolucion uuid, p_diferencia numeric, p_usuario uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  vn public.ventas%rowtype;
  d public.devoluciones%rowtype;
  c public.comprobantes%rowtype;
  v_hay_orig boolean := false;
  v_tipo text;
  v_serie text;
  v_monto numeric := round(abs(coalesce(p_diferencia, 0)), 2);
  v_base numeric;
  v_igv numeric;
  v_id uuid;
  v_num text;
  v_desc text;
  v_ref text;
begin
  if v_monto < 0.01 then
    return jsonb_build_object('emitido', false);
  end if;

  select * into vn from public.ventas where id = p_venta_nueva;
  if not found then raise exception 'La venta del cambio no existe.'; end if;
  select * into d from public.devoluciones where id = p_devolucion;
  if not found then raise exception 'La devolución del cambio no existe.'; end if;

  -- El comprobante de la compra original.
  select c2.* into c
    from public.ventas vo
    join public.comprobantes c2 on c2.id = vo.comprobante_id
   where vo.id = d.venta_id;
  v_hay_orig := found;
  if not v_hay_orig then
    select * into c from public.comprobantes
     where venta_id = d.venta_id and tipo in ('NOTA_VENTA', 'BOLETA', 'FACTURA')
     order by created_at desc limit 1;
    v_hay_orig := found;
  end if;
  v_ref := case when v_hay_orig then c.numero_completo else (select numero from public.ventas where id = d.venta_id) end;

  v_base := round(v_monto / 1.18, 2);
  v_igv := v_monto - v_base;

  if p_diferencia > 0 then
    -- ── El cliente paga una diferencia: mismo tipo que la compra original ──
    v_tipo := case when v_hay_orig and c.tipo::text in ('BOLETA', 'FACTURA') and c.estado <> 'RECHAZADO'
                   then c.tipo::text else 'NOTA_VENTA' end;
    select serie into v_serie from public.series_comprobantes
     where tipo::text = v_tipo and caja_id = vn.caja_id and activa limit 1;
    if v_serie is null then
      select case v_tipo when 'BOLETA' then serie_boleta when 'FACTURA' then serie_factura else serie_nota_venta end
        into v_serie from public.cajas where id = vn.caja_id;
    end if;
    if v_serie is null then
      raise exception 'La caja no tiene serie de % configurada.', v_tipo;
    end if;

    select 'DIFERENCIA POR CAMBIO: ' || coalesce(string_agg(
             p.nombre || ' T-' || case pv.talla::text when 'TU' then 'UNICA' else regexp_replace(pv.talla::text, '^T', '') end,
             ', '), 'PRENDA') || ' (REF. ' || v_ref || ')'
      into v_desc
      from public.ventas_lineas l
      join public.productos_variantes pv on pv.id = l.variante_id
      join public.productos p on p.id = pv.producto_id
     where l.venta_id = vn.id;

    insert into public.comprobantes
      (tipo, serie, numero, venta_id, cliente_id, tipo_documento_cliente, numero_documento_cliente,
       razon_social_cliente, direccion_cliente, ubigeo_cliente, fecha_emision, moneda,
       sub_total, igv, total, estado, forma_pago, devolucion_id, nota_interna)
    values
      (v_tipo::tipo_comprobante, v_serie, public.next_correlativo('COMP_' || v_serie, 7)::bigint, vn.id,
       case when v_hay_orig then c.cliente_id end,
       case when v_hay_orig then c.tipo_documento_cliente end,
       case when v_hay_orig then c.numero_documento_cliente end,
       case when v_hay_orig then c.razon_social_cliente end,
       case when v_hay_orig then c.direccion_cliente end,
       case when v_hay_orig then c.ubigeo_cliente end,
       now(), 'PEN', v_base, v_igv, v_monto,
       -- La nota de venta no va a SUNAT: EMITIDO. Boleta y factura: BORRADOR,
       -- las manda el envío automático como a cualquier otra.
       case when v_tipo = 'NOTA_VENTA' then 'EMITIDO' else 'BORRADOR' end::estado_comprobante,
       'CONTADO', d.id, 'Diferencia del cambio ' || d.numero || ' sobre ' || v_ref)
    returning id, numero_completo into v_id, v_num;

    insert into public.comprobantes_lineas
      (comprobante_id, codigo, descripcion, cantidad, unidad_sunat, precio_unitario, descuento, sub_total, igv, total, afectacion_igv)
    values (v_id, 'CAMBIO', left(upper(v_desc), 250), 1, 'NIU', v_monto, 0, v_base, v_igv, v_monto, '10');

    update public.ventas set comprobante_id = v_id where id = vn.id;
    return jsonb_build_object('emitido', true, 'tipo', v_tipo, 'numero', v_num, 'monto', v_monto);
  end if;

  -- ── Se le devuelve plata al cliente ──────────────────────────────────────
  if not v_hay_orig or c.tipo::text not in ('BOLETA', 'FACTURA') or c.estado in ('ANULADO', 'RECHAZADO') then
    return jsonb_build_object('emitido', false);
  end if;

  select serie into v_serie from public.series_comprobantes
   where tipo = 'NOTA_CREDITO' and activa and serie like (case c.tipo::text when 'FACTURA' then 'F%' else 'B%' end)
   order by serie limit 1;
  if v_serie is null then
    raise exception 'No hay una serie de nota de crédito activa para %.', lower(c.tipo::text);
  end if;

  select 'DEVOLUCION POR CAMBIO: ' || coalesce(string_agg(
           p.nombre || ' T-' || case pv.talla::text when 'TU' then 'UNICA' else regexp_replace(pv.talla::text, '^T', '') end,
           ', '), 'PRENDA') || ' (REF. ' || v_ref || ')'
    into v_desc
    from public.devoluciones_lineas l
    join public.productos_variantes pv on pv.id = l.variante_id
    join public.productos p on p.id = pv.producto_id
   where l.devolucion_id = d.id;

  insert into public.comprobantes
    (tipo, serie, numero, cliente_id, tipo_documento_cliente, numero_documento_cliente,
     razon_social_cliente, direccion_cliente, ubigeo_cliente, fecha_emision, moneda,
     sub_total, igv, total, estado, forma_pago, documento_referencia_id, motivo_nc_nd, devolucion_id, nota_interna)
  values
    ('NOTA_CREDITO', v_serie, public.next_correlativo('COMP_' || v_serie, 7)::bigint,
     c.cliente_id, c.tipo_documento_cliente, c.numero_documento_cliente,
     c.razon_social_cliente, c.direccion_cliente, c.ubigeo_cliente, now(), 'PEN',
     v_base, v_igv, v_monto, 'BORRADOR', 'CONTADO', c.id, '07', d.id,
     'Vuelto del cambio ' || d.numero || ' sobre ' || v_ref)
  returning id, numero_completo into v_id, v_num;

  insert into public.comprobantes_lineas
    (comprobante_id, codigo, descripcion, cantidad, unidad_sunat, precio_unitario, descuento, sub_total, igv, total, afectacion_igv)
  values (v_id, 'CAMBIO', left(upper(v_desc), 250), 1, 'NIU', v_monto, 0, v_base, v_igv, v_monto, '10');

  update public.devoluciones set nota_credito_id = v_id where id = d.id;
  return jsonb_build_object('emitido', true, 'tipo', 'NOTA_CREDITO', 'numero', v_num, 'monto', v_monto);
end;
$$;

revoke all on function public.emitir_diferencia_cambio(uuid, uuid, numeric, uuid) from public, anon, authenticated;
grant execute on function public.emitir_diferencia_cambio(uuid, uuid, numeric, uuid) to service_role;
