-- ===========================================================================
-- HAPPY SAC — Inventario multi-almacén, kardex, traslados
-- ===========================================================================

-- Stock actual por combinación (almacén, variante o material)
-- Se mantiene vía triggers desde kardex_movimientos.
create table if not exists public.stock_actual (
  id bigserial primary key,
  almacen_id uuid not null references public.almacenes(id),
  variante_id uuid references public.productos_variantes(id),
  material_id uuid references public.materiales(id),
  material_lote_id uuid references public.materiales_lotes(id),
  cantidad numeric(14,4) not null default 0,
  costo_promedio numeric(12,4),                  -- calculado con promedio ponderado
  ultima_actualizacion timestamptz not null default now(),
  check ( (variante_id is not null) or (material_id is not null) )
);

create unique index stock_actual_uq_variante on public.stock_actual (almacen_id, variante_id)
  where variante_id is not null and material_lote_id is null;
create unique index stock_actual_uq_material on public.stock_actual (almacen_id, material_id, coalesce(material_lote_id::text,'-'))
  where material_id is not null;

create index stock_actual_alm_idx on public.stock_actual (almacen_id);
create index stock_actual_variante_idx on public.stock_actual (variante_id) where variante_id is not null;
create index stock_actual_material_idx on public.stock_actual (material_id) where material_id is not null;

-- Kardex / libro mayor de inventarios
create table if not exists public.kardex_movimientos (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  tipo tipo_movimiento_kardex not null,
  almacen_id uuid not null references public.almacenes(id),
  variante_id uuid references public.productos_variantes(id),
  material_id uuid references public.materiales(id),
  material_lote_id uuid references public.materiales_lotes(id),
  cantidad numeric(14,4) not null,                -- POSITIVO siempre; el tipo define el sentido
  costo_unitario numeric(12,4),
  costo_total numeric(14,4),

  referencia_tipo text,                            -- 'OT','OC','VENTA','TRASLADO','AJUSTE','PEDIDO_WEB','DEVOLUCION'
  referencia_id uuid,                              -- id del registro original
  referencia_linea_id uuid,

  almacen_contraparte uuid references public.almacenes(id),   -- para traslados (destino)
  operario_id uuid references public.operarios(id),
  usuario_id uuid references auth.users(id),

  lote_pt_id uuid,                                 -- FK diferida a lotes_pt
  observacion text,
  created_at timestamptz default now(),
  check ( (variante_id is not null) or (material_id is not null) )
);
create index kardex_alm_fecha_idx on public.kardex_movimientos (almacen_id, fecha desc);
create index kardex_variante_fecha_idx on public.kardex_movimientos (variante_id, fecha desc) where variante_id is not null;
create index kardex_material_fecha_idx on public.kardex_movimientos (material_id, fecha desc) where material_id is not null;
create index kardex_referencia_idx on public.kardex_movimientos (referencia_tipo, referencia_id);

-- Trigger para mantener stock_actual
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
    on conflict (almacen_id, material_id, coalesce(material_lote_id::text,'-'))
    do update set
      cantidad = public.stock_actual.cantidad + excluded.cantidad,
      ultima_actualizacion = now();
  end if;

  -- Para traslados: el mismo movimiento afecta al almacén contraparte con signo inverso
  if new.almacen_contraparte is not null and new.tipo in ('ENTRADA_TRASLADO','SALIDA_TRASLADO') then
    -- Ya insertamos una fila por lado. Cada movimiento de traslado viene doble.
    null;
  end if;

  return new;
end;
$$;

create trigger kardex_after_insert
  after insert on public.kardex_movimientos
  for each row execute function public.tg_actualizar_stock();

-- Traslados entre almacenes (cabecera)
create table if not exists public.traslados (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,                    -- 'TRA-000123'
  almacen_origen uuid not null references public.almacenes(id),
  almacen_destino uuid not null references public.almacenes(id),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR','DESPACHADO','RECIBIDO','ANULADO')),
  solicitado_por uuid references auth.users(id),
  despachado_por uuid references auth.users(id),
  recibido_por uuid references auth.users(id),
  fecha_solicitud timestamptz default now(),
  fecha_despacho timestamptz,
  fecha_recepcion timestamptz,
  guia_remision text,
  motivo text,
  observacion text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger traslados_updated_at before update on public.traslados
  for each row execute function public.tg_set_updated_at();

create table if not exists public.traslados_lineas (
  id uuid primary key default gen_random_uuid(),
  traslado_id uuid not null references public.traslados(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id),
  material_id uuid references public.materiales(id),
  cantidad numeric(14,4) not null,
  cantidad_recibida numeric(14,4),
  observacion text,
  check ( (variante_id is not null) or (material_id is not null) )
);
create index traslados_lineas_trasl_idx on public.traslados_lineas (traslado_id);

-- Ajustes de inventario (conteo físico / corrección)
create table if not exists public.ajustes_inventario (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  almacen_id uuid not null references public.almacenes(id),
  fecha date not null default current_date,
  motivo text not null,
  aprobado_por uuid references auth.users(id),
  estado text not null default 'BORRADOR' check (estado in ('BORRADOR','APLICADO','ANULADO')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger ajustes_inventario_updated_at before update on public.ajustes_inventario
  for each row execute function public.tg_set_updated_at();

create table if not exists public.ajustes_inventario_lineas (
  id uuid primary key default gen_random_uuid(),
  ajuste_id uuid not null references public.ajustes_inventario(id) on delete cascade,
  variante_id uuid references public.productos_variantes(id),
  material_id uuid references public.materiales(id),
  cantidad_sistema numeric(14,4),
  cantidad_real numeric(14,4) not null,
  diferencia numeric(14,4) generated always as (cantidad_real - coalesce(cantidad_sistema,0)) stored,
  costo_unitario numeric(12,4),
  observacion text,
  check ( (variante_id is not null) or (material_id is not null) )
);

-- Helper: stock por almacén y variante
create or replace function public.stock_de_variante(p_variante uuid, p_almacen uuid default null)
  returns numeric language sql stable as $$
  select coalesce(sum(cantidad), 0)
  from public.stock_actual
  where variante_id = p_variante
    and (p_almacen is null or almacen_id = p_almacen);
$$;

-- Vista consolidada (aggregando todos los almacenes)
create or replace view public.v_stock_variante_total as
select
  variante_id,
  sum(cantidad) as stock_total
from public.stock_actual
where variante_id is not null
group by variante_id;
