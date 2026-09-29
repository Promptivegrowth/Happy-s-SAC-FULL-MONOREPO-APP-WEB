-- 107 · Guía de Remisión Remitente electrónica (API REST de SUNAT)
--
-- Las tablas guias_remision / guias_remision_items existían desde el inicio
-- pero vacías: nunca se emitió una guía electrónica. Se completan con lo que
-- pide la GRE 2.0 y con el seguimiento del envío a SUNAT, que es asíncrono
-- (se envía, SUNAT da un ticket y la respuesta se recoge después).
--
-- Solo agrega columnas. No toca ventas, comprobantes ni el POS.

-- ── Credenciales de la API ──────────────────────────────────────────────────
-- Se generan en SOL (Credenciales de API SUNAT) y son distintas del usuario y
-- clave SOL que ya usa la facturación. El token dura una hora: se guarda para
-- no pedir uno nuevo en cada guía.
alter table public.sunat_config
  add column if not exists gre_client_id text,
  add column if not exists gre_client_secret text,
  add column if not exists gre_token text,
  add column if not exists gre_token_expira timestamptz;

-- ── Código de establecimiento de cada almacén ───────────────────────────────
-- El que figura en la ficha RUC (0000 = domicilio fiscal). Solo lo exige SUNAT
-- en los traslados entre locales propios, y la dirección + ubigeo se aprenden
-- de la primera guía que sale de ese almacén.
alter table public.almacenes
  add column if not exists codigo_establecimiento_sunat text;

-- ── Guía ────────────────────────────────────────────────────────────────────
alter table public.guias_remision
  add column if not exists comprobante_id uuid references public.comprobantes(id) on delete set null,
  add column if not exists cliente_id uuid references public.clientes(id) on delete set null,
  add column if not exists almacen_partida_id uuid references public.almacenes(id) on delete set null,
  add column if not exists destinatario_tipo_doc text,       -- catálogo 06: 1 DNI, 6 RUC, 4 CE, 7 pasaporte
  add column if not exists destinatario_num_doc text,
  add column if not exists destinatario_nombre text,
  add column if not exists motivo_descripcion text,          -- obligatoria con motivo 13
  add column if not exists fecha_entrega_transportista date, -- obligatoria con agencia desde el 01/06/2026
  add column if not exists peso_bruto_kg numeric(12,3),
  add column if not exists num_bultos integer,
  add column if not exists transportista_mtc text,
  add column if not exists conductor_apellidos text,
  add column if not exists conductor_licencia text,
  add column if not exists vehiculo_m1l boolean not null default false,
  add column if not exists cod_establecimiento_partida text,
  add column if not exists cod_establecimiento_llegada text,
  add column if not exists observacion text,
  add column if not exists hash_firma text,
  add column if not exists cdr_url text,
  add column if not exists qr_url text,
  add column if not exists sunat_ticket text,
  add column if not exists sunat_codigo text,
  add column if not exists sunat_mensaje text,
  add column if not exists sunat_enviado_en timestamptz,
  add column if not exists sunat_aceptado_en timestamptz,
  add column if not exists sunat_intentos integer not null default 0,
  add column if not exists sunat_proximo_intento timestamptz,
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

alter table public.guias_remision_items
  add column if not exists codigo text,
  add column if not exists unidad text not null default 'NIU';

-- Lo que el envío automático revisa en cada corrida.
create index if not exists guias_remision_por_enviar_idx
  on public.guias_remision (sunat_proximo_intento)
  where estado in ('BORRADOR', 'EMITIDO');
create index if not exists guias_remision_comprobante_idx on public.guias_remision (comprobante_id);
create index if not exists guias_remision_venta_idx on public.guias_remision (venta_id);
