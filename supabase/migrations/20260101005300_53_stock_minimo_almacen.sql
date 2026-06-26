-- Migración 53: stock mínimo configurable por almacén.
--
-- Antes: el stock mínimo era un único valor por VARIANTE
--   (productos_variantes.stock_minimo o materiales.stock_minimo).
-- Eso no servía porque el umbral de "stock bajo" depende del local:
--   - Santa Bárbara (central) maneja más stock → mínimo 5
--   - Tienda La Quinta (punto venta) → mínimo 3
--   - Tienda Huallaga (punto venta) → mínimo 1
--
-- Ahora: cada almacén define su PROPIO umbral por defecto y la query
-- de alertas usa ese umbral en lugar del global.
--
-- Aditivo y sin breaking change: si el cliente no configura el campo,
-- queda en 5 (mismo comportamiento previo).

alter table public.almacenes
  add column if not exists stock_minimo_default integer not null default 5;

comment on column public.almacenes.stock_minimo_default is
  'Umbral de "stock bajo" por defecto para alertas en este almacén. Si una variante tiene su propio stock_minimo > 0, se usa ese (más específico). Sino, este.';

-- Setear los valores acordados con el cliente
update public.almacenes set stock_minimo_default = 5 where codigo = 'ALM-SB';
update public.almacenes set stock_minimo_default = 3 where codigo = 'TDA-LQ';
update public.almacenes set stock_minimo_default = 1 where codigo = 'TDA-HU';
update public.almacenes set stock_minimo_default = 0 where codigo in ('ALM-MP', 'ALM-MR');  -- no alertan
