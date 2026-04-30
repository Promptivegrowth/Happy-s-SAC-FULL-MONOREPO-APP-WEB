-- ===========================================================================
-- HAPPY SAC — Fix RLS faltante en tabla categorias
-- ===========================================================================
-- Bug: la migración 23 enumera tablas que reciben política *_staff_full
-- (insert/update/delete para roles staff) pero olvidó incluir 'categorias'.
-- Síntoma: al crear/editar categoría desde el ERP da error
-- "new row violates row-level security policy for table 'categorias'".
--
-- Fix: agregar la policy igual que el resto de catálogos (gerente,
-- jefe_produccion, almacenero, vendedor_b2b, contador).
-- ===========================================================================

drop policy if exists categorias_staff_full on public.categorias;
create policy categorias_staff_full on public.categorias
  for all
  using (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador']::rol_sistema[]
    )
  )
  with check (
    auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador']::rol_sistema[]
    )
  );
