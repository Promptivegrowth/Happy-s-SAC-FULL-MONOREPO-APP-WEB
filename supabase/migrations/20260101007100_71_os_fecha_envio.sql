-- Mig 71 — Fecha de envío al taller en la orden de servicio
-- Pedido del cliente (21/07/2026): además de la fecha de emisión y de
-- recepción, registrar la FECHA en que la mercadería se ENVÍA físicamente al
-- taller externo.

alter table public.ordenes_servicio
  add column if not exists fecha_envio date;
