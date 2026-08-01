-- Mig 69 — Tiempos de corte por TELA
-- Pedido del cliente (21/07/2026): en el área de corte, registrar los tiempos
-- de TENDIDO, CORTE y HABILITADO para CADA una de las telas de la receta del
-- producto (las tres operaciones se hacen por cada tela). Antes solo existían
-- tiempos únicos a nivel cabecera del corte (ot_corte.tiempo_*).

create table if not exists public.ot_corte_tiempos (
  id uuid primary key default gen_random_uuid(),
  corte_id uuid not null references public.ot_corte(id) on delete cascade,
  material_id uuid references public.materiales(id) on delete set null,
  tela_nombre text,
  tiempo_tendido_min numeric(10,2) not null default 0,
  tiempo_corte_min numeric(10,2) not null default 0,
  tiempo_habilitado_min numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (corte_id, material_id)
);

create index if not exists idx_ot_corte_tiempos_corte on public.ot_corte_tiempos(corte_id);

create trigger tg_ot_corte_tiempos_updated before update on public.ot_corte_tiempos
  for each row execute function tg_set_updated_at();

alter table public.ot_corte_tiempos enable row level security;

create policy ot_corte_tiempos_staff on public.ot_corte_tiempos for all
  using (auth.uid() is not null and tiene_algun_rol(array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[]))
  with check (auth.uid() is not null and tiene_algun_rol(array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[]));
