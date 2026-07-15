-- =============================================================================
-- Migración 64: columna referencia (cuenta destino) en clientes_adelantos
-- =============================================================================
-- Cliente pidió (2026-07-13) que al registrar un adelanto se elija la cuenta
-- bancaria destino (BCP HAPPYS, INTERBANK HAPPYS, etc.) igual que en el
-- cobro de ventas. La columna guarda el nombre corto de la cuenta del
-- catálogo (cuentas_bancarias.nombre_corto) — mismo patrón que
-- ventas_pagos.referencia.

alter table public.clientes_adelantos
  add column if not exists referencia text;

comment on column public.clientes_adelantos.referencia is
  'Nombre corto de la cuenta bancaria destino del adelanto (catálogo cuentas_bancarias). Ver mig 64.';
