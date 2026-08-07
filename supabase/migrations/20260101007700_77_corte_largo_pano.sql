-- Largo de paño por tela en la liquidación de corte (pedido del cliente 22/07/2026).
-- El consumo real total se calcula: metros_consumidos = capas × largo_pano + merma.
alter table public.ot_corte_tiempos
  add column if not exists largo_pano numeric(10,2) default 0;
