-- 108 · Anulación de ventas desde la caja (nota de venta, boleta o factura)
--
-- Pedido de Javier (29/09/2026): que el cajero pueda anular desde la caja una
-- venta completa, siempre con motivo, y que todo quede registrado.
--
-- Se hace en UNA función para que sea todo o nada: la venta, el stock que
-- vuelve al almacén, el comprobante y el registro de auditoría. Hecho en pasos
-- sueltos desde la aplicación, un corte a la mitad podía dejar la venta anulada
-- con la mercadería todavía descontada, o al revés.
--
-- Qué pasa con cada comprobante:
--   · Nota de venta: se anula por dentro (no va a SUNAT).
--   · Boleta: queda ANULADA y la baja viaja en el resumen diario de las 23:00
--     (mismo camino que ya usa la anulación de boletas del ERP).
--   · Factura: SUNAT no deja "borrarla": se emite una nota de crédito motivo 01
--     (anulación de la operación) que el envío automático manda enseguida. La
--     factura conserva su estado ante SUNAT y queda marcada como anulada.
--
-- Quién puede y cuándo se controla en la caja (solo ventas del turno abierto);
-- la función solo la puede llamar el servidor.

alter table public.ventas
  add column if not exists anulada_en timestamptz,
  add column if not exists anulada_por uuid references auth.users(id) on delete set null,
  add column if not exists motivo_anulacion text;

create or replace function public.anular_venta(p_venta_id uuid, p_motivo text, p_usuario uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v public.ventas%rowtype;
  c public.comprobantes%rowtype;
  v_hay_comp boolean := false;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_doc text;
  v_unidades numeric := 0;
  v_nc_serie text;
  v_nc_id uuid;
  v_nc_num text;
  v_que text := 'SIN_COMPROBANTE';
  v_dev text;
begin
  if length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la anulación (al menos 5 letras).';
  end if;

  -- Bloquea la venta: dos cajeros anulando la misma a la vez, solo pasa uno.
  select * into v from public.ventas where id = p_venta_id for update;
  if not found then raise exception 'La venta no existe.'; end if;
  if v.estado = 'ANULADA' then raise exception 'Esta venta ya estaba anulada.'; end if;
  if v.estado <> 'COMPLETADA' then
    raise exception 'Solo se puede anular una venta completada (esta está %).', v.estado;
  end if;

  -- Con una devolución o un cambio ya hecho, parte de la mercadería ya volvió:
  -- anular todo la devolvería dos veces.
  select numero into v_dev from public.devoluciones where venta_id = v.id limit 1;
  if v_dev is not null then
    raise exception 'Esta venta ya tiene una devolución o cambio registrado (%). No se puede anular completa.', v_dev;
  end if;

  -- El comprobante de la venta (el vinculado, o el último emitido para ella).
  if v.comprobante_id is not null then
    select * into c from public.comprobantes where id = v.comprobante_id;
    v_hay_comp := found;
  end if;
  if not v_hay_comp then
    select * into c from public.comprobantes
     where venta_id = v.id and tipo in ('NOTA_VENTA', 'BOLETA', 'FACTURA')
     order by created_at desc limit 1;
    v_hay_comp := found;
  end if;
  v_doc := case when v_hay_comp then c.numero_completo else v.numero end;

  update public.ventas
     set estado = 'ANULADA', anulada_en = now(), anulada_por = p_usuario, motivo_anulacion = v_motivo
   where id = v.id;

  -- La mercadería vuelve al almacén como movimiento de kardex: queda en la
  -- trazabilidad de cada prenda (trigger tg_kardex_trazabilidad) con el motivo.
  insert into public.kardex_movimientos
    (tipo, almacen_id, variante_id, cantidad, referencia_tipo, referencia_id, usuario_id, observacion)
  select 'ENTRADA_AJUSTE', v.almacen_id, l.variante_id, l.cantidad, 'ANULACION', v.id, p_usuario,
         'Anulación de ' || v_doc || ' — ' || v_motivo
    from public.ventas_lineas l
   where l.venta_id = v.id and l.variante_id is not null;
  select coalesce(sum(cantidad), 0) into v_unidades
    from public.ventas_lineas where venta_id = v.id and variante_id is not null;

  if v_hay_comp then
    if c.tipo = 'FACTURA' and c.estado <> 'RECHAZADO' then
      select serie into v_nc_serie from public.series_comprobantes
       where tipo = 'NOTA_CREDITO' and activa and serie like 'F%'
       order by serie limit 1;
      if v_nc_serie is null then
        raise exception 'No hay una serie de nota de crédito para facturas activa (Configuración → Series).';
      end if;

      insert into public.comprobantes
        (tipo, serie, numero, cliente_id, tipo_documento_cliente, numero_documento_cliente,
         razon_social_cliente, direccion_cliente, ubigeo_cliente, fecha_emision, moneda,
         sub_total, descuento_global, igv, total, estado, forma_pago,
         documento_referencia_id, motivo_nc_nd, nota_interna)
      values
        ('NOTA_CREDITO', v_nc_serie, public.next_correlativo('COMP_' || v_nc_serie, 7)::bigint,
         c.cliente_id, c.tipo_documento_cliente, c.numero_documento_cliente,
         c.razon_social_cliente, c.direccion_cliente, c.ubigeo_cliente, now(), coalesce(c.moneda, 'PEN'),
         c.sub_total, c.descuento_global, c.igv, c.total, 'BORRADOR', 'CONTADO',
         c.id, '01', 'Anulación de ' || c.numero_completo || ' — ' || v_motivo)
      returning id, numero_completo into v_nc_id, v_nc_num;

      insert into public.comprobantes_lineas
        (comprobante_id, variante_id, codigo, descripcion, cantidad, unidad_sunat,
         precio_unitario, descuento, sub_total, igv, total, afectacion_igv)
      select v_nc_id, variante_id, codigo, descripcion, cantidad, unidad_sunat,
             precio_unitario, descuento, sub_total, igv, total, afectacion_igv
        from public.comprobantes_lineas where comprobante_id = c.id;

      -- La factura sigue existiendo para SUNAT (la anula la nota de crédito).
      update public.comprobantes
         set anulado_en = now(), anulado_por = p_usuario, motivo_anulacion = v_motivo
       where id = c.id;
      v_que := 'NOTA_CREDITO';
    else
      -- Nota de venta, boleta, o una factura que SUNAT rechazó (no existe para SUNAT).
      update public.comprobantes
         set estado = 'ANULADO', anulado_en = now(), anulado_por = p_usuario,
             motivo_anulacion = v_motivo, anulacion_informada_en = null
       where id = c.id;
      v_que := case c.tipo::text when 'BOLETA' then 'RESUMEN_DIARIO' else 'INTERNA' end;
    end if;
  end if;

  insert into public.audit_log (usuario_id, accion, tabla, registro_id, diff, contexto)
  values (
    p_usuario, 'ANULAR_VENTA', 'ventas', v.id::text,
    jsonb_build_object('estado', jsonb_build_object('antes', 'COMPLETADA', 'despues', 'ANULADA')),
    jsonb_build_object(
      'motivo', v_motivo, 'venta', v.numero, 'documento', v_doc,
      'tipo_documento', case when v_hay_comp then c.tipo::text end,
      'total', v.total, 'almacen_id', v.almacen_id, 'caja_id', v.caja_id,
      'caja_sesion_id', v.caja_sesion_id, 'unidades_devueltas', v_unidades,
      'nota_credito', v_nc_num, 'sunat', v_que
    )
  );

  return jsonb_build_object(
    'documento', v_doc,
    'tipo', case when v_hay_comp then c.tipo::text end,
    'unidades', v_unidades,
    'total', v.total,
    'nota_credito', v_nc_num,
    'sunat', v_que
  );
end;
$$;

-- Solo el servidor la llama, después de comprobar quién anula y que el turno
-- siga abierto. Nadie desde el navegador.
revoke all on function public.anular_venta(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.anular_venta(uuid, text, uuid) to service_role;
