-- ============================================================================
-- HAPPY SAC — FICHAS TÉCNICAS Fase 2: Hoja de corte + máquina/operación
-- ============================================================================
-- AGREGADO PURO. Las columnas en productos_procesos son OPCIONALES.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Hoja de corte: piezas por ficha
-- ----------------------------------------------------------------------------
create table if not exists public.fichas_piezas_corte (
  id uuid primary key default gen_random_uuid(),
  ficha_id uuid not null references public.productos_fichas_tecnicas(id) on delete cascade,
  tipo_tela text not null default 'PRINCIPAL' check (tipo_tela in ('PRINCIPAL', 'SECUNDARIA', 'FORRO', 'OTRO')),
  descripcion text not null,                    -- 'Delantero', 'Espalda', 'Vivos', etc.
  cantidad integer not null default 1 check (cantidad >= 1),
  posicion text,                                 -- 'vertical', 'horizontal', 'sesgo'
  orientacion text,                              -- 'hilo', 'contrahilo', 'diagonal'
  observaciones text,
  orden integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists fichas_piezas_corte_ficha_idx
  on public.fichas_piezas_corte (ficha_id, orden);

alter table public.fichas_piezas_corte enable row level security;

create policy fichas_piezas_corte_read_auth on public.fichas_piezas_corte
  for select to authenticated using (true);

create policy fichas_piezas_corte_write_staff on public.fichas_piezas_corte
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

-- ----------------------------------------------------------------------------
-- 2) Columnas opcionales en productos_procesos para enriquecer ficha técnica
-- ----------------------------------------------------------------------------
-- IMPORTANTE: ambas columnas son NULLABLE para NO romper insertos existentes.
-- Los flujos actuales de productos_procesos no requieren estos campos.

alter table public.productos_procesos
  add column if not exists maquina text;

alter table public.productos_procesos
  add column if not exists descripcion_operativa text;

comment on column public.productos_procesos.maquina is
  'Tipo de máquina usada (RECTA/REMALLADORA/RECUBRIDORA/MANUAL/etc.) — opcional, usado por la ficha técnica.';
comment on column public.productos_procesos.descripcion_operativa is
  'Descripción operativa larga del proceso (paso a paso) — opcional, usado por la ficha técnica.';

comment on table public.fichas_piezas_corte is
  'Piezas de corte declaradas en la ficha técnica (delantero, espalda, vivos, etc.) con tipo de tela, cantidad, posición y orientación.';
