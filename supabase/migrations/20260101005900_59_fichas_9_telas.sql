-- ===========================================================================
-- Ficha técnica: pasar de 2 a 9 telas (principal + 8 secundarias)
-- ===========================================================================
-- Cliente reportó (reunión post-2026-07-08): "nuestros disfraces requieren
-- hasta de 9 tipos de tela". Actualmente solo hay tela_principal + tela_secundaria.
-- Agregamos 7 sets más (tela_secundaria_2 hasta tela_secundaria_8).
-- ===========================================================================

do $$
declare
  i integer;
  campos text[] := array['nombre', 'composicion', 'color', 'densidad', 'ancho'];
  campo text;
begin
  for i in 2..8 loop
    foreach campo in array campos loop
      execute format(
        'alter table public.productos_fichas_tecnicas add column if not exists tela_secundaria_%s_%s text',
        i, campo
      );
    end loop;
  end loop;
end$$;
