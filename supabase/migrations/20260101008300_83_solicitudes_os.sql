-- Migración 83: solicitudes de aprobación de Órdenes de Servicio.
--
-- Flujo pedido por el cliente (2026-08-17): un usuario no-gerente puede ingresar
-- el precio de campaña/movilidad en una OS, pero en vez de generar la orden, se
-- envía una SOLICITUD DE APROBACIÓN. Gerencia recibe una notificación; al aprobar,
-- la OS se genera automáticamente. Si se rechaza, se avisa al solicitante.
--
-- La OS nace "EMITIDA" (activa), así que la espera de aprobación se modela como
-- tabla aparte (no como OS en borrador). El payload guarda todos los campos para
-- recrear la OS al aprobar.

create table if not exists public.solicitudes_os (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE','APROBADA','RECHAZADA','ANULADA')),
  solicitante_id uuid references auth.users(id),
  aprobador_id uuid references auth.users(id),
  -- Campos de referencia (para listar/mostrar sin desarmar el payload)
  ot_id uuid references public.ot(id),
  taller_id uuid references public.talleres(id),
  proceso text,
  monto_base numeric(14,4) default 0,
  movilidad_por_unidad numeric(12,4) default 0,
  campana_por_unidad numeric(12,4) default 0,
  es_campana boolean default false,
  -- Todo lo necesario para recrear la OS al aprobar (osSchema + tallas)
  payload jsonb not null,
  motivo_solicitud text,
  motivo_rechazo text,
  os_generada_id uuid references public.ordenes_servicio(id),
  created_at timestamptz not null default now(),
  resuelto_en timestamptz
);

create index if not exists solicitudes_os_estado_idx on public.solicitudes_os (estado, created_at desc);
create index if not exists solicitudes_os_solicitante_idx on public.solicitudes_os (solicitante_id);

alter table public.solicitudes_os enable row level security;

-- Todo el staff puede ver/crear/resolver solicitudes (el gate de "solo gerente
-- aprueba" se aplica en la capa de aplicación, igual que aprobarPlan).
create policy solicitudes_os_staff on public.solicitudes_os for all
  using (
    auth.uid() is not null and public.tiene_algun_rol(
      array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[])
  )
  with check (
    auth.uid() is not null and public.tiene_algun_rol(
      array['gerente','jefe_produccion','operario','almacenero','cajero','vendedor_b2b','contador']::rol_sistema[])
  );
