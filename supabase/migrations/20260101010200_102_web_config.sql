-- ===========================================================================
-- 102 — La portada de la web se edita desde el ERP
-- ===========================================================================
--
-- El slider de inicio, el banner de venta al por mayor, los teléfonos y las
-- redes estaban escritos dentro del código de la web. Cambiar la campaña de
-- mayo por la de Halloween era editar un archivo y volver a publicar el sitio:
-- algo que el cliente no puede hacer solo, y que por lo tanto no se hacía.
--
-- Acá queda el contenido, en pares clave/valor como el resto de la
-- configuración. Se guarda en una tabla propia y NO en `configuracion` por una
-- razón concreta: esto lo tiene que poder leer cualquier visitante anónimo de
-- la tienda, y `configuracion` guarda cosas que no son públicas —claves de
-- SUNAT, parámetros internos—. Mezclarlas obligaría a abrir esa tabla entera.
--
-- Las claves y su forma:
--
--   hero_slides     [{imagen_url, alt, href, pretitulo, titulo, titulo_acento,
--                     subtitulo, cta, layout, badge, titulo_color,
--                     acento_color, lottie_url}]
--   cta_mayorista   {titulo, subtitulo, boton, telefono, imagen_url}
--   contacto        {whatsapp, whatsapp_saludo, email, direccion}
--   redes           {facebook, instagram, tiktok, youtube}

create table if not exists public.web_config (
  clave           text primary key,
  valor           jsonb not null,
  descripcion     text,
  actualizado_por uuid references auth.users(id),
  updated_at      timestamptz default now()
);

comment on table public.web_config is
  'Contenido editable de la tienda web (slider, banners, telefonos, redes). '
  'Lectura publica: lo consume el sitio con la clave anonima.';

alter table public.web_config enable row level security;

do $$
begin
  -- Cualquiera puede LEER: es el contenido de una web pública.
  if not exists (select 1 from pg_policies where schemaname='public'
                   and tablename='web_config' and policyname='web_config_lectura_publica') then
    create policy web_config_lectura_publica on public.web_config
      for select using (true);
  end if;

  -- Escribir, solo quien entró al ERP.
  if not exists (select 1 from pg_policies where schemaname='public'
                   and tablename='web_config' and policyname='web_config_escritura_staff') then
    create policy web_config_escritura_staff on public.web_config
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- El contenido que hoy está en el código, para que la web no cambie de aspecto
-- el día que empiece a leer de acá.
-- ---------------------------------------------------------------------------
insert into public.web_config (clave, valor, descripcion) values
(
  'hero_slides',
  '[
    {
      "imagen_url": "/slider1.webp",
      "alt": "Día de la Madre — disfraces típicos para mamá",
      "href": "/campanias/dia-de-la-madre-2026",
      "layout": "derecha-lottie",
      "pretitulo": "✨ Mayo 2026",
      "titulo": "¡Feliz día,",
      "titulo_acento": "Mami!",
      "subtitulo": "Disfraces típicos y trajes especiales para que su show del Día de la Madre sea inolvidable.",
      "cta": "Ver colección",
      "badge": "heart",
      "titulo_color": "#231459",
      "acento_color": "#EC1C24",
      "lottie_url": "https://lottie.host/0be6f22b-54c5-4c84-bce8-5c7367018885/jmgIfyFbJo.lottie"
    },
    {
      "imagen_url": "/slider2.webp",
      "alt": "Disfraces para el día de la madre — colección 2026",
      "href": "/campanias/dia-de-la-madre-2026",
      "layout": "centro",
      "pretitulo": "🌸 Edición limitada",
      "titulo": "Mamá merece",
      "titulo_acento": "lo mejor",
      "subtitulo": "Vestidos coloridos y trajes únicos para que mamá brille en cada presentación.",
      "cta": "Comprar ahora",
      "badge": "gift",
      "titulo_color": "#231459",
      "acento_color": "#E15A25",
      "lottie_url": ""
    },
    {
      "imagen_url": "/slider3.webp",
      "alt": "Show del día de la madre — disfraces y accesorios",
      "href": "/campanias/dia-de-la-madre-2026",
      "layout": "centro-amplio",
      "pretitulo": "💝 ¡Solo por mayo!",
      "titulo": "Sorprende a",
      "titulo_acento": "la reina del hogar",
      "subtitulo": "Más de 200 modelos · 11 tallas · Yape · Plin · Tarjeta · Envío Lima 2-3 días",
      "cta": "Descubrir más",
      "badge": "sparkle",
      "titulo_color": "#231459",
      "acento_color": "#EC1C24",
      "lottie_url": ""
    }
  ]'::jsonb,
  'Slides del carrusel de la portada'
),
(
  'cta_mayorista',
  '{
    "titulo": "¿Compra al por mayor o personalizada?",
    "subtitulo": "Hablemos por WhatsApp — atención directa con nuestro equipo",
    "boton": "Escribir al +51 903 064 120",
    "telefono": "51903064120",
    "imagen_url": "/CTA.webp"
  }'::jsonb,
  'Banner de venta al por mayor de la portada'
),
(
  'contacto',
  '{
    "whatsapp": "51903064120",
    "whatsapp_saludo": "Hola! Estoy en disfraceshappys.com y quisiera consultar...",
    "email": "ventas@disfraceshappys.com.pe",
    "direccion": "Tiendas físicas: Huallaga · La Quinta (Lima)"
  }'::jsonb,
  'Teléfono, correo y dirección que se muestran en el sitio'
),
(
  'redes',
  '{
    "facebook": "https://facebook.com/disfraceshappys",
    "instagram": "https://instagram.com/disfraceshappys",
    "tiktok": "",
    "youtube": ""
  }'::jsonb,
  'Redes sociales del pie de página'
)
on conflict (clave) do nothing;
