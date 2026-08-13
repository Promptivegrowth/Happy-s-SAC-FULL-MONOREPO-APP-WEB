-- Servicio destino por material en la receta (pedido del cliente 22/07/2026):
-- para servicios como OJAL_BOTON no se envían los mismos avíos que confección,
-- solo los botones. Cada línea de receta puede indicar a qué servicio va su
-- material; NULL = general (viaja con la confección).
alter table public.recetas_lineas
  add column if not exists proceso_servicio text;
comment on column public.recetas_lineas.proceso_servicio is
  'Servicio destino del material al tercerizar (ej. OJAL_BOTON). NULL = general/confección.';
