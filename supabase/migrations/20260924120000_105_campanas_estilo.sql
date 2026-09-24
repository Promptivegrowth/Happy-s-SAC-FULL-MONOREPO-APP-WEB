-- El diseño de cada campaña: colores, textos y la pestaña del menú.
--
-- Hasta el 24/09/2026 la sección de temporada de la web tenía todo fijo en el
-- código salvo el título y el texto: el mismo fondo naranja-rojo-azul para
-- Halloween, Navidad o Fiestas Patrias, la etiqueta "Campaña activa", y en el
-- menú un "HOT" rojo al lado del nombre. Javier la cambia casi todos los meses y
-- pidió poder cambiar todo eso él mismo.
--
-- Va en UNA columna jsonb y no en diez columnas sueltas a propósito: son
-- preferencias de diseño, todas opcionales, y la próxima que se pida entra sin
-- migración. Lo que falte se completa con el diseño de siempre, así que una
-- campaña vieja sin nada cargado se ve exactamente igual que antes.
--
-- Claves (todas opcionales):
--   color_inicio, color_fin     "#RRGGBB"  degradado del fondo
--   color_texto                 "auto" | "claro" | "oscuro"
--   etiqueta                    texto de la pastilla de arriba ("Campaña activa")
--   mostrar_fechas              boolean
--   imagen_modo                 "fondo" (foto visible) | "suave" (foto tenue)
--   menu_texto                  lo que dice la pestaña del menú (si no, el nombre)
--   menu_color                  "#RRGGBB"  color del texto de la pestaña
--   menu_etiqueta               la pastilla al lado ("HOT"); "" = sin pastilla
--   menu_etiqueta_color         "#RRGGBB"  fondo de esa pastilla

alter table public.campanas
  add column if not exists estilo jsonb not null default '{}'::jsonb;
