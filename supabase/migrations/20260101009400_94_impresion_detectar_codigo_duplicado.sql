-- ─────────────────────────────────────────────────────────────────────────────
-- 94: detectar el mismo código de instalación en dos computadoras
--
-- El código identifica a UNA computadora. Si se pega el mismo en dos, las dos
-- preguntan por la misma cola y se reparten los tickets al azar: un comprobante
-- sale en la caja y el siguiente en la otra máquina, o peor, las dos levantan el
-- mismo y el ticket sale impreso DOS VECES. Desde el ERP no había forma de
-- notarlo — la fila se ve igual de sana, y los campos que informa el agente
-- (ticketera, lista de impresoras) van cambiando según cuál preguntó último.
--
-- Pasó de verdad en la instalación (2026-09-15).
--
-- El agente ahora manda el nombre de la computadora en cada consulta. Se guarda
-- la última y se acumulan las distintas: con más de una en la lista, el ERP
-- avisa. Un cambio legítimo de computadora también deja dos, así que la lista
-- se puede limpiar desde el ERP una vez resuelto.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.equipos_impresion
  add column if not exists maquina text,
  add column if not exists maquinas_vistas text;

comment on column public.equipos_impresion.maquina is
  'Nombre de Windows de la computadora que reportó por última vez.';
comment on column public.equipos_impresion.maquinas_vistas is
  'Computadoras distintas que usaron este código, separadas por |. Más de una significa que el mismo código se instaló en varias máquinas y los tickets se están repartiendo entre ellas.';
