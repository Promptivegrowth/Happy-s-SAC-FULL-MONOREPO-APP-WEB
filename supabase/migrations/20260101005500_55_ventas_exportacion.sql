-- ===========================================================================
-- HAPPY SAC — Módulo de Ventas de Exportación (parte 1: enum)
-- ===========================================================================
-- Postgres exige que un nuevo enum value se commitee antes de usarse en
-- INSERTs, checks, etc. Por eso separamos:
--   55  = solo agrega el enum value 'EXPORTACION'
--   55b = usa ese valor (INSERT en series_comprobantes, checks, catálogo)
-- ===========================================================================

alter type public.canal_venta add value if not exists 'EXPORTACION';
