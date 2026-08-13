-- Flag "va al servicio de ojal botón" por material de la receta (pedido del
-- cliente 22/07/2026): dos destinos independientes —
--   sale_a_servicio     = va al taller de CONFECCIÓN
--   sale_a_ojal_boton   = va al servicio de OJAL BOTÓN (solo los botones)
-- Así la orden de servicio de ojal botón jala únicamente los botones.
alter table public.recetas_lineas
  add column if not exists sale_a_ojal_boton boolean not null default false;
