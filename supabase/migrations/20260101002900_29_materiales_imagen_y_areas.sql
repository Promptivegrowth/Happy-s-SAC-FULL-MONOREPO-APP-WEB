-- ===========================================================================
-- HAPPY SAC — Materiales con foto + áreas de producción con valor_minuto
-- ===========================================================================
-- 1) Agrega columna imagen_url a materiales para que cada material pueda
--    tener una foto (UI: image uploader).
-- 2) Upsert de áreas de producción con sus valor/min provenientes del
--    Excel del cliente (CORTE, DECORADO, ESTAMPADO, BORDADO, SUBLIMADO,
--    PLISADO, ACABADO, PLANCHADO, DEL TALLER).
-- ===========================================================================

alter table public.materiales
  add column if not exists imagen_url text;

comment on column public.materiales.imagen_url is
  'URL pública de la foto del material (bucket disfraces-fotos/materiales/).';

-- Áreas de producción + costos por minuto (data del Excel del cliente)
insert into public.areas_produccion (codigo, nombre, valor_minuto, activa)
values
  ('CORTE',     'Corte',           0.211, true),
  ('DECORADO',  'Decorado',        0.110, true),
  ('ESTAMPADO', 'Estampado',       0.152, true),
  ('BORDADO',   'Bordado',         0.234, true),
  ('SUBLIMADO', 'Sublimado',       0.373, true),
  ('PLISADO',   'Plisado',         0.133, true),
  ('ACABADO',   'Acabado',         0.152, true),
  ('PLANCHADO', 'Planchado',       0.133, true),
  ('TALLER',    'Servicio Taller', 0.183, true)
on conflict (codigo) do update set
  nombre       = excluded.nombre,
  valor_minuto = excluded.valor_minuto,
  activa       = true;

comment on column public.areas_produccion.valor_minuto is
  'Costo en S/ por minuto de operación en esa área. Usado para costear órdenes de servicio y producción.';
