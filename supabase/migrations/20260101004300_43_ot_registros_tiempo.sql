-- ===========================================================================
-- HAPPY SAC — Registros de tiempo por operación en OT (sustituye mig 40).
-- ---------------------------------------------------------------------------
-- La mig 40 (ot_tiempos_reales) modelaba un único override por (ot, proceso,
-- talla) con tiempo POR UNIDAD. El cliente confirmó que en la práctica el
-- avance se declara de otra forma:
--
--   - En CORTE: tiempo TOTAL por operación (no por prenda).
--   - En otras áreas: unidades procesadas + tiempo total del lote.
--   - Cada avance puede registrarse vía fecha_inicio + fecha_fin (sistema
--     calcula duración) o tiempo_total_min directo.
--   - Múltiples registros por (ot, proceso, talla): cada lote = 1 fila.
--
-- ot_tiempos_reales se mantiene por compatibilidad pero ya no se usa. Los
-- datos se backfillean a la nueva tabla.
-- ===========================================================================

create table if not exists public.ot_registros_tiempo (
  id uuid primary key default gen_random_uuid(),
  ot_id uuid not null references public.ot(id) on delete cascade,
  proceso_id uuid not null references public.productos_procesos(id) on delete cascade,
  talla text not null,                       -- talla específica del registro
  fecha_inicio timestamptz,                  -- nullable: solo si se ingresó por intervalo
  fecha_fin timestamptz,
  tiempo_total_min numeric(10,2) not null,   -- siempre presente (calculado o directo)
  unidades_procesadas integer,               -- nullable (opcional, ej. en CORTE puede estar vacío)
  operario_id uuid references public.operarios(id) on delete set null,
  notas text,
  registrado_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tiempo_total_min >= 0),
  check (unidades_procesadas is null or unidades_procesadas >= 0)
);

create index if not exists ot_registros_tiempo_ot_idx
  on public.ot_registros_tiempo (ot_id);
create index if not exists ot_registros_tiempo_proceso_talla_idx
  on public.ot_registros_tiempo (ot_id, proceso_id, talla);

create trigger ot_registros_tiempo_updated_at
  before update on public.ot_registros_tiempo
  for each row execute function public.tg_set_updated_at();

comment on table public.ot_registros_tiempo is
  'Registros de avance de tiempo por operación en una OT. Cada fila es un lote o sesión de trabajo. Reemplaza al modelo "1 override por proceso×talla" de mig 40.';

-- RLS (mismo patrón que ot_tiempos_reales)
alter table public.ot_registros_tiempo enable row level security;

drop policy if exists "ot_registros_tiempo_select" on public.ot_registros_tiempo;
create policy "ot_registros_tiempo_select"
  on public.ot_registros_tiempo for select
  using (true);

drop policy if exists "ot_registros_tiempo_staff_full" on public.ot_registros_tiempo;
create policy "ot_registros_tiempo_staff_full"
  on public.ot_registros_tiempo for all
  using (public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero']::rol_sistema[]))
  with check (public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero']::rol_sistema[]));

-- ===========================================================================
-- Backfill desde ot_tiempos_reales (mig 40).
-- ---------------------------------------------------------------------------
-- La tabla vieja tenía tiempo_real_min POR UNIDAD. Para preservar el
-- significado en la nueva (que es TOTAL), multiplicamos por la cantidad
-- cortada de la línea correspondiente (proceso×talla en la OT). Si no hay
-- línea con esa talla, fallback a 1 unidad para no perder el dato.
-- ===========================================================================

insert into public.ot_registros_tiempo (
  ot_id, proceso_id, talla, tiempo_total_min, unidades_procesadas, notas, created_at
)
select
  tr.ot_id,
  tr.proceso_id,
  tr.talla,
  coalesce(tr.tiempo_real_min, 0)
    * coalesce(nullif(ol.cantidad_cortada, 0), 1)
    as tiempo_total_min,
  ol.cantidad_cortada as unidades_procesadas,
  coalesce(tr.notas || ' · ', '') || 'Migrado desde ot_tiempos_reales (mig 40)' as notas,
  tr.created_at
from public.ot_tiempos_reales tr
  -- producto al que pertenece el proceso
  join public.productos_procesos pp on pp.id = tr.proceso_id
  -- línea de OT que corresponde a ese producto+talla (puede no existir)
  left join public.ot_lineas ol
    on ol.ot_id = tr.ot_id and ol.producto_id = pp.producto_id and ol.talla::text = tr.talla
where tr.tiempo_real_min is not null and tr.tiempo_real_min > 0
on conflict do nothing;
