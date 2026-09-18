-- ===========================================================================
-- Recupera las ventas del 18/09/2026 que nunca se registraron
-- ===========================================================================
--
-- QUÉ PASÓ
--
-- La ticketera quedó mal conectada. Los tickets no salían y no había forma de
-- reimprimir un comprobante ya emitido, así que en la tienda dejaron de usar el
-- sistema y vendieron en papel desde que abrieron la caja (09:34) hasta que la
-- impresión volvió a funcionar (12:14).
--
-- QUÉ SE COMPROBÓ ANTES DE ESCRIBIR ESTO
--
-- Ninguna venta se perdió por un error del sistema. Las cuatro pruebas:
--
--   1. Los correlativos no avanzaron. VENTA quedó en 105 y COMP_B005 en 4048,
--      los dos actualizados 18/09 12:14 — la última venta registrada. Si una
--      venta se hubiera caído después de tomar su número, el contador estaría
--      adelantado y habría un hueco en la numeración. No hay hueco: VEN-000064
--      a VEN-000105 son consecutivos, y B005-0004040 a B005-0004048 también.
--
--   2. La cola de impresión está vacía en esa franja. Entre las 20:45 del 17/09
--      y las 12:14 del 18/09 no hay ni una fila en cola_impresion. Si alguien
--      hubiera presionado Pagar, habría quedado el ticket encolado aunque la
--      impresora fallara: el ticket se encola después de grabar la venta.
--
--   3. No hay restos a medio escribir: cero líneas sin venta, cero pagos sin
--      venta, cero comprobantes sin venta, cero salidas de stock sin venta.
--
--   4. La sesión de caja sí se abrió (09:34, Javier Mauricio, S/200) y tiene una
--      sola venta. La caja estuvo abierta y operativa todo el tiempo.
--
-- O sea: esas ventas no están incompletas ni corruptas. No existen. Nunca
-- llegaron al servidor, así que no hay nada que reparar con SQL — hay que
-- volver a entrarlas.
--
-- CÓMO SE RECUPERAN
--
-- Por el POS, como ventas normales, con los papeles de la tienda a la vista.
-- Tiene que ser por el POS y no por SQL, porque cada venta arrastra cosas que
-- acá habría que imitar a mano y es donde se cometen los errores: el correlativo
-- del comprobante, el movimiento de kardex que baja el stock, el pago con su
-- cuenta, y —en las boletas— el envío a SUNAT en el resumen diario.
--
-- El stock importa: la mercadería salió de la tienda pero el sistema todavía la
-- cuenta. Hasta que estas ventas se entren, el stock está de más.
--
-- LA HORA
--
-- El POS las va a grabar con la hora en que se entren, no con la hora real de
-- venta. Eso ensucia los reportes por hora y el cuadre del turno. Este script
-- corrige la fecha DESPUÉS de entrarlas, una por una.
--
-- CÓMO USARLO
--
--   1. Entrar las ventas por el POS (mismo tipo de comprobante que se le dio al
--      cliente: boleta si pidió boleta, nota de venta si no).
--   2. Anotar el número que le dio el sistema a cada una (VEN-000106, ...).
--   3. Llenar la lista de abajo con ese número y la hora real de la venta.
--   4. Correr el bloque. Es idempotente: volver a correrlo no cambia nada.
--
-- No toca importes, ni stock, ni comprobantes: solo la hora en que quedó
-- registrada, para que el reporte del día diga la verdad.

begin;

with recuperadas(numero, hora_real) as (
  values
    -- ('VEN-000106', '2026-09-18 09:52'),
    -- ('VEN-000107', '2026-09-18 10:15'),
    -- ('VEN-000108', '2026-09-18 11:03'),
    ('SIN-DATOS', null)   -- borrar esta fila al llenar las de arriba
)
update ventas v
   set fecha = (r.hora_real::timestamp at time zone 'America/Lima'),
       observacion = coalesce(v.observacion || ' · ', '')
                  || 'Venta del 18/09 recuperada: se vendió en papel porque la ticketera estaba desconectada'
  from recuperadas r
 where v.numero = r.numero
   and r.hora_real is not null
   and coalesce(v.observacion, '') not like '%recuperada%';

-- Control: que la franja perdida quede cubierta y los totales cierren.
select to_char(v.fecha at time zone 'America/Lima', 'DD/MM HH24:MI') as hora,
       v.numero,
       v.total,
       coalesce(c.numero_completo, 'sin documento') as documento
  from ventas v
  left join comprobantes c on c.venta_id = v.id
 where v.fecha >= '2026-09-18 09:00'::timestamp at time zone 'America/Lima'
   and v.fecha <  '2026-09-18 13:00'::timestamp at time zone 'America/Lima'
 order by v.fecha;

-- Revisar la salida antes de confirmar.
-- commit;
rollback;
