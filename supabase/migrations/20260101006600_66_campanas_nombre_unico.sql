-- Mig 66 — Campañas: nombre único (normalizado)
-- Contexto (20/07/2026): el cliente creó DOS campañas "Fiestas Patrias 2026"
-- (códigos FIESTASPATRIAS-2026 y FIESTAS-PATRIAS-2026, slugs fiestas-patrias-2026
-- y fiestas-patrias-2026-2). El menú de la web apuntaba a la primera y la falda
-- de marinera barney quedó asignada a la segunda → "no aparece en la web".
-- Fix de datos aplicado directo en producción: se movieron las referencias
-- (productos, plan_maestro_lineas, ot, web_banners) a la campaña original y
-- se eliminó la duplicada. Este índice evita que vuelva a pasar.

create unique index if not exists uq_campanas_nombre_norm
  on campanas (lower(trim(nombre)));
