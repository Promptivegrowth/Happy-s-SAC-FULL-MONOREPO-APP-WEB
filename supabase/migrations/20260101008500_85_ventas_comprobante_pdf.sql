-- 85_ventas_comprobante_pdf
-- Guarda la RUTA (path en el bucket privado `comprobantes`) del PDF del
-- comprobante emitido desde el POS, para poder consultarlo/descargarlo desde
-- cualquier PC vía el ERP (pedido cliente 2026-08-30: "que los comprobantes
-- emitidos se guarden dentro del sistema ERP").
--
-- Aplica a NOTA_VENTA, BOLETA y FACTURA por igual (keyed por venta), mientras
-- que `comprobantes.pdf_url` sigue reservado para la URL SUNAT/PSE real.

alter table public.ventas
  add column if not exists comprobante_pdf_path text;

comment on column public.ventas.comprobante_pdf_path is
  'Ruta del PDF del comprobante en el bucket privado `comprobantes` (ventas/<id>/<archivo>.pdf). Se accede vía URL firmada desde el ERP.';
