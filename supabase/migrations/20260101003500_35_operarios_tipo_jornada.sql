-- ===========================================================================
-- HAPPY SAC — Operarios: tipo_operario + jornada (estándar global + override
-- por operario) + correlativo OP-NNN.
-- ===========================================================================

-- 1) Nuevas columnas en operarios
alter table public.operarios
  add column if not exists tipo_operario text
    check (tipo_operario in (
      'OPERARIO','AYUDANTE','SUPERVISOR','JEFE_AREA','ADMINISTRATIVO','SERVICIO'
    )) default 'OPERARIO',
  add column if not exists jornada_personalizada boolean not null default false,
  add column if not exists jornada_inicio time,
  add column if not exists jornada_fin time,
  add column if not exists jornada_dias text[]; -- ['LUN','MAR','MIE','JUE','VIE','SAB','DOM']

comment on column public.operarios.tipo_operario is
  'Categoría laboral (no es el cargo). OPERARIO por defecto.';
comment on column public.operarios.jornada_personalizada is
  'Si true, usa jornada_inicio/fin/dias propios; si false, usa la jornada estándar de configuracion.';

-- 2) Jornada estándar global en configuracion (idempotente)
insert into public.configuracion (clave, valor, descripcion) values
  ('jornada_estandar_inicio', '"08:00"',
    'Hora de entrada estándar para operarios sin jornada personalizada (HH:MM).'),
  ('jornada_estandar_fin', '"17:00"',
    'Hora de salida estándar para operarios sin jornada personalizada (HH:MM).'),
  ('jornada_estandar_dias',
    '["LUN","MAR","MIE","JUE","VIE","SAB"]'::jsonb,
    'Días laborables estándar (codigos de 3 letras en mayúscula).')
on conflict (clave) do nothing;
