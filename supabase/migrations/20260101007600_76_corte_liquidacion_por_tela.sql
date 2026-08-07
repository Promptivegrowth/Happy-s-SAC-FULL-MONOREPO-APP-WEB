-- Liquidación de corte POR TELA (pedido del cliente 22/07/2026):
-- capas tendidas, metros consumidos, merma y responsable se declaran por cada
-- tela de la receta (no a nivel cabecera). La cabecera (ot_corte) conserva los
-- totales (suma de telas) para los listados y el resumen.
alter table public.ot_corte_tiempos
  add column if not exists capas_tendidas integer default 0,
  add column if not exists metros_consumidos numeric(10,2) default 0,
  add column if not exists merma_metros numeric(10,2) default 0,
  add column if not exists responsable_operario_id uuid references public.operarios(id);
