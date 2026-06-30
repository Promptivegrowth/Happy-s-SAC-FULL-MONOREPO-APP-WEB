-- Migración 54: ajustes post-reunión cliente (POS v2)
--
-- Aplica las observaciones de la reunión del 27/06/2026:
--   1) Galería de productos: cambiar de 5 a 8 imágenes máximo
--   2) Almacén de Merma (ALM-MR): eliminar de operación (queda como inactivo
--      e invisible, pero NO se borra para preservar movimientos históricos)
--   3) Tipos de movimiento manual: ya queda restringido en código (ENTRADA_AJUSTE
--      / SALIDA_AJUSTE) — no necesita cambio de schema
--   4) Restricción solo gerente para "Registrar movimiento": se valida en código
--
-- Aditiva — NO toca tablas existentes.

-- ===========================================================================
-- 1) Eliminar almacén de Merma de operación
-- ===========================================================================
-- Lo marcamos como INACTIVO (no aparece en NINGÚN selector ni listado) y
-- agregamos prefijo [INACTIVO] al nombre para que quede obvio en reportes
-- históricos. No usamos DELETE porque tiene 3 movimientos en kardex_movimientos
-- + posibles referencias en trazabilidad_eventos.
update public.almacenes
   set activo = false,
       oculto_en_selectores = true,
       nombre = '[INACTIVO] ' || regexp_replace(nombre, '^\[INACTIVO\] ', ''),
       notas = coalesce(notas || E'\n', '') || 'Inactivado el 27/06/2026 por decisión del cliente — la merma se maneja desde Control de Calidad sin almacén dedicado.'
 where codigo = 'ALM-MR';

-- ===========================================================================
-- 2) Configuración de galería: 8 imágenes máximo
-- ===========================================================================
-- Lo guardamos en empresa para que sea editable después sin código.
alter table public.empresa
  add column if not exists max_imagenes_producto integer not null default 8;

comment on column public.empresa.max_imagenes_producto is
  'Cantidad máxima de imágenes en la galería de cada producto. Default 8 (3 técnicas + hasta 5 colores).';
