-- ===========================================================================
-- HAPPY SAC — Operarios (personal de planta propia)
-- ===========================================================================

create table if not exists public.operarios (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombres text not null,
  apellido_paterno text,
  apellido_materno text,
  dni text unique,
  telefono text,
  email text,
  area_id uuid references public.areas_produccion(id),
  tipo_contrato text check (tipo_contrato in ('PLANILLA','DESTAJO','MIXTO','HONORARIOS')),
  tarifa_destajo numeric(12,4),
  sueldo_base numeric(12,2),
  usuario_id uuid references auth.users(id),        -- si el operario tiene acceso al sistema
  fecha_ingreso date default current_date,
  fecha_salida date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create trigger operarios_updated_at before update on public.operarios
  for each row execute function public.tg_set_updated_at();

-- Asistencia simple (opcional — puede conectarse a biométrico externo)
create table if not exists public.asistencias (
  id bigserial primary key,
  operario_id uuid not null references public.operarios(id) on delete cascade,
  fecha date not null,
  hora_entrada time,
  hora_salida time,
  horas_trabajadas numeric(6,2),
  observacion text,
  created_at timestamptz default now(),
  unique (operario_id, fecha)
);

-- Adelantos / préstamos al operario
create table if not exists public.operarios_adelantos (
  id uuid primary key default gen_random_uuid(),
  operario_id uuid not null references public.operarios(id) on delete cascade,
  fecha date not null default current_date,
  monto numeric(12,2) not null,
  motivo text,
  estado text default 'PENDIENTE' check (estado in ('PENDIENTE','DESCONTADO','CONDONADO')),
  created_at timestamptz default now()
);

-- Producción registrada por operario (del destajo)
create table if not exists public.operarios_produccion (
  id bigserial primary key,
  operario_id uuid not null references public.operarios(id) on delete cascade,
  fecha date not null default current_date,
  proceso tipo_proceso_produccion,
  ot_id uuid,                                     -- FK diferida
  producto_id uuid references public.productos(id),
  talla talla_prenda,
  cantidad numeric(10,2) not null,
  tarifa_unitaria numeric(12,4) not null default 0,
  subtotal numeric(12,2) generated always as (cantidad * tarifa_unitaria) stored,
  observacion text,
  registrado_por uuid references auth.users(id),
  created_at timestamptz default now()
);
create index operarios_produccion_op_fecha_idx on public.operarios_produccion (operario_id, fecha);
