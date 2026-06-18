-- ============================================================================
-- HAPPY SAC — FICHAS TÉCNICAS DE PRODUCTOS (MVP fase 1)
-- ============================================================================
-- AGREGADO PURO. NO altera ninguna tabla existente.
-- Cualquier producto puede tener cero, una o más fichas técnicas (revisiones).
-- Solo una con `vigente=true` por producto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Ficha técnica (cabecera) — una por revisión, varias por producto
-- ----------------------------------------------------------------------------
create table if not exists public.productos_fichas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  revision integer not null default 1,
  vigente boolean not null default true,

  -- Cabecera
  temporada text check (temporada in ('VERANO', 'INVIERNO', 'AMBAS', 'INDIFERENTE')),
  fecha_aprobacion date,
  cliente_referencia text,
  descripcion_larga text,
  alcance_uso text,
  observaciones text,

  -- Composición textil (tela principal)
  tela_principal_nombre text,
  tela_principal_composicion text,           -- '100% poliéster'
  tela_principal_color text,
  tela_principal_densidad text,
  tela_principal_ancho text,                  -- '1.70 +/- 2 cm'

  -- Composición textil (tela secundaria)
  tela_secundaria_nombre text,
  tela_secundaria_composicion text,
  tela_secundaria_color text,
  tela_secundaria_densidad text,
  tela_secundaria_ancho text,

  -- Especificaciones de confección
  puntadas_remalle text,                      -- '11 ppp +/- 1 ppp'
  puntadas_recta text,                        -- '10 ppp +/- 1'
  notas_confeccion text,                      -- markdown largo
  notas_acabados text,

  -- Empaque
  envase_primario text,
  envase_secundario text,
  cinta_embalaje text,
  sticker_talla text,
  rotulado_primario text,
  rotulado_secundario text,

  -- Auditoría
  aprobada_por uuid references auth.users(id),
  creada_por uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists productos_fichas_tecnicas_revision_unica
  on public.productos_fichas_tecnicas (producto_id, revision);

-- Solo UNA ficha vigente por producto
create unique index if not exists productos_fichas_tecnicas_vigente_unica
  on public.productos_fichas_tecnicas (producto_id) where vigente = true;

create index if not exists productos_fichas_tecnicas_producto_idx
  on public.productos_fichas_tecnicas (producto_id);

create trigger productos_fichas_tecnicas_updated_at
  before update on public.productos_fichas_tecnicas
  for each row execute function public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
-- 2) Medidas de la ficha (códigos A, B, C, ...)
-- ----------------------------------------------------------------------------
create table if not exists public.fichas_medidas (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.productos_fichas_tecnicas(id) on delete cascade,
  codigo text not null,                       -- 'A', 'B', 'C', ...
  descripcion text not null,                  -- 'LARGO DESDE EL BORDE DE PRETINA'
  tolerancia_cm numeric(6,2) default 0,
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz default now()
);

create unique index if not exists fichas_medidas_codigo_unico
  on public.fichas_medidas (ficha_id, codigo);

create index if not exists fichas_medidas_ficha_idx
  on public.fichas_medidas (ficha_id, orden);

-- ----------------------------------------------------------------------------
-- 3) Valor por medida × talla (matriz)
-- ----------------------------------------------------------------------------
create table if not exists public.fichas_medidas_valores (
  id uuid primary key default gen_random_uuid(),
  medida_id uuid not null references public.fichas_medidas(id) on delete cascade,
  talla text not null,                        -- '6', '8', '10', 'M/A', '12', ...
  valor numeric(8,2),
  created_at timestamptz default now()
);

create unique index if not exists fichas_medidas_valores_unique
  on public.fichas_medidas_valores (medida_id, talla);

create index if not exists fichas_medidas_valores_medida_idx
  on public.fichas_medidas_valores (medida_id);

-- ----------------------------------------------------------------------------
-- 4) Imágenes de la ficha (referencia, callouts, diagramas, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.fichas_imagenes (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.productos_fichas_tecnicas(id) on delete cascade,
  tipo text not null check (tipo in (
    'DELANTERO', 'POSTERIOR', 'LATERAL',
    'CORTE_DIAGRAMA', 'CONFECCION_DETALLE',
    'MEDIDAS_DIAGRAMA', 'ETIQUETA',
    'ACABADOS_DOBLADO', 'CALLOUT', 'OTRA'
  )),
  url text not null,                          -- URL pública (Supabase Storage)
  leyenda text,
  orden integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists fichas_imagenes_ficha_idx
  on public.fichas_imagenes (ficha_id, orden);

-- ============================================================================
-- RLS — staff puede leer/escribir; otros usuarios solo lectura (para que el
-- portal web futuro pueda mostrar fichas si se decide).
-- Las policies son PERMISIVAS — no bloquean ningún flujo existente.
-- ============================================================================
alter table public.productos_fichas_tecnicas enable row level security;
alter table public.fichas_medidas             enable row level security;
alter table public.fichas_medidas_valores     enable row level security;
alter table public.fichas_imagenes            enable row level security;

-- Cualquier usuario autenticado puede LEER
create policy productos_fichas_tecnicas_read_auth on public.productos_fichas_tecnicas
  for select to authenticated using (true);
create policy fichas_medidas_read_auth on public.fichas_medidas
  for select to authenticated using (true);
create policy fichas_medidas_valores_read_auth on public.fichas_medidas_valores
  for select to authenticated using (true);
create policy fichas_imagenes_read_auth on public.fichas_imagenes
  for select to authenticated using (true);

-- Staff con cualquiera de estos roles puede ESCRIBIR
create policy productos_fichas_tecnicas_write_staff on public.productos_fichas_tecnicas
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

create policy fichas_medidas_write_staff on public.fichas_medidas
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

create policy fichas_medidas_valores_write_staff on public.fichas_medidas_valores
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

create policy fichas_imagenes_write_staff on public.fichas_imagenes
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

comment on table public.productos_fichas_tecnicas is
  'Ficha técnica de un producto (cabecera). Una vigente por producto, historial de revisiones. AGREGADO PURO — no afecta tablas existentes.';
comment on table public.fichas_medidas is
  'Cada medida (largo, ancho cintura, etc.) de una ficha técnica con su tolerancia.';
comment on table public.fichas_medidas_valores is
  'Valor de cada medida en cada talla (matriz medida × talla).';
comment on table public.fichas_imagenes is
  'Imágenes referenciales de la ficha técnica (delantero, corte, callouts, etc.) — URL a Supabase Storage bucket "productos-fichas".';
