-- ===========================================================================
-- HAPPY SAC — Versionado de procesos (productos_procesos)
-- ---------------------------------------------------------------------------
-- El cliente pidió que la receta solo sea editable mientras el producto NO
-- haya entrado en producción. Si ya hay OTs, cualquier cambio debe generar
-- una versión nueva (v2.0, v3.0…) para no romper la trazabilidad histórica.
--
-- Esta migración cubre PROCESOS. Para materiales se reutilizan los campos
-- `version` y `activa` que ya existen en `recetas` (mig 09) — no requiere
-- migración nueva, solo la lógica server-side.
--
-- Decisión con el cliente: el versionado de procesos es INDEPENDIENTE del
-- de materiales (cada uno puede ir en v2.0 o v3.0 sin afectar al otro).
-- ===========================================================================

alter table public.productos_procesos
  add column if not exists version text not null default 'v1.0',
  add column if not exists activo boolean not null default true;

comment on column public.productos_procesos.version is
  'Versión de la receta de procesos. Cada vez que se versiona se duplican las filas con nueva version y se desactivan las viejas (activo=false).';
comment on column public.productos_procesos.activo is
  'Solo las filas con activo=true son la versión vigente. Las viejas (activo=false) se conservan para histórico.';

-- Índice parcial: la mayoría de queries son por (producto_id, activo=true)
create index if not exists productos_procesos_activo_idx
  on public.productos_procesos (producto_id, activo)
  where activo = true;
