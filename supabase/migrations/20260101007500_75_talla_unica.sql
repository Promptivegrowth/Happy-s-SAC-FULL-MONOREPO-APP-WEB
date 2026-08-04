-- Talla ÚNICA para accesorios (pedido del cliente 22/07/2026).
-- IMPORTANTE: la talla S (TS) se MANTIENE como tamaño real; "Única" es un valor
-- NUEVO y SEPARADO (TU), no un rename de TS.
alter type public.talla_prenda add value if not exists 'TU';
