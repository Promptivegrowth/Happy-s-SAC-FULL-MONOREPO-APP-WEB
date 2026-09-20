-- Que dos turnos abiertos en la misma caja sean IMPOSIBLES, no sólo improbables.
--
-- El POS ya lo comprueba antes de abrir: busca un turno sin cerrar en esa caja
-- y se niega, diciendo quién la tiene. Pero eso es una comprobación seguida de
-- una escritura, y entre las dos cabe otra persona haciendo lo mismo desde otra
-- computadora. Fue lo que pasó en tienda Huallaga el 19/09/2026, cuando Julisa
-- quedó con dos cuentas abiertas sobre la misma caja.
--
-- Dos turnos a la vez parten el cuadre en dos: las ventas se reparten entre
-- sesiones y ninguna cuadra contra el efectivo del cajón.
--
-- El índice que había marcaba lo mismo pero SIN ser único, así que servía para
-- buscar rápido y para nada más. Este ocupa su lugar: mismo filtro, misma
-- utilidad para las consultas, y además la base rechaza el segundo turno.
--
-- No estorba el cambio de turno: un cierre parcial escribe en
-- cajas_cierres_parciales y deja la MISMA sesión abierta, no crea otra.

drop index if exists cajas_sesiones_caja_abierta_idx;

create unique index if not exists cajas_sesiones_una_abierta_por_caja
  on public.cajas_sesiones (caja_id)
  where cerrada_en is null;
