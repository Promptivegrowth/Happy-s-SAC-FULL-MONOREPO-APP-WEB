-- ===========================================================================
-- HAPPY SAC — Usuarios, roles y permisos
-- ===========================================================================

-- Perfil extendido del usuario (auth.users tiene solo id, email, metadata)
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre_completo text,
  dni text,
  telefono text,
  cargo text,
  almacen_default uuid references public.almacenes(id),
  caja_default uuid references public.cajas(id),
  avatar_url text,
  idioma text not null default 'es-PE',
  activo boolean not null default true,
  ultimo_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger perfiles_updated_at before update on public.perfiles
  for each row execute function public.tg_set_updated_at();

-- Asignación de roles a usuarios (un usuario puede tener varios roles)
create table if not exists public.usuarios_roles (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  rol rol_sistema not null,
  otorgado_en timestamptz not null default now(),
  otorgado_por uuid references auth.users(id),
  primary key (usuario_id, rol)
);
create index usuarios_roles_rol_idx on public.usuarios_roles (rol);

-- Asignaciones de usuarios a almacenes (restringe qué almacén/tienda puede operar un cajero)
create table if not exists public.usuarios_almacenes (
  usuario_id uuid not null references auth.users(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  primary key (usuario_id, almacen_id)
);

-- Helpers RLS: chequeo de rol
create or replace function public.tiene_rol(p_rol rol_sistema)
  returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.usuarios_roles
    where usuario_id = auth.uid() and rol = p_rol
  );
$$;

create or replace function public.tiene_algun_rol(p_roles rol_sistema[])
  returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.usuarios_roles
    where usuario_id = auth.uid() and rol = any(p_roles)
  );
$$;

create or replace function public.es_admin()
  returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.usuarios_roles
    where usuario_id = auth.uid() and rol = 'gerente'
  );
$$;

create or replace function public.puede_acceder_almacen(p_almacen uuid)
  returns boolean language sql stable security definer set search_path = public, auth as $$
  select
    public.es_admin()
    or exists (
      select 1 from public.usuarios_almacenes
      where usuario_id = auth.uid() and almacen_id = p_almacen
    );
$$;

-- Trigger: crear perfil automáticamente al registrarse un auth.user
create or replace function public.tg_crear_perfil()
  returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.perfiles (id, nombre_completo)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre_completo', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  -- Rol por defecto: 'cliente' (clientes web). El gerente ascenderá manualmente a los operarios.
  insert into public.usuarios_roles (usuario_id, rol)
  values (new.id, 'cliente')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_crear_perfil();
