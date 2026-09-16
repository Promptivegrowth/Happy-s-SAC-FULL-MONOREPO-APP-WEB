-- ===========================================================================
-- 95 — Pagos con tarjeta por izipay: un pago por transacción
-- ===========================================================================
--
-- Izipay avisa el resultado de un cobro por dos caminos a la vez: la
-- notificación al servidor (IPN) y el retorno del navegador. Los dos llegan
-- firmados y los dos son válidos, así que los dos registran el pago — y pueden
-- llegar en el mismo instante. Además izipay REPITE la notificación si no
-- recibe un 200.
--
-- Sin esta restricción, el mismo cobro entraría dos o tres veces en
-- pedidos_web_pagos y la caja del día cerraría inflada. Con el índice único, el
-- segundo aviso actualiza la fila que ya existe en vez de crear otra.
--
-- Postgres trata los NULL como distintos entre sí, así que los pagos que no son
-- de izipay (Yape, transferencia, efectivo) siguen entrando sin problema.

create unique index if not exists pedidos_web_pagos_izipay_tx_key
  on public.pedidos_web_pagos (izipay_transaction_id);

comment on index public.pedidos_web_pagos_izipay_tx_key is
  'Una sola fila por transacción de izipay: el IPN y el retorno del navegador '
  'notifican el mismo cobro y ambos escriben acá.';
