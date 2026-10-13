-- =============================================================================
-- 116 · Secretos de integraciones (token de Decolecta, etc.)
--
-- El token de Decolecta vivía solo en las variables de Vercel de los tres
-- proyectos: cambiarlo exigía entrar a Vercel tres veces y volver a desplegar.
-- El 13/10/2026 el cupo de la cuenta se agotó y hubo que cambiarlo de urgencia.
--
-- Esta tabla lo guarda en la base. RLS activo y SIN políticas: ningún usuario
-- (ni anónimo ni del ERP) puede leerla; solo el cliente de servicio del
-- servidor. La consulta de DNI/RUC toma de acá el token y, si no hay, usa la
-- variable de entorno DECOLECTA_TOKEN como antes.
-- =============================================================================

create table if not exists public.secretos_integracion (
  clave       text primary key,
  valor       text not null,
  nota        text,
  updated_at  timestamptz not null default now()
);

alter table public.secretos_integracion enable row level security;
revoke all on public.secretos_integracion from anon, authenticated;

comment on table public.secretos_integracion is
  'Tokens de servicios externos. Sin políticas RLS a propósito: solo el cliente de servicio la lee.';
