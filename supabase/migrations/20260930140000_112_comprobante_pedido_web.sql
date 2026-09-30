-- 112 · Boleta o factura de los pedidos web
--
-- Hasta hoy un pedido web se preparaba (venta + stock) pero nunca se emitía su
-- comprobante: no había boleta ni factura para el cliente ni nada que informar
-- a SUNAT. Desde ahora se emite al preparar el pedido, con la serie web:
--   · Factura si el cliente pidió factura y compró con RUC.
--   · Boleta en todos los demás casos.
-- Lleva una línea por prenda y, si hubo envío, una línea por el servicio. Si
-- hubo descuento, se reparte entre las prendas para que el comprobante sume
-- exactamente lo que pagó el cliente. Queda en BORRADOR: la factura la manda el
-- envío automático al momento; la boleta va en el resumen diario.

create or replace function public.emitir_comprobante_pedido_web(p_pedido uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  pw public.pedidos_web%rowtype;
  cl public.clientes%rowtype;
  v_hay_cli boolean := false;
  v_tipo text;
  v_serie text;
  v_id uuid;
  v_num text;
  v_ruc text;
  v_nombre text;
  v_bruto numeric;
  v_desc numeric;
  v_acum numeric := 0;
  v_n int;
  v_i int := 0;
  v_linea_desc numeric;
  v_linea_total numeric;
  v_base numeric;
  v_suma numeric;
  l record;
begin
  select * into pw from public.pedidos_web where id = p_pedido for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if pw.venta_id is null then raise exception 'El pedido todavía no tiene venta: primero se prepara.'; end if;

  -- Ya tenía comprobante: no se emite otro.
  if pw.comprobante_id is not null then
    select numero_completo, tipo::text into v_num, v_tipo from public.comprobantes where id = pw.comprobante_id;
    return jsonb_build_object('emitido', false, 'tipo', v_tipo, 'numero', v_num);
  end if;

  if pw.cliente_id is not null then
    select * into cl from public.clientes where id = pw.cliente_id;
    v_hay_cli := found;
  end if;
  v_ruc := case when v_hay_cli and cl.tipo_documento::text = 'RUC' then cl.numero_documento end;
  v_tipo := case when pw.necesita_factura and v_ruc ~ '^\d{11}$' then 'FACTURA' else 'BOLETA' end;
  v_nombre := coalesce(
    nullif(btrim(case when v_hay_cli then coalesce(nullif(cl.razon_social, ''), concat_ws(' ', cl.nombres, cl.apellido_paterno, cl.apellido_materno)) end), ''),
    nullif(btrim(pw.contacto_nombre), ''),
    'CLIENTE VARIOS');

  select serie into v_serie from public.series_comprobantes
   where tipo::text = v_tipo and canal::text = 'WEB' and activa
   order by serie limit 1;
  if v_serie is null then
    raise exception 'No hay una serie web de % activa (Configuración → Series).', lower(v_tipo);
  end if;

  insert into public.comprobantes
    (tipo, serie, numero, venta_id, pedido_web_id, cliente_id, tipo_documento_cliente, numero_documento_cliente,
     razon_social_cliente, direccion_cliente, ubigeo_cliente, fecha_emision, moneda,
     sub_total, igv, total, estado, forma_pago, nota_interna)
  values
    (v_tipo::tipo_comprobante, v_serie, public.next_correlativo('COMP_' || v_serie, 7)::bigint, pw.venta_id, pw.id,
     pw.cliente_id,
     case when v_hay_cli then cl.tipo_documento end,
     case when v_hay_cli then cl.numero_documento end,
     upper(v_nombre),
     coalesce(case when v_hay_cli then nullif(cl.direccion, '') end, pw.direccion_entrega),
     coalesce(pw.ubigeo_entrega, case when v_hay_cli then cl.ubigeo end),
     now(), 'PEN', 0, 0, 0, 'BORRADOR', 'CONTADO', 'Pedido web ' || pw.numero)
  returning id, numero_completo into v_id, v_num;

  -- Prendas, con el descuento repartido en proporción (la última se lleva el redondeo).
  select coalesce(sum(cantidad * precio_unitario), 0), count(*) into v_bruto, v_n
    from public.pedidos_web_lineas where pedido_id = pw.id;
  v_desc := greatest(coalesce(pw.descuento, 0), 0);

  for l in
    select pl.variante_id, pl.cantidad, pl.precio_unitario, p.codigo, p.nombre, pv.talla::text as talla
      from public.pedidos_web_lineas pl
      join public.productos_variantes pv on pv.id = pl.variante_id
      join public.productos p on p.id = pv.producto_id
     where pl.pedido_id = pw.id
     order by pl.id
  loop
    v_i := v_i + 1;
    v_linea_desc := case
      when v_desc <= 0 or v_bruto <= 0 then 0
      when v_i = v_n then v_desc - v_acum
      else round(v_desc * (l.cantidad * l.precio_unitario) / v_bruto, 2) end;
    v_acum := v_acum + v_linea_desc;
    v_linea_total := round(l.cantidad * l.precio_unitario - v_linea_desc, 2);
    v_base := round(v_linea_total / 1.18, 2);
    insert into public.comprobantes_lineas
      (comprobante_id, variante_id, codigo, descripcion, cantidad, unidad_sunat, precio_unitario,
       descuento, sub_total, igv, total, afectacion_igv)
    values
      (v_id, l.variante_id, l.codigo,
       upper(l.nombre) || ' - TALLA ' || case l.talla when 'TU' then 'UNICA' else regexp_replace(l.talla, '^T', '') end,
       l.cantidad, 'NIU', l.precio_unitario, v_linea_desc, v_base, v_linea_total - v_base, v_linea_total, '10');
  end loop;

  -- El envío, como servicio.
  if coalesce(pw.costo_envio, 0) > 0 then
    v_base := round(pw.costo_envio / 1.18, 2);
    insert into public.comprobantes_lineas
      (comprobante_id, codigo, descripcion, cantidad, unidad_sunat, precio_unitario, descuento, sub_total, igv, total, afectacion_igv)
    values (v_id, 'ENVIO', 'SERVICIO DE ENVIO', 1, 'ZZ', pw.costo_envio, 0, v_base, pw.costo_envio - v_base, pw.costo_envio, '10');
  end if;

  -- Cabecera = suma de las líneas. Tiene que dar lo que pagó el cliente.
  update public.comprobantes c
     set sub_total = s.base, igv = s.igv, total = s.total
    from (select sum(sub_total) base, sum(igv) igv, sum(total) total
            from public.comprobantes_lineas where comprobante_id = v_id) s
   where c.id = v_id
  returning c.total into v_suma;
  if abs(v_suma - pw.total) > 0.01 then
    raise exception 'El comprobante suma S/ % y el pedido S/ %: no se emite.', v_suma, pw.total;
  end if;

  update public.ventas set comprobante_id = v_id where id = pw.venta_id;
  update public.pedidos_web set comprobante_id = v_id where id = pw.id;

  return jsonb_build_object('emitido', true, 'tipo', v_tipo, 'numero', v_num, 'total', v_suma);
end;
$$;

revoke all on function public.emitir_comprobante_pedido_web(uuid) from public, anon, authenticated;
grant execute on function public.emitir_comprobante_pedido_web(uuid) to service_role;
