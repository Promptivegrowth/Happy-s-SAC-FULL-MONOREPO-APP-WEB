-- Recepción de OS (pedido del cliente 21/07/2026):
--  1) motivo_falla: campo para registrar el motivo de las prendas falladas.
--  2) entregas parciales: la OS puede recibirse en varias veces (campañas).
--     El estado 'RECEPCION_PARCIAL' (columna estado es TEXT, no enum) marca que
--     ya retornó parte de la mercadería pero aún no toda.
alter table public.ordenes_servicio
  add column if not exists motivo_falla text;
