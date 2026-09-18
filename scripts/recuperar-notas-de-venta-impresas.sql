-- ===========================================================================
-- Recupera las notas de venta ya impresas
-- ===========================================================================
--
-- Hasta hoy la nota tomaba un número del correlativo, lo imprimía y lo tiraba.
-- Quedaron 74 tickets en la calle con un código que el sistema no conoce.
--
-- El número se puede reconstruir porque el correlativo avanza de a uno y en
-- orden de emisión: las notas emitidas desde que arrancó la operación son los
-- últimos N valores del contador. Se comprobó contra un ticket físico —el que
-- mandó el cliente, 005-0011476— y cae exactamente en la venta de las 20:22 del
-- 15/09, que es la fecha y hora impresas en ese papel.
--
-- Se excluye la venta nacida de un cambio ("Venta por cambio"): esa la crea el
-- flujo de devoluciones sin pasar por la emisión, así que nunca consumió un
-- número. Incluirla corría toda la numeración en uno — fue justo lo que delató
-- el desfase al comparar con el ticket.
--
-- Estas filas quedan marcadas en nota_interna: son una reconstrucción, no un
-- dato que el sistema haya guardado en su momento.

begin;

with notas as (
  select v.id, v.fecha, v.sub_total, v.igv, v.total, v.cliente_id,
         v.tipo_documento_cliente, v.documento_cliente, v.nombre_cliente_rapido,
         ca.serie_nota_venta as serie,
         row_number() over (order by v.fecha) as orden,
         count(*) over () as cuantas
    from ventas v
    join cajas ca on ca.id = v.caja_id
    left join comprobantes c on c.venta_id = v.id
   where c.id is null
     and v.estado <> 'ANULADA'
     and ca.codigo = 'CAJA-HU-01'
     and coalesce(v.observacion, '') not like 'Venta por cambio%'
), numeradas as (
  select n.*,
         (select ultimo from correlativos where clave = 'COMP_005') - n.cuantas + n.orden as numero
    from notas n
)
insert into comprobantes (
  tipo, serie, numero, venta_id, cliente_id,
  tipo_documento_cliente, numero_documento_cliente, razon_social_cliente,
  fecha_emision, sub_total, igv, total, moneda, estado, forma_pago, nota_interna
)
select 'NOTA_VENTA', n.serie, n.numero, n.id, n.cliente_id,
       n.tipo_documento_cliente, n.documento_cliente, n.nombre_cliente_rapido,
       n.fecha, n.sub_total, n.igv, n.total, 'PEN', 'EMITIDO', 'CONTADO',
       'Numero reconstruido el 17/09/2026: la nota se imprimia sin guardarse. '
       'Verificado contra el ticket fisico 005-0011476.'
  from numeradas n;

-- Cada venta apunta a su nota, igual que las boletas.
update ventas v
   set comprobante_id = c.id
  from comprobantes c
 where c.venta_id = v.id
   and c.tipo = 'NOTA_VENTA'
   and v.comprobante_id is null;

commit;
