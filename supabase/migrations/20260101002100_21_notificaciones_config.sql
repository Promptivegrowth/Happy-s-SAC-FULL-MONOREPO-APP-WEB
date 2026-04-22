-- ===========================================================================
-- HAPPY SAC — Configuración global, notificaciones y log de comunicaciones
-- ===========================================================================

create table if not exists public.configuracion (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  actualizado_por uuid references auth.users(id),
  updated_at timestamptz default now()
);

-- Inicial: parámetros operativos por defecto
insert into public.configuracion (clave, valor, descripcion) values
  ('whatsapp_pedidos', '"51916856842"', 'Número WhatsApp para pedidos sin pago online'),
  ('email_remitente', '"ventas@disfraceshappys.com"', 'Email remitente notificaciones'),
  ('moneda_base', '"PEN"', 'Moneda base'),
  ('igv_porcentaje', '18.00', 'Porcentaje IGV vigente'),
  ('umbral_envio_gratis', '199', 'Pedidos sobre este monto envío gratis'),
  ('costo_envio_lima', '15', 'Costo envío Lima Metropolitana'),
  ('costo_envio_provincia', '25', 'Costo envío provincia (referencial)'),
  ('redes_sociales', '{"facebook":"https://facebook.com/disfraceshappys","instagram":"https://instagram.com/disfraceshappys","tiktok":""}', 'Redes sociales del sitio')
  on conflict (clave) do nothing;

-- Notificaciones in-app (campanita en el ERP)
create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  destinatario_usuario_id uuid references auth.users(id) on delete cascade,
  destinatario_rol rol_sistema,
  tipo text not null,                              -- 'STOCK_BAJO','PAGO_PENDIENTE','OT_RETRASADA','RECLAMO_NUEVO', etc.
  titulo text not null,
  mensaje text,
  enlace text,
  leido boolean default false,
  leido_en timestamptz,
  meta jsonb,
  created_at timestamptz default now()
);
create index notificaciones_dest_idx on public.notificaciones (destinatario_usuario_id, leido) where destinatario_usuario_id is not null;
create index notificaciones_rol_idx on public.notificaciones (destinatario_rol, leido) where destinatario_rol is not null;

-- Log de correos enviados (auditable)
create table if not exists public.correos_log (
  id bigserial primary key,
  destinatario citext not null,
  asunto text,
  template text,
  estado text default 'PENDIENTE' check (estado in ('PENDIENTE','ENVIADO','FALLIDO')),
  proveedor text,                                  -- 'resend', 'sendgrid', 'supabase'
  proveedor_id text,
  payload jsonb,
  error text,
  enviado_en timestamptz,
  created_at timestamptz default now()
);

-- Webhooks recibidos (Culqi, Izipay, SUNAT, etc.)
create table if not exists public.webhooks_log (
  id bigserial primary key,
  proveedor text not null,
  evento text,
  payload jsonb,
  procesado boolean default false,
  procesado_en timestamptz,
  error text,
  created_at timestamptz default now()
);
