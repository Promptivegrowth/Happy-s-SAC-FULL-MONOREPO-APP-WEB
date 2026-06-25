-- Migración 52: ocultar almacenes especiales de selectores sin desactivarlos.
--
-- El cliente decidió NO usar el "Almacén de Merma" en su día a día (el flujo
-- normal de merma queda dentro de Control de Calidad). Pero el almacén ya
-- tiene movimientos históricos en kardex_movimientos, así que NO podemos
-- desactivarlo sin romper la trazabilidad.
--
-- Solución: bandera `oculto_en_selectores` que esconde el almacén de los
-- dropdowns comunes (traslados, ajustes, recepciones) pero lo mantiene activo
-- para reportes y trazabilidad histórica.

alter table public.almacenes
  add column if not exists oculto_en_selectores boolean not null default false;

comment on column public.almacenes.oculto_en_selectores is
  'Si está en true, el almacén NO aparece en dropdowns operativos (traslados, ajustes, recepciones). Sigue funcionando para reportes y trazabilidad. Útil para almacenes legacy o de uso muy específico.';

-- Por default, ocultar el Almacén de Merma (tipo MERMA)
update public.almacenes
   set oculto_en_selectores = true
 where tipo = 'MERMA';
