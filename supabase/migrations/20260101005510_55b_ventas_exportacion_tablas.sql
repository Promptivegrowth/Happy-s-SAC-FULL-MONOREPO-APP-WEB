-- ===========================================================================
-- HAPPY SAC — Ventas de Exportación (parte 2: tablas, columnas, checks, vista)
-- ===========================================================================
-- Continuación de la migración 55. El enum value 'EXPORTACION' ya está creado
-- y commiteado, así que ya podemos usarlo en INSERTs y checks.
--
-- Reunión cliente 27/06: exporta a Ecuador, Chile y Venezuela.
-- Requisitos SUNAT (Art. 33 Ley IGV):
--   - Factura de Exportación con codigo_operacion_sunat = '0200'.
--   - IGV 0% (operación no gravada por exportación).
--   - Moneda extranjera (USD/EUR) con tipo de cambio SBS.
--   - Cliente con documento extranjero (pasaporte/TAX ID).
--   - INCOTERM obligatorio (FOB, CIF, EXW, DAP, etc.).
--   - Registro de Ventas SUNAT distingue "exportaciones" en columna separada.
--
-- La serie oficial de Factura de Exportación queda pendiente asignar por
-- SUNAT — se pre-crea con placeholder 'FEXP' e `activa=false`.
-- ===========================================================================

-- 1) Catálogo de países destino
create table if not exists public.paises_exportacion (
  codigo_iso text primary key,
  codigo_sunat text not null,
  nombre text not null,
  moneda_sugerida text default 'USD',
  activo boolean not null default true,
  orden integer not null default 100,
  created_at timestamptz default now()
);

insert into public.paises_exportacion (codigo_iso, codigo_sunat, nombre, moneda_sugerida, orden) values
  ('EC', '218', 'Ecuador',   'USD', 10),
  ('CL', '152', 'Chile',     'USD', 20),
  ('VE', '862', 'Venezuela', 'USD', 30)
on conflict (codigo_iso) do nothing;

-- 2) Campos exportación en ventas
alter table public.ventas
  add column if not exists es_exportacion boolean not null default false,
  add column if not exists pais_destino_iso text references public.paises_exportacion(codigo_iso),
  add column if not exists incoterm text,
  add column if not exists tipo_cambio numeric(8,4),
  add column if not exists puerto_salida text,
  add column if not exists codigo_operacion_sunat text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ventas_incoterm_chk') then
    alter table public.ventas
      add constraint ventas_incoterm_chk
      check (incoterm is null or incoterm in ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ventas_export_igv_chk') then
    alter table public.ventas
      add constraint ventas_export_igv_chk
      check (es_exportacion = false or igv = 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ventas_export_datos_chk') then
    alter table public.ventas
      add constraint ventas_export_datos_chk
      check (
        es_exportacion = false
        or (pais_destino_iso is not null and moneda in ('USD','EUR','PEN'))
      );
  end if;
end$$;

create index if not exists ventas_exportacion_idx on public.ventas (es_exportacion, fecha desc)
  where es_exportacion = true;

-- 3) Campos exportación en comprobantes
alter table public.comprobantes
  add column if not exists es_exportacion boolean not null default false,
  add column if not exists pais_destino_iso text references public.paises_exportacion(codigo_iso),
  add column if not exists incoterm text,
  add column if not exists puerto_salida text,
  add column if not exists codigo_operacion_sunat text,
  add column if not exists numero_dua text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comprobantes_incoterm_chk') then
    alter table public.comprobantes
      add constraint comprobantes_incoterm_chk
      check (incoterm is null or incoterm in ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'));
  end if;
end$$;

-- 4) Serie placeholder de exportación (pendiente asignar por SUNAT)
insert into public.series_comprobantes (tipo, serie, canal, ultimo_correlativo, activa, observacion)
values (
  'FACTURA', 'FEXP', 'EXPORTACION', 0, false,
  'Factura de exportación — PENDIENTE asignar serie oficial por SUNAT. Actualizar código y activar cuando esté disponible.'
) on conflict (tipo, serie) do nothing;

-- 5) Vista consolidada para el reporte SUNAT (casillero exportaciones)
create or replace view public.v_ventas_exportacion as
select
  v.id,
  v.numero,
  v.fecha,
  v.almacen_id,
  v.cliente_id,
  v.pais_destino_iso,
  pe.nombre       as pais_destino,
  pe.codigo_sunat as pais_codigo_sunat,
  v.incoterm,
  v.moneda,
  v.tipo_cambio,
  v.puerto_salida,
  v.codigo_operacion_sunat,
  v.sub_total,
  v.igv,
  v.total,
  round(v.total * coalesce(v.tipo_cambio, 1), 2) as total_pen,
  v.estado,
  v.vendedor_usuario_id
from public.ventas v
left join public.paises_exportacion pe on pe.codigo_iso = v.pais_destino_iso
where v.es_exportacion = true;

comment on view public.v_ventas_exportacion is
  'Vista para reporte SUNAT — Registro de Ventas casillero exportaciones.';

-- 6) RLS del catálogo de países
alter table public.paises_exportacion enable row level security;

drop policy if exists paises_exportacion_read on public.paises_exportacion;
create policy paises_exportacion_read on public.paises_exportacion
  for select using (true);

drop policy if exists paises_exportacion_admin on public.paises_exportacion;
create policy paises_exportacion_admin on public.paises_exportacion
  for all
  using (
    exists (select 1 from public.usuarios_roles ur
            where ur.usuario_id = auth.uid() and ur.rol = 'gerente')
  )
  with check (
    exists (select 1 from public.usuarios_roles ur
            where ur.usuario_id = auth.uid() and ur.rol = 'gerente')
  );

comment on table public.paises_exportacion is
  'Catálogo de países destino. Editable por gerente. Ecuador/Chile/Venezuela precargados.';
comment on column public.ventas.es_exportacion is
  'Marca esta venta como exportación (Art. 33 Ley IGV). Fuerza IGV=0.';
comment on column public.ventas.codigo_operacion_sunat is
  'Catálogo SUNAT 51: 0200=Exportación Bienes, 0201=Exp. Servicios. Default 0200.';
comment on column public.ventas.tipo_cambio is
  'Tipo de cambio SBS del día (moneda origen → PEN). Requerido para exportación.';
