-- ─────────────────────────────────────────────────────────────────────────────
-- 93: AGENTE DE IMPRESIÓN — cola de tickets para la ticketera
--
-- El POS corre en el navegador, y desde ahí solo se puede imprimir por el
-- driver de Windows: convierte el ticket en una imagen, decide el corte según
-- el tamaño de papel configurado y agrega su propio margen final. De ahí salen
-- los tres problemas que reporta la tienda —papel desperdiciado, corte en el
-- lugar equivocado y formato que cambia de una computadora a otra—, y ninguno
-- se puede arreglar desde el navegador: no existe forma de decirle "corta acá".
--
-- La solución es un programa chico que corre en la computadora de la caja y le
-- pasa a la ticketera los comandos ESC/POS en crudo, que es su idioma nativo.
-- El corte lo ordena el propio ticket (GS V), no el driver.
--
-- El agente PREGUNTA, no escucha. La forma obvia sería que el navegador le
-- hable a un servidor local, pero Chrome y Edge están cerrando esa puerta
-- (Local Network Access) y la restricción se endurece con cada versión. Acá se
-- da vuelta la relación: el ERP/POS deja el ticket en esta cola y el agente
-- —que es un programa local y no tiene esas restricciones— pregunta si hay algo
-- para imprimir. El navegador nunca habla con la impresora.
--
-- Efecto secundario bueno: se puede cobrar desde el celular o desde el ERP y
-- que el ticket salga en la ticketera de la tienda.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Computadoras con ticketera ───────────────────────────────────────────────
create table if not exists public.equipos_impresion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,

  -- Con este token el agente se identifica. No se usa la llave de Supabase
  -- para que una computadora comprometida no abra nada más que su propia cola.
  token uuid not null default gen_random_uuid(),

  -- Tienda a la que pertenece la caja. Sirve para que el POS ofrezca primero
  -- la ticketera de la tienda donde está el cajero.
  almacen_id uuid references public.almacenes(id) on delete set null,

  -- Ticketera forzada desde el ERP. Tiene prioridad sobre lo que el agente
  -- adivine solo: hay marcas cuyo nombre no dice ni "POS" ni "80mm".
  impresora text,

  -- Milímetros que adelanta el papel antes de cortar. La cuchilla está unos
  -- milímetros por encima del cabezal y esa distancia cambia con el modelo: si
  -- el corte se come la última línea hay que subirlo; si sobra papel en blanco,
  -- bajarlo. Se guarda por computadora en vez de subirlo para todas, que sería
  -- regalar medio centímetro en cada ticket de las demás.
  avance_corte_mm numeric(4,1) not null default 15,

  -- Lo que informa el propio agente en cada consulta.
  impresora_detectada text,
  impresoras_disponibles text,
  ultima_conexion timestamptz,
  version_agente text,

  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_equipos_impresion_token
  on public.equipos_impresion (token);
create index if not exists idx_equipos_impresion_activo
  on public.equipos_impresion (activo) where activo;
create index if not exists idx_equipos_impresion_almacen
  on public.equipos_impresion (almacen_id);

-- Entre 5 y 40 mm: por debajo la cuchilla corta contenido en cualquier modelo,
-- y por encima se estaría desperdiciando papel a propósito.
alter table public.equipos_impresion
  drop constraint if exists equipos_impresion_avance_corte_razonable;
alter table public.equipos_impresion
  add constraint equipos_impresion_avance_corte_razonable
  check (avance_corte_mm >= 5 and avance_corte_mm <= 40);

drop trigger if exists equipos_impresion_updated_at on public.equipos_impresion;
create trigger equipos_impresion_updated_at before update on public.equipos_impresion
  for each row execute function public.tg_set_updated_at();

-- ── Tickets esperando salir ──────────────────────────────────────────────────
create table if not exists public.cola_impresion (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos_impresion(id) on delete cascade,

  -- Los bytes ESC/POS del ticket, en base64. El formato lo arma el sistema, no
  -- el agente: así se cambia el diseño del ticket actualizando el ERP, sin
  -- reinstalar nada en las computadoras de la tienda.
  contenido text not null,

  descripcion text,
  comprobante_id uuid references public.comprobantes(id) on delete set null,

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'impreso', 'error', 'cancelado')),
  intentos integer not null default 0,
  error text,

  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  impreso_at timestamptz
);

create index if not exists idx_cola_impresion_pendientes
  on public.cola_impresion (equipo_id, created_at)
  where estado = 'pendiente';
create index if not exists idx_cola_impresion_creado
  on public.cola_impresion (created_at desc);

-- ── Permisos ─────────────────────────────────────────────────────────────────
--
-- El agente NO entra por acá: usa las rutas del POS con su token, que corren
-- con la llave de servicio. Estas políticas son para las pantallas del sistema.
alter table public.equipos_impresion enable row level security;
alter table public.cola_impresion enable row level security;

drop policy if exists equipos_impresion_lectura on public.equipos_impresion;
create policy equipos_impresion_lectura on public.equipos_impresion
  for select to authenticated using (true);

drop policy if exists equipos_impresion_admin on public.equipos_impresion;
create policy equipos_impresion_admin on public.equipos_impresion
  for all to authenticated
  using (exists (select 1 from public.usuarios_roles ur
                 where ur.usuario_id = auth.uid() and ur.rol = 'gerente'))
  with check (exists (select 1 from public.usuarios_roles ur
                 where ur.usuario_id = auth.uid() and ur.rol = 'gerente'));

-- Cualquiera que cobra puede encolar un ticket y ver cómo salió el suyo.
drop policy if exists cola_impresion_lectura on public.cola_impresion;
create policy cola_impresion_lectura on public.cola_impresion
  for select to authenticated using (true);

drop policy if exists cola_impresion_insertar on public.cola_impresion;
create policy cola_impresion_insertar on public.cola_impresion
  for insert to authenticated with check (true);

-- ── Limpieza ─────────────────────────────────────────────────────────────────
--
-- Un ticket ya impreso no sirve para nada: se borran los de más de tres días
-- para que la tabla no crezca sin control.
create or replace function public.limpiar_cola_impresion()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrados integer;
begin
  delete from public.cola_impresion
   where estado <> 'pendiente'
     and created_at < now() - interval '3 days';
  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

grant execute on function public.limpiar_cola_impresion to authenticated;

comment on table public.equipos_impresion is
  'Computadoras con ticketera. El token identifica al agente sin darle acceso al resto del sistema.';
comment on table public.cola_impresion is
  'Tickets esperando salir por la ticketera. El sistema los deja acá y el agente los levanta; el navegador nunca habla con la impresora.';
comment on column public.equipos_impresion.avance_corte_mm is
  'Milímetros de papel que se adelantan antes de cortar. Depende de cuán lejos esté la cuchilla del cabezal en ese modelo. Si el corte se come la última línea, subirlo; si sobra papel en blanco, bajarlo.';
