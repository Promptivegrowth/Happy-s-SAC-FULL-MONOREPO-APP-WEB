-- ===========================================================================
-- Seis líneas de receta a las que les falta el punto decimal
-- ===========================================================================
--
-- CÓMO SE ENCONTRARON
--
-- Javier reportó que la OT-26-00001 del disfraz de mariposa (PRDM0017) mandaba
-- 3227.8 m de elástico al taller, "mucho menos" de lo que correspondía. El
-- cálculo estaba bien; la receta no:
--
--   T4 0.42 · T6 0.44 · T8 0.46 · T10 0.48 · T12 0.50 · T14 52.00 · T16 0.54
--                                                            ^^^^^
--
-- Comprobación: 50×0.42 + 80×0.46 + 100×0.50 + 60×52 = 3227.8, que es
-- exactamente lo que salió impreso. Con 0.52 la orden habría pedido 139 m.
--
-- Buscando la misma forma —una talla que se sale de escala frente a sus propias
-- hermanas— aparecieron seis casos en todo el sistema. En cinco, los dígitos
-- cargados son exactamente los decimales que faltan (39 → 0.39, 52 → 0.52), así
-- que la corrección no es una interpretación.
--
-- EL SEXTO NO SE TOCA
--
-- HWM0010 / NOTEX BLANCO / T2 dice 271 con una mediana de 0.42. Podría ser 0.271
-- o 2.71 y no hay forma de saberlo desde acá. Ese lo tiene que decir Javier.
--
-- POR QUÉ IMPORTA
--
-- Una receta mal cargada no se queda quieta: decide cuánto material sale del
-- almacén hacia el taller, cuánto stock se descuenta y cuánto cuesta la prenda.
-- Los avíos ya enviados con el número viejo hay que regularizarlos aparte; esto
-- sólo corrige la receta para las órdenes que vengan.
--
-- CÓMO USARLO
--
--   1. Correr tal cual: termina en rollback y sólo muestra el antes y el después.
--   2. Revisar la salida con Javier.
--   3. Cambiar `rollback` por `commit` y volver a correrlo.

begin;

with correcciones(producto, material, talla, valor_correcto) as (
  values
    ('PRDM0017', 'AVIN0113', 'T14', 0.52),   -- elástico poliéster 5 cm
    ('PRM0037',  'AVIN0115', 'T12', 0.47),   -- elástico poliéster 2 cm
    ('PVM0016',  'AVIN0115', 'T2',  0.35),   -- elástico poliéster 2 cm
    ('DTXM0010', 'TELN0483', 'T14', 0.39),   -- bayetilla azulino
    ('DTXM0016', 'TELN0483', 'T14', 0.39)    -- bayetilla azulino
)
update recetas_lineas rl
   set cantidad = c.valor_correcto,
       observacion = coalesce(rl.observacion || ' · ', '')
                  || 'Corregido 18/09/2026: faltaba el punto decimal'
  from correcciones c, recetas r, productos p, materiales m
 where rl.receta_id = r.id
   and r.producto_id = p.id
   and r.activa
   and rl.material_id = m.id
   and p.codigo = c.producto
   and m.codigo = c.material
   and rl.talla::text = c.talla
   and rl.cantidad > c.valor_correcto * 20;   -- sólo si sigue mal

-- Control: la línea corregida al lado de sus hermanas.
select p.codigo as producto, m.nombre as material,
       rl.talla::text as talla, rl.cantidad
  from recetas r
  join productos p       on p.id = r.producto_id
  join recetas_lineas rl on rl.receta_id = r.id
  join materiales m      on m.id = rl.material_id
 where r.activa
   and p.codigo in ('PRDM0017','PRM0037','PVM0016','DTXM0010','DTXM0016','HWM0010')
 order by p.codigo, m.nombre, rl.talla::text;

-- Revisar la salida antes de confirmar.
-- commit;
rollback;
