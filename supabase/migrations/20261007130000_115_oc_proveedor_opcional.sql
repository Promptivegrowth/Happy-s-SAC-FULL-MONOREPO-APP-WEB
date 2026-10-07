-- La orden de compra ya no exige proveedor (pedido del cliente, 07/10/2026).
--
-- Se compra también a vendedores sin ficha (mercado, compras al paso). La OC,
-- su pago y la cuenta por pagar funcionan sin proveedor; las de cuentas por
-- pagar muestran "Sin proveedor" en vez de desaparecer de la lista.
alter table public.oc alter column proveedor_id drop not null;
alter table public.pagos_proveedores alter column proveedor_id drop not null;

create or replace view public.v_cuentas_pagar as
 select oc.id as oc_id,
    oc.numero,
    oc.proveedor_id,
    coalesce(p.razon_social, 'Sin proveedor') as proveedor,
    oc.fecha,
    oc.fecha_entrega_esperada,
    oc.total,
    coalesce((select sum(pp.monto) from public.pagos_proveedores pp where pp.oc_id = oc.id), 0::numeric) as pagado,
    oc.total - coalesce((select sum(pp.monto) from public.pagos_proveedores pp where pp.oc_id = oc.id), 0::numeric) as saldo_pendiente,
    oc.estado
   from public.oc oc
     left join public.proveedores p on p.id = oc.proveedor_id
  where oc.estado <> 'CANCELADA'::estado_oc;
