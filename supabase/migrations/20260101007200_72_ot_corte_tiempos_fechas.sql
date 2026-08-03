-- Fechas de ejecución por operación de corte (pedido del cliente 21/07/2026):
-- permitir registrar CON FECHA el tendido, corte y habilitado de cada tela en
-- la orden de corte, similar al registro de las órdenes de trabajo.
alter table public.ot_corte_tiempos
  add column if not exists fecha_tendido date,
  add column if not exists fecha_corte date,
  add column if not exists fecha_habilitado date;
