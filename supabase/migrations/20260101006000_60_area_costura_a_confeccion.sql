-- =============================================================================
-- Migración 60: renombrar visualmente el área COSTURA como CONFECCIÓN
-- =============================================================================
-- Contexto: el cliente en el Excel maestro de áreas (AREAS-PROCESOS.xlsx,
-- pasado 2026-07-10) llama al área "CONFECCIÓN", no "COSTURA". El sistema la
-- creaba como COSTURA (post migración 29 + add-area-costura seed).
--
-- Estrategia:
--   - Solo cambiamos el NOMBRE visible (columna nombre).
--   - El CÓDIGO interno se mantiene como 'COSTURA' para no romper el enum
--     tipo_proceso_produccion (COSTURA es uno de sus 15 valores) ni las
--     tarifas / OTs / reportes que lo referencian por codigo.
--   - Es idempotente: si ya está renombrado, no hace nada.
-- =============================================================================

update public.areas_produccion
   set nombre = 'Confección'
 where codigo = 'COSTURA'
   and nombre <> 'Confección';
