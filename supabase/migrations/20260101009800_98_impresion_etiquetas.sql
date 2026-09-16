-- ===========================================================================
-- 98 — El agente aprende a imprimir etiquetas, sin arriesgar los tickets
-- ===========================================================================
--
-- Hasta ahora la cola solo llevaba tickets ESC/POS para la ticketera térmica.
-- Se suman las etiquetas de código de barras, que van a una Zebra ZD421 en
-- lenguaje ZPL. Son dos cosas distintas en todo: otro idioma, otra impresora,
-- otra computadora.
--
-- `tipo` arranca en TICKET para todo lo que ya existe, y es lo que el agente
-- mira para saber a qué impresora mandar cada trabajo.
--
-- ── Por qué esto importa más de lo que parece ──
--
-- El agente instalado en las cajas es la versión 2.3 y no sabe de etiquetas.
-- Si le llegara un trabajo ZPL, se lo mandaría a la ticketera: la máquina no
-- entiende esos comandos, imprime basura y sigue sacando papel hasta que
-- alguien la apaga. Ya pasó una vez, por otra vía, y no se puede repetir.
--
-- Por eso el servidor solo entrega etiquetas a un agente que declare saber
-- imprimirlas. Un agente viejo pide su cola y recibe únicamente tickets, como
-- siempre. La protección vive en /api/impresion/pendientes; acá queda el dato
-- que la hace posible.

alter table public.cola_impresion
  add column if not exists tipo text not null default 'TICKET';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cola_impresion_tipo_check'
  ) then
    alter table public.cola_impresion
      add constraint cola_impresion_tipo_check check (tipo in ('TICKET', 'ETIQUETA'));
  end if;
end $$;

comment on column public.cola_impresion.tipo is
  'TICKET = ESC/POS a la ticketera. ETIQUETA = ZPL a la Zebra. Decide a qué '
  'impresora va el trabajo y qué agentes pueden recibirlo.';

-- La Zebra es otra impresora, en otra computadora: no se puede reusar el campo
-- de la ticketera.
alter table public.equipos_impresion
  add column if not exists impresora_etiquetas text;

comment on column public.equipos_impresion.impresora_etiquetas is
  'Nombre en Windows de la impresora de etiquetas (Zebra). Vacío = esta '
  'computadora no imprime etiquetas.';

-- El agente lo informa al pedir su cola; el servidor decide con esto si le
-- puede entregar trabajos de etiquetas.
alter table public.equipos_impresion
  add column if not exists capacidades text;

comment on column public.equipos_impresion.capacidades is
  'Lo que el agente declara saber hacer, separado por comas: ticket, etiqueta. '
  'Vacío = agente antiguo, solo tickets.';

-- El agente busca su cola cada segundo; sin esto son dos recorridos de tabla
-- por segundo y por caja.
create index if not exists cola_impresion_pendientes_idx
  on public.cola_impresion (equipo_id, tipo, created_at)
  where estado = 'pendiente';
