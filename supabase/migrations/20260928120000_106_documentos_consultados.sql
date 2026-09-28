-- Lo que ya se le preguntó a RENIEC/SUNAT, para no volver a preguntarlo.
--
-- El 28/09/2026 las consultas de DNI y RUC dejaron de funcionar en todas las
-- cajas: Decolecta respondía "Apikey Required / Limit Exceeded". Se había
-- agotado el plan gratuito de 1.000 consultas por mes, en el primer mes de las
-- tiendas vendiendo de verdad, y con el mismo token para el POS, el ERP y la web.
--
-- Parte del gasto era evitable: cada vez que se escribía un DNI se consultaba de
-- nuevo, aunque fuera un cliente que ya había comprado, o la misma persona con
-- el número corregido. Un nombre de RENIEC no cambia; la razón social y la
-- dirección de un RUC cambian poco. Guardarlos convierte la segunda consulta en
-- una lectura propia, gratis e instantánea.
--
-- Solo la escribe y la lee el servidor (con la clave de servicio): RLS activo y
-- sin políticas, así que ningún usuario la ve directo.

create table if not exists public.documentos_consultados (
  tipo          text        not null check (tipo in ('dni', 'ruc')),
  numero        text        not null,
  datos         jsonb       not null,
  consultado_en timestamptz not null default now(),
  primary key (tipo, numero)
);

alter table public.documentos_consultados enable row level security;
