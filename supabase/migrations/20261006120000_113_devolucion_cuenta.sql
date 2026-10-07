-- La cuenta exacta por la que se devolvió el dinero (06/10/2026).
--
-- Hasta acá se guardaba solo el método ("TRANSFERENCIA"), sin decir si salió
-- del BCP HAPPYS o del INTERBANK JAVIER. El cliente lleva su flujo de caja por
-- cuenta y necesita restar cada devolución de la cuenta de la que salió.
-- Es el mismo texto del botón de la cuenta en el POS (cuentas_bancarias.nombre_corto),
-- igual que ventas_pagos.referencia para los cobros. Null en efectivo.
alter table public.devoluciones
  add column if not exists cuenta_devolucion text;

comment on column public.devoluciones.cuenta_devolucion is
  'Cuenta por la que se devolvió el dinero (nombre_corto del botón del POS). Null si fue en efectivo o saldo a favor.';
