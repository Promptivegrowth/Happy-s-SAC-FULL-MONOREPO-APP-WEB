-- ===========================================================================
-- HAPPY SAC — Helpers globales + audit log
-- ===========================================================================

-- Trigger genérico para mantener `updated_at` al día.
create or replace function public.tg_set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tabla de auditoría universal
create table if not exists public.audit_log (
  id bigserial primary key,
  ocurrido_en timestamptz not null default now(),
  usuario_id uuid references auth.users(id) on delete set null,
  accion text not null,                 -- INSERT / UPDATE / DELETE / CUSTOM
  tabla text not null,
  registro_id text,
  diff jsonb,
  ip inet,
  user_agent text,
  contexto jsonb
);
create index audit_log_tabla_idx on public.audit_log (tabla, ocurrido_en desc);
create index audit_log_usuario_idx on public.audit_log (usuario_id, ocurrido_en desc);

comment on table public.audit_log is
  'Bitácora universal de cambios. Insertar desde triggers o manualmente con public.log_audit(...).';

create or replace function public.log_audit(
  p_accion text,
  p_tabla text,
  p_registro_id text,
  p_diff jsonb default null,
  p_contexto jsonb default null
) returns void language sql as $$
  insert into public.audit_log(usuario_id, accion, tabla, registro_id, diff, contexto)
  values (auth.uid(), p_accion, p_tabla, p_registro_id, p_diff, p_contexto);
$$;

-- Trigger genérico para auditar cambios en tablas críticas.
create or replace function public.tg_audit_row()
  returns trigger language plpgsql as $$
declare
  v_diff jsonb;
  v_registro_id text;
begin
  if tg_op = 'INSERT' then
    v_diff := to_jsonb(new);
    v_registro_id := coalesce((new.id)::text, '');
  elsif tg_op = 'UPDATE' then
    v_diff := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
    v_registro_id := coalesce((new.id)::text, '');
  else
    v_diff := to_jsonb(old);
    v_registro_id := coalesce((old.id)::text, '');
  end if;
  insert into public.audit_log (usuario_id, accion, tabla, registro_id, diff)
  values (auth.uid(), tg_op, tg_table_name, v_registro_id, v_diff);
  return coalesce(new, old);
end;
$$;

-- Generador de correlativos atómicos.
create table if not exists public.correlativos (
  clave text primary key,            -- ej: 'OT', 'OC', 'VENTA', 'B001-BOLETA'
  ultimo bigint not null default 0,
  actualizado_en timestamptz not null default now()
);

create or replace function public.next_correlativo(p_clave text, p_padding int default 6)
  returns text language plpgsql as $$
declare
  v_next bigint;
begin
  insert into public.correlativos(clave, ultimo) values (p_clave, 1)
    on conflict (clave) do update set
      ultimo = public.correlativos.ultimo + 1,
      actualizado_en = now()
    returning ultimo into v_next;
  return lpad(v_next::text, p_padding, '0');
end;
$$;

comment on function public.next_correlativo(text, int) is
  'Devuelve el siguiente correlativo atómico con padding. Usado para numeración OT/OC/Comprobantes.';
