-- ===========================================================================
-- HAPPY SAC — Vistas dedupedas de ubigeo (departamentos y provincias).
-- ---------------------------------------------------------------------------
-- La tabla `ubigeo` tiene ~1874 distritos. Supabase REST (PostgREST) tiene
-- un cap ABSOLUTO de 1000 filas por respuesta que .limit() NO sobrescribe.
-- El endpoint /api/ubigeo dedupeaba en JS desde la tabla cruda, por eso
-- sólo aparecían 11 deptos (AMAZONAS → ICA) y algunos con conteo incorrecto
-- de provincias.
--
-- Estas vistas devuelven los únicos directamente desde Postgres, así la
-- respuesta tiene ≤ 200 filas y nunca toca el cap.
-- ===========================================================================

create or replace view public.v_ubigeo_departamentos as
select distinct
  departamento_codigo,
  departamento
from public.ubigeo
order by departamento;

comment on view public.v_ubigeo_departamentos is
  'Departamentos únicos del catálogo INEI ubigeo. ~25 filas. Evita el cap de 1000 de PostgREST al consultar /ubigeo cruda.';

create or replace view public.v_ubigeo_provincias as
select distinct
  departamento_codigo,
  provincia_codigo,
  provincia
from public.ubigeo
order by departamento_codigo, provincia;

comment on view public.v_ubigeo_provincias is
  'Provincias únicas del catálogo INEI ubigeo. ~196 filas. Filtrable por departamento_codigo.';
