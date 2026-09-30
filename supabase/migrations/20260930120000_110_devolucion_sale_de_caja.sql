-- 110 · La plata devuelta a un cliente sale de la caja del turno
--
-- Una devolución con reembolso (o el vuelto de un cambio) sacaba plata del
-- cajón, pero el cierre de caja no se enteraba: el cajero cuadraba con un
-- faltante que no era suyo (septiembre: S/ 50 y S/ 25).
--
-- Desde ahora la devolución registra sola una salida (EGRESO) en la caja chica
-- del turno abierto. El cuadre ya descuenta las salidas de caja chica en todos
-- lados —caja, cierre parcial, Excel del cierre y cuadres del ERP—, así que no
-- hay que tocar ninguna de esas cuentas.

alter table public.caja_chica_movimientos
  add column if not exists devolucion_id uuid references public.devoluciones(id) on delete set null;

-- Categoría propia para que en la lista se lea qué fue. Queda inactiva a
-- propósito: así no aparece entre los gastos que el cajero puede elegir a mano
-- (registrarla también a mano la descontaría dos veces).
insert into public.caja_chica_categorias (codigo, nombre, icono, orden, activo)
select 'DEVOLUCION_CLIENTE', 'Devolución a cliente', 'Undo2', 999, false
where not exists (select 1 from public.caja_chica_categorias where codigo = 'DEVOLUCION_CLIENTE');
