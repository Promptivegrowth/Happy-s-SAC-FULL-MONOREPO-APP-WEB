-- 92_sunat_cola_envio
--
-- El POS emite el comprobante y NO llama a SUNAT en el momento: así una caída
-- de SUNAT nunca detiene una venta. La contra es que hasta ahora el envío
-- dependía de que alguien entrara al ERP y lo mandara a mano — y en la base los
-- 33 comprobantes existentes estaban en BORRADOR, sin enviar nunca.
--
-- Con estas columnas el envío pasa a ser una COLA que un proceso automático
-- drena cada pocos minutos, con reintentos espaciados. El plazo legal para
-- enviar la factura corre desde su emisión, así que un comprobante que se
-- quede sin enviar es un problema tributario, no solo un pendiente operativo.

alter table public.comprobantes
  add column if not exists sunat_intentos        integer not null default 0,
  add column if not exists sunat_ultimo_error    text,
  add column if not exists sunat_proximo_intento timestamptz;

-- Los pendientes se buscan por (estado, próximo intento).
create index if not exists idx_comprobantes_cola_sunat
  on public.comprobantes (estado, sunat_proximo_intento)
  where estado in ('BORRADOR', 'EMITIDO', 'RECHAZADO');

comment on column public.comprobantes.sunat_intentos is
  'Cuántas veces se intentó enviar a SUNAT. Lo usa el proceso automático para espaciar los reintentos.';
comment on column public.comprobantes.sunat_proximo_intento is
  'Momento a partir del cual se puede reintentar el envío. NULL = se puede intentar ya.';
comment on column public.comprobantes.sunat_ultimo_error is
  'Último error devuelto por SUNAT o por la red, para diagnóstico sin abrir el log.';

-- Bitácora de las corridas del proceso automático, para saber si está vivo.
create table if not exists public.sunat_envios_log (
  id              bigserial primary key,
  ejecutado_en    timestamptz not null default now(),
  enviados        integer not null default 0,
  aceptados       integer not null default 0,
  fallidos        integer not null default 0,
  resumen_diario  text,
  detalle         text,
  duracion_ms     integer
);

comment on table public.sunat_envios_log is
  'Una fila por corrida del envío automático a SUNAT. Sirve para verificar que el proceso sigue corriendo.';

alter table public.sunat_envios_log enable row level security;

drop policy if exists sunat_envios_log_read on public.sunat_envios_log;
create policy sunat_envios_log_read on public.sunat_envios_log
  for select using (auth.uid() is not null);
