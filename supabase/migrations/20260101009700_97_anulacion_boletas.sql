-- ===========================================================================
-- 97 — Anulación de boletas: quién, cuándo, por qué, y si SUNAT ya lo sabe
-- ===========================================================================
--
-- Una boleta mal emitida en el mostrador hay que poder anularla, y SUNAT tiene
-- que enterarse. Las boletas no se dan de baja de a una: se informan dentro del
-- Resumen Diario, marcadas con la condición "anular". Da lo mismo si la boleta
-- ya había sido aceptada o si todavía no se había informado: el camino es el
-- mismo resumen.
--
-- `anulacion_informada_en` es lo que evita informar dos veces la misma baja.
-- Nulo significa "anulada acá, SUNAT todavía no lo sabe"; con fecha, ya viajó
-- en un resumen que SUNAT aceptó.
--
-- El motivo no es burocracia: es lo único que después explica por qué falta un
-- número en la secuencia.

alter table public.comprobantes
  add column if not exists anulado_en timestamptz,
  add column if not exists anulado_por uuid references auth.users(id),
  add column if not exists motivo_anulacion text,
  add column if not exists anulacion_informada_en timestamptz;

comment on column public.comprobantes.anulacion_informada_en is
  'Cuándo SUNAT aceptó la baja dentro de un Resumen Diario. Nulo = anulada '
  'localmente pero todavía sin informar.';

-- Las bajas pendientes se buscan en cada corrida del envío automático; sin
-- índice eso es un recorrido completo de la tabla cada quince minutos.
create index if not exists comprobantes_anulacion_pendiente_idx
  on public.comprobantes (fecha_emision)
  where estado = 'ANULADO' and anulacion_informada_en is null;
