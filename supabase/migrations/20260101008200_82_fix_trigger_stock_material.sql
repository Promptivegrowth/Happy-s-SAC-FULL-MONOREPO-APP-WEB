-- Migración 82: fix del trigger tg_actualizar_stock para MATERIALES.
--
-- El índice único de material es PARCIAL:
--   create unique index stock_actual_uq_material
--     on stock_actual (almacen_id, material_id, coalesce(material_lote_id::text,'-'))
--     where material_id is not null;
--
-- Para que un INSERT ... ON CONFLICT use un índice parcial, la cláusula
-- ON CONFLICT debe REPETIR el mismo predicado WHERE (inference). La rama de
-- variante sí lo hacía; la rama de material NO, y por eso CUALQUIER movimiento
-- de material fallaba con "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification". Este bug hacía que el almacén de materiales
-- nunca pudiera registrar stock (reporte del cliente 2026-08-16).

create or replace function public.tg_actualizar_stock()
  returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_signo int;
  v_delta numeric(14,4);
  v_key_almacen uuid;
begin
  -- Define signo (ENTRADA_* suma, SALIDA_* resta)
  if new.tipo::text like 'ENTRADA_%' then
    v_signo := 1;
  elsif new.tipo::text like 'SALIDA_%' then
    v_signo := -1;
  else
    v_signo := 0;
  end if;

  v_delta := new.cantidad * v_signo;
  v_key_almacen := new.almacen_id;

  if new.variante_id is not null then
    insert into public.stock_actual (almacen_id, variante_id, cantidad, ultima_actualizacion)
    values (v_key_almacen, new.variante_id, v_delta, now())
    on conflict (almacen_id, variante_id) where variante_id is not null and material_lote_id is null
    do update set
      cantidad = public.stock_actual.cantidad + excluded.cantidad,
      ultima_actualizacion = now();
  end if;

  if new.material_id is not null then
    insert into public.stock_actual (almacen_id, material_id, material_lote_id, cantidad, ultima_actualizacion)
    values (v_key_almacen, new.material_id, new.material_lote_id, v_delta, now())
    -- FIX: repetir el predicado del índice parcial (where material_id is not null)
    on conflict (almacen_id, material_id, coalesce(material_lote_id::text,'-')) where material_id is not null
    do update set
      cantidad = public.stock_actual.cantidad + excluded.cantidad,
      ultima_actualizacion = now();
  end if;

  return new;
end;
$$;
