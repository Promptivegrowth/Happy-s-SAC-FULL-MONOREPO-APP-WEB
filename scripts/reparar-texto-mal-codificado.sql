-- ===========================================================================
-- REPARAR TEXTO MAL CODIFICADO  (se corre a mano, NO es una migración)
-- ===========================================================================
--
-- Qué arregla
-- -----------
-- Texto en español que quedó guardado como si fuera latin-1 cuando en realidad
-- era UTF-8. Se reconoce a simple vista:
--
--     Día de la Madre   ->   DÃ­a de la Madre
--     ¿Compra al por…   ->   Â¿Compra al por…
--     ✨ Mayo 2026      ->   â✨ Mayo 2026
--
-- Qué lo provoca
-- --------------
-- No lo provoca la aplicación: el ERP guarda por PostgREST y ahí el texto
-- viaja en UTF-8 de punta a punta —comprobado escribiendo y leyendo de vuelta
-- "Día de la Madre — ¡Feliz día, Mamá! Ñandú, colección, ¿sí?" sin perder un
-- carácter—.
--
-- Lo provoca cargar datos desde afuera con una herramienta que lee los
-- archivos en la codificación vieja de Windows. Pasó el 17/09/2026 con el
-- contenido de la web: se hizo un respaldo y se restauró con PowerShell usando
-- `Get-Content` sin `-Encoding utf8`, y en ese viaje de ida y vuelta se
-- rompieron todas las tildes.
--
-- Si hay que cargar datos con PowerShell, la forma correcta es
-- `[IO.File]::ReadAllText($ruta, [Text.Encoding]::UTF8)` para leer y
-- `[IO.File]::WriteAllText($ruta, $texto, (New-Object Text.UTF8Encoding($false)))`
-- para escribir.
--
-- Cómo arregla
-- ------------
-- Hace la operación inversa exacta: toma el texto como bytes latin-1 y los
-- reinterpreta como UTF-8. Por eso no hay que reescribir a mano cada título, y
-- sirve para cualquier texto que el cliente haya cargado después.
--
-- CUIDADO
-- -------
-- Solo se corre sobre filas que de verdad estén rotas, y por eso NO es una
-- migración: un texto legítimo que contenga "Ã" o "Â" —un apellido francés, un
-- nombre portugués— se dañaría al pasarlo por acá. Antes de ejecutar el UPDATE,
-- correr el SELECT de abajo y mirar las filas una por una.

-- ── 1. Ver qué está roto, antes de tocar nada ──────────────────────────────
select clave,
       left(valor::text, 120) as muestra
  from public.web_config
 where valor::text like '%' || chr(195) || '%'    -- Ã
    or valor::text like '%' || chr(194) || '%';   -- Â

-- ── 2. Repararlo ───────────────────────────────────────────────────────────
-- update public.web_config
--    set valor = convert_from(convert_to(valor::text, 'LATIN1'), 'UTF8')::jsonb,
--        updated_at = now()
--  where valor::text like '%' || chr(195) || '%'
--     or valor::text like '%' || chr(194) || '%';

-- ── 3. Confirmar, preguntándole a la base ──────────────────────────────────
-- La consola de Windows tiene su propia codificación y miente sobre esto: hay
-- que verificar con una consulta, no mirando la pantalla.
--
-- select not exists (
--   select 1 from public.web_config
--    where valor::text like '%' || chr(195) || '%'
--       or valor::text like '%' || chr(194) || '%'
-- ) as quedo_limpio,
-- exists (
--   select 1 from public.web_config
--    where clave = 'hero_slides'
--      and valor::text like '%D' || chr(237) || 'a de la Madre%'
-- ) as las_tildes_volvieron;
