-- ===========================================================================
-- 99 — Los bultos del traslado se describen en texto libre
-- ===========================================================================
--
-- Había tres casilleros: cantidad, tipo (una lista cerrada: costales, cajas,
-- paquetes…) y peso. Servían mientras un envío fuera de una sola clase de
-- bulto, y resulta que nunca lo es.
--
-- Lo explicó la encargada de despacho (16/09/2026), y Javier lo aprobó:
--
--   "no solamente mandamos costales de mercadería, sino también bolsas negras
--    donde pongo sombreros o algunos accesorios, y también colgadores porque
--    hacemos unas faldas de marinera, entonces eso no se empaqueta, se va
--    libre, se le pone en el colgador para que no pierda el planchado"
--
-- Con tres campos fijos eso no entra: hay que elegir uno y el resto del envío
-- queda sin declarar en la guía, que es justo el papel que mira quien recibe.
-- También manda cortes a talleres externos y necesita anotar de quién es cada
-- costal — "tres costales de corte, con el nombre del taller y de la señora
-- que lo va a recoger" — que tampoco cabía en ningún casillero.
--
-- Las tres columnas viejas NO se borran: hay traslados ya emitidos con ese
-- dato y sus guías se tienen que poder reimprimir igual que salieron.

alter table public.traslados
  add column if not exists bultos_detalle text;

comment on column public.traslados.bultos_detalle is
  'Qué se manda, en texto libre y en varias líneas: "4 costales de disfraces / '
  '3 colgadores / 2 bolsas negras". Reemplaza a cantidad_bultos + tipo_bulto + '
  'peso_total_kg, que quedan solo para los traslados anteriores.';

-- Los traslados que ya tenían los campos viejos arrancan con el mismo texto
-- que venía saliendo impreso, así la guía no cambia al reimprimirse y el
-- código puede leer una sola columna.
update public.traslados
set bultos_detalle =
  cantidad_bultos::text || ' ' || coalesce(nullif(trim(tipo_bulto), ''), 'BULTOS')
  || case
       when peso_total_kg is not null and peso_total_kg > 0
         then ' · Peso total: ' || to_char(peso_total_kg, 'FM999999990.00') || ' kg'
       else ''
     end
where bultos_detalle is null
  and cantidad_bultos is not null
  and cantidad_bultos > 0;
