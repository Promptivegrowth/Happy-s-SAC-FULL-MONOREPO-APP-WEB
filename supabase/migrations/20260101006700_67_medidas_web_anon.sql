-- Mig 67 — Cuadro de medidas visible en la web pública
-- Contexto (20/07/2026): el cliente cargó el cuadro de medidas en la ficha
-- técnica (falda de marinera) y pidió verlo en la página del producto de la
-- web. El componente TablaMedidas ya existía en la web, pero RLS bloqueaba
-- al rol anon: productos_fichas_tecnicas / fichas_medidas /
-- fichas_medidas_valores solo tenían políticas para staff, así que la query
-- devolvía [] y el botón nunca aparecía.
-- Se expone SOLO lo necesario: fichas vigentes y sus medidas/valores.
-- El resto de la ficha (composición, corte, avíos, costos) sigue bloqueado
-- porque la web solo consulta estas tres tablas para el cuadro de medidas.

create policy fichas_select_web_vigente on productos_fichas_tecnicas
  for select to anon using (vigente = true);

create policy fichas_medidas_select_web on fichas_medidas
  for select to anon using (
    exists (
      select 1 from productos_fichas_tecnicas f
      where f.id = fichas_medidas.ficha_id and f.vigente
    )
  );

create policy fichas_valores_select_web on fichas_medidas_valores
  for select to anon using (
    exists (
      select 1
      from fichas_medidas m
      join productos_fichas_tecnicas f on f.id = m.ficha_id
      where m.id = fichas_medidas_valores.medida_id and f.vigente
    )
  );

-- Nota: en la misma fecha se ocultaron del POS (visible_pos = false) las
-- cuentas "YAPE (BCP HAPPYS)", "PLIN (INTERBANK HAPPYS)" y
-- "DEPÓSITO (INTERBANK HAPPYS)" a pedido del cliente: yape/plin se
-- registran directo en BCP HAPPYS / INTERBANK HAPPYS. Siguen activas para
-- reportes y web (cambio de datos, no de esquema).
