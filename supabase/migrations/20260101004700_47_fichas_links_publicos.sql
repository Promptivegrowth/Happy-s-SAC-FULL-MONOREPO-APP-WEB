-- ============================================================================
-- HAPPY SAC — Links públicos compartibles de ficha técnica (Fase 3)
-- ============================================================================
-- AGREGADO PURO. Permite generar URLs públicas para que el cliente B2B vea
-- la ficha sin necesitar login. Cada link tiene token UUID, vencimiento
-- opcional, contador de vistas y se puede revocar.
-- ============================================================================

create table if not exists public.fichas_links_publicos (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.productos_fichas_tecnicas(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  expira_en timestamptz,                           -- null = no expira
  vistas integer not null default 0,
  ultima_vista_en timestamptz,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists fichas_links_publicos_token_idx
  on public.fichas_links_publicos (token) where activo = true;
create index if not exists fichas_links_publicos_ficha_idx
  on public.fichas_links_publicos (ficha_id);

alter table public.fichas_links_publicos enable row level security;

-- Solo staff puede crear/listar/revocar
create policy fichas_links_publicos_staff on public.fichas_links_publicos
  for all to authenticated
  using (
    exists (
      select 1 from public.usuarios_roles ur
      where ur.usuario_id = auth.uid()
        and ur.rol in ('gerente','jefe_produccion','almacenero')
    )
  )
  with check (
    exists (
      select 1 from public.usuarios_roles ur
      where ur.usuario_id = auth.uid()
        and ur.rol in ('gerente','jefe_produccion','almacenero')
    )
  );

-- Acceso público (anon) por token se hace VÍA SERVICE ROLE en el server action,
-- así que NO necesitamos una policy "lectura anon" — la página /fichas/[token]
-- bypassa RLS controladamente.

comment on table public.fichas_links_publicos is
  'Tokens UUID para compartir fichas técnicas con clientes B2B vía link público (sin login).';
