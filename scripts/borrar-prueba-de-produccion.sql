-- ===========================================================================
-- Borra la prueba de producción del 18/09/2026 y deja el stock como estaba
-- ===========================================================================
--
-- QUÉ FUE LA PRUEBA
--
-- Plan PM-2026-S39-001 → OT-26-00001 → corte → OS al taller Gloria Vásquez →
-- cierre con ingreso de 290 disfraces de mariposa al Almacén Santa Bárbara.
-- Toda la producción que hay cargada en el sistema es esta prueba: un plan, una
-- OT, un corte, una OS. No hay nada real que se pueda perder por error.
--
-- LO QUE JAVIER YA HIZO, Y LO QUE FALTA
--
-- Los 290 disfraces terminados ya los sacó con un ajuste de conteo el mismo día
-- a las 14:21. Esa parte está resuelta y el script no la vuelve a tocar.
--
-- Lo que NO se ajustó son los materiales. El corte y los avíos enviados al
-- taller salieron del Almacén de Materia Prima y nadie los devolvió, así que
-- siete materiales quedaron en NEGATIVO por exactamente lo que consumió la
-- prueba:
--
--   COLA DE RATA EN DISCO CHICLE        -2221.82
--   ELASTICO POLIESTER DE 5CM BLANCO     -227.80
--   TUL LLANO CHICLE                     -237.00
--   TUL EMELY CHICLE                     -106.00
--   RAZO COREANO CHICLE                   -22.40
--   LENTEJUELA PEGADA CHICLE              -37.00
--   POLIESTRECH CHICLE                    -46.00
--
-- Los siete estaban en CERO antes de la prueba, así que revertirla los deja
-- exactamente en cero. No hay que adivinar ningún valor.
--
-- POR QUÉ EL STOCK SE TOCA A MANO
--
-- El disparador que mantiene el stock corre al INSERTAR un movimiento, no al
-- borrarlo: borrar el kardex no devuelve nada. Por eso el stock se corrige
-- explícitamente acá. Es el mismo cuidado que hubo que tener con los asientos
-- de apertura.
--
-- CÓMO USARLO
--
--   1. Correr tal cual: termina en rollback y sólo muestra qué se iría y cómo
--      quedaría el stock.
--   2. Revisar la salida con Javier.
--   3. Cambiar `rollback` por `commit` y volver a correrlo.
--
-- IMPORTANTE: después de esto hay que volver a correr el script de asientos de
-- apertura del kardex si se quiere que los materiales arranquen con su saldo
-- real en lugar de cero.

begin;

-- ── 1. Devolver al stock lo que consumió la prueba ────────────────────────
-- Se recalcula desde el propio kardex en vez de escribir los números a mano:
-- si mañana se corre sobre otra prueba, se ajusta solo.
with consumido as (
  select k.material_id, k.almacen_id,
         sum(case when k.tipo::text like 'SALIDA%' then -k.cantidad else k.cantidad end) as neto
    from kardex_movimientos k
   where k.referencia_tipo in ('OS', 'CORTE')
     and k.material_id is not null
   group by k.material_id, k.almacen_id
)
update stock_actual sa
   set cantidad = sa.cantidad - c.neto
  from consumido c
 where sa.material_id = c.material_id
   and sa.almacen_id  = c.almacen_id;

-- ── 2. Borrar los movimientos de kardex que nacieron de la prueba ─────────
-- Entran también los cuatro ajustes con los que Javier saco los 290 terminados:
-- se borran junto con su entrada para que el saldo no se mueva. Si se borrara
-- solo la entrada, quedaria una salida huerfana en el libro.
delete from kardex_movimientos
 where referencia_tipo in ('OS', 'CORTE', 'INGRESO_PT');

delete from kardex_movimientos k
 where k.tipo::text = 'SALIDA_AJUSTE'
   and k.observacion ilike 'Ajuste conteo%'
   and k.created_at >= '2026-09-18'::date
   and exists (
     select 1 from productos_variantes pv
      join productos p on p.id = pv.producto_id
     where pv.id = k.variante_id and p.codigo = 'PRDM0017'
   );

-- ── 3. Borrar los registros de producción, de hijos a padres ──────────────
--
-- El orden sale del grafo de claves foráneas de la propia base, no de
-- memoria: catorce tablas apuntan a `ot`, `ot_corte`, `ordenes_servicio`,
-- `lotes_pt` o `ingresos_pt`, y saltearse una hace fallar el borrado entero.
--
-- Se comprobó antes de escribir esto que NADA real cuelga de la prueba: cero
-- ventas usan un lote suyo, cero pagos al taller, cero controles de calidad y
-- cero solicitudes. Si alguna de esas cuentas dejara de ser cero, el borrado
-- falla en vez de arrastrar algo que importa.

-- Trazabilidad: SOLO los eventos de esta producción. La tabla tiene casi
-- cuatro mil filas y las demás no tienen nada que ver.
delete from trazabilidad_eventos
 where ot_id in (select id from ot)
    or lote_pt_id in (select id from lotes_pt);

delete from controles_calidad;
delete from tickets_operacion;
delete from solicitudes_os;
delete from pagos_talleres;

delete from ot_registros_tiempo;
delete from ot_corte_tiempos;
delete from ot_corte_lineas;
delete from fichas_piezas_corte;
delete from ordenes_servicio_avios;
delete from ordenes_servicio_lineas;
delete from ordenes_servicio;       -- apunta a ot_corte, va antes que él
delete from ot_corte;

delete from ingresos_pt_lineas;     -- apunta a ingresos_pt y a lotes_pt
delete from lotes_pt;
delete from ingresos_pt;

delete from ot_eventos;
delete from ot_tiempos_reales;
delete from ot_lineas;
delete from ot;
delete from plan_maestro_lineas;
delete from plan_maestro;

-- ── Control ───────────────────────────────────────────────────────────────
select 'plan_maestro'   as tabla, count(*)::int as quedan from plan_maestro
union all select 'ot',                      count(*)::int from ot
union all select 'ot_corte',                count(*)::int from ot_corte
union all select 'ordenes_servicio',        count(*)::int from ordenes_servicio
union all select 'lotes_pt',                count(*)::int from lotes_pt
union all select 'kardex de la prueba',     count(*)::int from kardex_movimientos
          where referencia_tipo in ('OS','CORTE','INGRESO_PT')
order by tabla;

select m.codigo, m.nombre, sa.cantidad as stock_resultante
  from stock_actual sa
  join materiales m on m.id = sa.material_id
 where m.codigo in ('AVIN0093','AVIN0113','TELN0384','TELN0398','TELN0414','TELN0686','TELN0687')
 order by m.codigo;

-- Revisar la salida antes de confirmar.
-- commit;
rollback;
