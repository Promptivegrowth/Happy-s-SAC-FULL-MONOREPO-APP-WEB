-- Migración 84: autorización de cierre de corte cuando la cantidad real difiere
-- de la teórica del plan (pedido cliente 2026-08-24).
--
-- Antes: agregar una línea con real ≠ teórica exigía ser gerente en el momento.
-- Ahora: cualquiera puede ingresar las cantidades, pero si hay diferencia NO se
-- puede CERRAR el corte — se envía una solicitud de autorización a gerencia.
-- Gerencia autoriza y el corte se cierra.

alter table public.ot_corte
  add column if not exists autorizacion_estado text
    check (autorizacion_estado is null or autorizacion_estado in ('PENDIENTE','AUTORIZADA')),
  add column if not exists autorizacion_solicitada_por uuid references auth.users(id),
  add column if not exists autorizacion_motivo text;
