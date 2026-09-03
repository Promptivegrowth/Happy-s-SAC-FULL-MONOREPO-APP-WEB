-- 87_sunat_resumenes
-- Seguimiento de los Resúmenes Diarios de Boletas (RC) enviados a SUNAT.
-- El resumen es asíncrono: se envía (sendSummary → ticket) y luego se consulta
-- (getStatus → CDR). Guardamos el ticket y el estado para poder consultar luego.

create table if not exists public.sunat_resumenes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresa(id),
  resumen_id text not null,              -- RC-YYYYMMDD-N
  fecha_referencia date not null,        -- día de las boletas informadas
  fecha_generacion date not null,        -- día de envío (Perú)
  correlativo integer not null,
  ticket text,                           -- ticket devuelto por sendSummary
  estado text not null default 'ENVIADO' check (estado in ('ENVIADO','EN_PROCESO','ACEPTADO','RECHAZADO','ERROR')),
  cantidad_boletas integer not null default 0,
  sunat_codigo text,
  sunat_descripcion text,
  cdr_path text,
  xml_zip_path text,
  observaciones jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists ix_sunat_resumenes_empresa_fecha
  on public.sunat_resumenes (empresa_id, fecha_referencia desc);

alter table public.sunat_resumenes enable row level security;

-- Solo staff administrativo (gerente/contador) gestiona resúmenes.
drop policy if exists "staff_manage_resumenes" on public.sunat_resumenes;
create policy "staff_manage_resumenes" on public.sunat_resumenes
  for all using (
    auth.uid() is not null
    and public.tiene_algun_rol(array['gerente','contador']::rol_sistema[])
  ) with check (
    auth.uid() is not null
    and public.tiene_algun_rol(array['gerente','contador']::rol_sistema[])
  );
