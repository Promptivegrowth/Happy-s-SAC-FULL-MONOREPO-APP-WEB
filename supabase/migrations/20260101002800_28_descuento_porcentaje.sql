-- ===========================================================================
-- HAPPY SAC — Descuento por porcentaje en productos publicados
-- ===========================================================================
-- Antes: solo había precio_oferta (valor absoluto en S/) por publicación.
-- Ahora: agregamos descuento_porcentaje (0-99) que se aplica al
-- precio_publico de cada variante, con la posibilidad de excluir
-- ciertas tallas del descuento (ej. tallas extra grandes).
-- ===========================================================================

alter table public.productos_publicacion
  add column if not exists descuento_porcentaje smallint
    check (descuento_porcentaje is null or (descuento_porcentaje >= 0 and descuento_porcentaje <= 99)),
  add column if not exists descuento_excluir_tallas text[] not null default '{}';

comment on column public.productos_publicacion.descuento_porcentaje is
  'Porcentaje de descuento (0-99) aplicado al precio_publico de cada variante. NULL = sin descuento. Tiene prioridad sobre precio_oferta.';
comment on column public.productos_publicacion.descuento_excluir_tallas is
  'Array de tallas (T0, T6, etc.) que NO reciben el descuento. Vacío = aplica a todas.';

-- Índice parcial: facilita listar productos con descuento activo (ej. para
-- una página /ofertas en la web).
create index if not exists productos_publicacion_descuento_idx
  on public.productos_publicacion (descuento_porcentaje)
  where publicado and descuento_porcentaje > 0;
