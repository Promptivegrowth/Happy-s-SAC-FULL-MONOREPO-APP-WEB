-- ===========================================================================
-- Traslados: datos de vehículo/conductor + cantidad de bultos
-- ===========================================================================
-- Cliente pidió (reunión post 2026-07-08):
--   · Datos digitales de chofer, placa, marca, DNI, licencia, tarjeta MTC
--     (hoy salen en el PDF como líneas para llenar a mano — deberían pre-imprimirse)
--   · Cantidad de bultos y tipo (ej: "5 costales", "12 cajas")
--   · Modalidad (público/privado) que hoy va hardcodeada
--
-- La guía de remisión SUNAT R.S. 097-2012 exige estos datos si es modalidad
-- PÚBLICA (transportista externo). En PRIVADA (vehículo del remitente) son
-- opcionales pero recomendados para el registro operativo.
-- ===========================================================================

alter table public.traslados
  add column if not exists modalidad text not null default 'PRIVADO',
  add column if not exists chofer_nombre text,
  add column if not exists chofer_dni text,
  add column if not exists chofer_licencia text,
  add column if not exists vehiculo_placa text,
  add column if not exists vehiculo_marca text,
  add column if not exists vehiculo_tarjeta_circulacion text,
  add column if not exists transportista_ruc text,
  add column if not exists transportista_razon_social text,
  add column if not exists cantidad_bultos integer,
  add column if not exists tipo_bulto text,           -- ej: "COSTALES", "CAJAS", "PAQUETES"
  add column if not exists peso_total_kg numeric(10,2);

-- Modalidad limitada al catálogo SUNAT
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'traslados_modalidad_chk') then
    alter table public.traslados
      add constraint traslados_modalidad_chk
      check (modalidad in ('PRIVADO', 'PUBLICO'));
  end if;
end$$;

comment on column public.traslados.modalidad is
  'PRIVADO=vehículo del remitente, PUBLICO=transportista externo (require RUC transportista).';
comment on column public.traslados.cantidad_bultos is
  'Cantidad de bultos físicos que se envían (ej: 5). Se muestra en la guía.';
comment on column public.traslados.tipo_bulto is
  'Descripción del bulto: COSTALES, CAJAS, PAQUETES, etc.';
