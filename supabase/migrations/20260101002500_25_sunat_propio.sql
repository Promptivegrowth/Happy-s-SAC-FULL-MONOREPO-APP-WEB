-- ===========================================================================
-- HAPPY SAC — SUNAT facturación electrónica propia (con certificado digital)
-- ===========================================================================

-- Configuración SUNAT por empresa
create table if not exists public.sunat_config (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id) on delete cascade,

  -- Modo de operación
  ambiente text not null default 'BETA' check (ambiente in ('BETA','PRODUCCION')),

  -- Credenciales SOL (usuario secundario que firma)
  usuario_sol text not null,
  clave_sol text not null,           -- ⚠️ Encriptar con pgcrypto en producción

  -- Endpoints SUNAT
  endpoint_factura text not null default 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  endpoint_guia text not null default 'https://e-beta.sunat.gob.pe/ol-ti-itemision-otroscpe-gem-beta/billService',
  endpoint_consulta text default 'https://e-beta.sunat.gob.pe/ol-it-wsconscpegem-beta/billConsultService',

  -- Certificado digital (.pfx en base64)
  certificado_pfx_base64 text,
  certificado_password text,         -- ⚠️ Encriptar
  certificado_subject text,          -- "CN=..., O=..." para info
  certificado_vencimiento date,

  -- Datos del firmante
  firmante_nombre text,
  firmante_cargo text default 'Gerente General',

  activo boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (empresa_id)
);
create trigger sunat_config_updated_at before update on public.sunat_config
  for each row execute function public.tg_set_updated_at();

-- Solo gerente puede ver/editar
alter table public.sunat_config enable row level security;

drop policy if exists "sunat_config_admin" on public.sunat_config;
create policy "sunat_config_admin" on public.sunat_config
  for all using (public.es_admin()) with check (public.es_admin());

-- Trazabilidad de envíos a SUNAT
create table if not exists public.sunat_envios (
  id bigserial primary key,
  comprobante_id uuid references public.comprobantes(id) on delete cascade,
  fecha timestamptz not null default now(),
  intento integer not null default 1,

  xml_enviado text,                      -- XML UBL firmado (puede ir a Storage)
  xml_zip_path text,                     -- Path del .zip subido a Storage
  cdr_path text,                         -- Path del CDR descargado a Storage
  cdr_xml text,                          -- XML CDR del response

  endpoint_url text,
  http_status integer,
  soap_fault text,

  sunat_codigo text,                     -- 0 = aceptado, 2xxx = rechazado, 4xxx = obs
  sunat_descripcion text,

  duracion_ms integer,
  exitoso boolean,
  observaciones jsonb,                   -- ['1234: ...', ...]
  hash_documento text,
  notas text
);
create index sunat_envios_comp_idx on public.sunat_envios (comprobante_id, fecha desc);

-- Vista para ver el último envío por comprobante
create or replace view public.v_comprobantes_sunat as
select
  c.*,
  (select e.exitoso from public.sunat_envios e where e.comprobante_id = c.id order by e.fecha desc limit 1) as ultimo_envio_exitoso,
  (select e.sunat_codigo from public.sunat_envios e where e.comprobante_id = c.id order by e.fecha desc limit 1) as ultimo_codigo,
  (select e.sunat_descripcion from public.sunat_envios e where e.comprobante_id = c.id order by e.fecha desc limit 1) as ultimo_mensaje,
  (select e.fecha from public.sunat_envios e where e.comprobante_id = c.id order by e.fecha desc limit 1) as ultimo_envio_en
from public.comprobantes c;

comment on table public.sunat_config is
  'Config SUNAT de la empresa: certificado digital .pfx (base64), claves SOL y endpoints. Singleton por empresa.';
comment on table public.sunat_envios is
  'Historial de envíos a SUNAT. Cada intento queda registrado con su CDR.';
