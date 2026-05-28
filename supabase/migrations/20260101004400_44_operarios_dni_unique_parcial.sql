-- ===========================================================================
-- HAPPY SAC — Operarios: UNIQUE de DNI solo entre activos.
-- ---------------------------------------------------------------------------
-- Antes: dni text UNIQUE → bloqueaba reusar el DNI aunque el operario
-- estuviera inactivo (soft-delete). Caso típico: el cliente "elimina" a
-- alguien y al rato necesita volver a darlo de alta — el sistema lo
-- rechazaba con duplicate key.
--
-- Ahora: UNIQUE parcial sobre dni para filas activas con dni no nulo.
-- Esto permite tener varios operarios históricos inactivos con el mismo
-- DNI (p.ej. alguien que ingresó, salió y vuelve a entrar) pero solo 1
-- activo a la vez.
-- ===========================================================================

-- Identificar y dropear el unique constraint existente sobre (dni).
-- El nombre típico en Postgres es <tabla>_<columna>_key.
do $$
declare
  v_constraint text;
begin
  select tc.constraint_name into v_constraint
  from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'operarios'
    and tc.constraint_type = 'UNIQUE'
    and kcu.column_name = 'dni'
  limit 1;
  if v_constraint is not null then
    execute format('alter table public.operarios drop constraint %I', v_constraint);
  end if;
end $$;

-- Índice único parcial: dni no nulo y operario activo.
create unique index if not exists operarios_dni_activo_uidx
  on public.operarios (dni)
  where activo = true and dni is not null;

comment on index public.operarios_dni_activo_uidx is
  'UNIQUE parcial: garantiza 1 operario activo por DNI. Inactivos pueden compartir DNI con el activo o entre sí (historial).';
