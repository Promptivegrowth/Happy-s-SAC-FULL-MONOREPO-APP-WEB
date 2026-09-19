-- ===========================================================================
-- Rol "Almacén La Quinta": sólo Inventario
-- ===========================================================================
--
-- Pedido de Javier (19/09/2026): un rol de almacén que vea únicamente el módulo
-- de Inventario. Nada de personas, nada de compras, nada de tableros.
--
-- DOS PARTES, Y LA SEGUNDA HAY QUE CORRERLA A MANO
--
-- 1. El valor del enum. Ya está aplicado en producción y es inerte: mientras
--    nadie tenga el rol, no cambia nada para nadie.
--
-- 2. La equivalencia en `tiene_algun_rol`, ABAJO. Esa función respalda 105
--    políticas RLS —o sea, prácticamente todas las lecturas y escrituras del
--    sistema, el POS incluido—. No se corre con la tienda vendiendo: si algo
--    saliera mal ahí, se cae todo. Correrla con la tienda cerrada, y sólo
--    cuando se vaya a asignar el rol a alguien.
--
-- POR QUÉ LA EQUIVALENCIA
--
-- Las 105 políticas nombran los roles uno por uno. Un rol nuevo no figura en
-- ninguna, así que quien lo tuviera no podría leer NADA: ni un producto, ni un
-- stock. Agregarlo a las 105 sería tocar 105 cosas que hoy funcionan.
--
-- La alternativa es esta: para la base de datos, un almacenero de La Quinta es
-- un almacenero. El recorte a "sólo Inventario" vive en el mapa de rutas del
-- ERP (`apps/erp/src/server/permisos.ts`), que es donde se decide qué se ve.
--
-- OJO CON EL ALCANCE — decirlo claro antes de prometerlo
--
-- Este rol limita QUÉ MÓDULO se ve, no DE QUÉ ALMACÉN se ven los datos. Quien
-- lo tenga va a entrar a Inventario y ver el stock de todos los almacenes, no
-- sólo el de La Quinta. Separar los datos por almacén es otro trabajo: hay que
-- filtrar por `almacen_default` en cada consulta y en las políticas. Si Javier
-- esperaba eso, hay que decírselo antes.

-- ── 1. El valor del enum (ya aplicado) ─────────────────────────────────────
-- No puede ir en la misma transacción que su uso, por eso va suelto.
alter type rol_sistema add value if not exists 'almacen_la_quinta';

-- ── 2. La equivalencia. NO CORRER CON LA TIENDA ABIERTA ────────────────────
--
-- Es estrictamente aditiva: para quien no tenga `almacen_la_quinta`, la rama
-- nueva nunca es verdadera y la función responde exactamente igual que antes.
-- Aun así, conviene comprobar después que el POS cobra y que el ERP lista.

create or replace function public.tiene_algun_rol(p_roles rol_sistema[])
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
  select exists (
    select 1 from public.usuarios_roles ur
    where ur.usuario_id = auth.uid()
      and (
        ur.rol = any(p_roles)
        -- Para la base, un almacenero de La Quinta es un almacenero.
        or (ur.rol = 'almacen_la_quinta' and 'almacenero'::rol_sistema = any(p_roles))
      )
  );
$function$;

-- ── Comprobación posterior ─────────────────────────────────────────────────
-- Debe devolver 0 mientras nadie tenga el rol todavía: si da 0, la funcion se
-- comporta igual que antes para todo el mundo y el cambio no pudo afectar nada.
--
--   select count(*) from usuarios_roles where rol = 'almacen_la_quinta';
