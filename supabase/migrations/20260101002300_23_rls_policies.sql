-- ===========================================================================
-- HAPPY SAC — Row Level Security (RLS)
-- Estrategia:
--   • Por defecto TODAS las tablas tienen RLS habilitado.
--   • Catálogos públicos (categorías publicadas, productos publicados, banners web,
--     reseñas aprobadas) son SELECT libre.
--   • Datos administrativos: solo usuarios autenticados con rol adecuado.
--   • Cliente final: solo ve sus propios pedidos web, carritos, reclamos.
-- ===========================================================================

-- =================================================================
-- Habilitar RLS en todas las tablas relevantes
-- =================================================================
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
      and tablename not in ('correlativos','audit_log','webhooks_log','correos_log','configuracion')
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end$$;

-- Para correlativos / audit / config dejamos RLS desactivado (manejados por funciones SECURITY DEFINER).
alter table public.correlativos enable row level security;
alter table public.audit_log enable row level security;
alter table public.configuracion enable row level security;

-- =================================================================
-- Políticas: catálogos públicos del sitio
-- =================================================================
drop policy if exists "categorias_public_read" on public.categorias;
create policy "categorias_public_read" on public.categorias
  for select using (publicar_en_web = true and activo = true);

drop policy if exists "productos_public_read" on public.productos;
create policy "productos_public_read" on public.productos
  for select using (
    activo = true and exists (
      select 1 from public.productos_publicacion pp
      where pp.producto_id = productos.id and pp.publicado = true
    )
  );

drop policy if exists "productos_variantes_public_read" on public.productos_variantes;
create policy "productos_variantes_public_read" on public.productos_variantes
  for select using (
    activo = true and exists (
      select 1 from public.productos_publicacion pp
      where pp.producto_id = productos_variantes.producto_id and pp.publicado = true
    )
  );

drop policy if exists "productos_imagenes_public_read" on public.productos_imagenes;
create policy "productos_imagenes_public_read" on public.productos_imagenes
  for select using (
    exists (
      select 1 from public.productos_publicacion pp
      where pp.producto_id = productos_imagenes.producto_id and pp.publicado = true
    )
    or exists (
      select 1 from public.productos_publicacion pp
      join public.productos_variantes pv on pv.producto_id = pp.producto_id
      where pv.id = productos_imagenes.variante_id and pp.publicado = true
    )
  );

drop policy if exists "publicacion_public_read" on public.productos_publicacion;
create policy "publicacion_public_read" on public.productos_publicacion
  for select using (publicado = true);

drop policy if exists "banners_public_read" on public.web_banners;
create policy "banners_public_read" on public.web_banners
  for select using (
    activo = true
    and (fecha_inicio is null or fecha_inicio <= now())
    and (fecha_fin is null or fecha_fin >= now())
  );

drop policy if exists "resenas_public_read" on public.productos_resenas;
create policy "resenas_public_read" on public.productos_resenas
  for select using (aprobada = true);

drop policy if exists "campanas_public_read" on public.campanas;
create policy "campanas_public_read" on public.campanas
  for select using (activa = true);

drop policy if exists "colores_public_read" on public.colores;
create policy "colores_public_read" on public.colores
  for select using (true);

drop policy if exists "marcas_public_read" on public.marcas;
create policy "marcas_public_read" on public.marcas
  for select using (true);

-- =================================================================
-- Políticas: clientes (cada cliente solo ve sus datos propios)
-- =================================================================
drop policy if exists "clientes_self_read" on public.clientes;
create policy "clientes_self_read" on public.clientes
  for select using (
    public.es_admin()
    or public.tiene_algun_rol(array['vendedor_b2b','cajero','contador','jefe_produccion']::rol_sistema[])
    or usuario_id = auth.uid()
  );

drop policy if exists "clientes_self_update" on public.clientes;
create policy "clientes_self_update" on public.clientes
  for update using (usuario_id = auth.uid() or public.es_admin());

drop policy if exists "clientes_admin_insert" on public.clientes;
create policy "clientes_admin_insert" on public.clientes
  for insert with check (true); -- registro abierto (se crea automáticamente al checkout)

-- =================================================================
-- Carrito (anónimo permitido vía session_token)
-- =================================================================
drop policy if exists "carritos_self_full" on public.carritos;
create policy "carritos_self_full" on public.carritos
  for all using (
    usuario_id = auth.uid()
    or session_token is not null
    or public.es_admin()
  )
  with check (
    usuario_id = auth.uid()
    or session_token is not null
    or public.es_admin()
  );

drop policy if exists "carritos_lineas_self" on public.carritos_lineas;
create policy "carritos_lineas_self" on public.carritos_lineas
  for all using (
    exists (select 1 from public.carritos c where c.id = carritos_lineas.carrito_id
              and (c.usuario_id = auth.uid() or c.session_token is not null))
    or public.es_admin()
  )
  with check (
    exists (select 1 from public.carritos c where c.id = carritos_lineas.carrito_id
              and (c.usuario_id = auth.uid() or c.session_token is not null))
    or public.es_admin()
  );

-- =================================================================
-- Pedidos web: cliente ve sus pedidos; staff ve todos
-- =================================================================
drop policy if exists "pedidos_web_self_or_staff_read" on public.pedidos_web;
create policy "pedidos_web_self_or_staff_read" on public.pedidos_web
  for select using (
    usuario_id = auth.uid()
    or public.tiene_algun_rol(array['gerente','vendedor_b2b','cajero','contador','almacenero']::rol_sistema[])
  );

drop policy if exists "pedidos_web_insert_self" on public.pedidos_web;
create policy "pedidos_web_insert_self" on public.pedidos_web
  for insert with check (
    usuario_id = auth.uid()
    or usuario_id is null  -- guest checkout
  );

drop policy if exists "pedidos_web_lineas_read" on public.pedidos_web_lineas;
create policy "pedidos_web_lineas_read" on public.pedidos_web_lineas
  for select using (
    exists (select 1 from public.pedidos_web p where p.id = pedidos_web_lineas.pedido_id
              and (p.usuario_id = auth.uid()
                   or public.tiene_algun_rol(array['gerente','vendedor_b2b','cajero','contador','almacenero']::rol_sistema[])))
  );

-- Reclamos: cliente puede crear; staff lee todos; cliente lee los propios.
drop policy if exists "reclamos_anyone_insert" on public.reclamos;
create policy "reclamos_anyone_insert" on public.reclamos
  for insert with check (true);

drop policy if exists "reclamos_self_read" on public.reclamos;
create policy "reclamos_self_read" on public.reclamos
  for select using (
    cliente_documento_numero = (select dni from public.perfiles where id = auth.uid())
    or public.tiene_algun_rol(array['gerente','contador','vendedor_b2b']::rol_sistema[])
  );

-- =================================================================
-- ERP / staff: por defecto solo usuarios autenticados con rol staff
-- =================================================================
do $$
declare
  staff_table text;
  staff_tables text[] := array[
    'empresa','almacenes','cajas','cajas_sesiones','caja_chica_movimientos',
    'perfiles','usuarios_roles','usuarios_almacenes',
    'unidades_medida','marcas','campanas','colores',
    'materiales','materiales_lotes','materiales_colores','materiales_precios_historico',
    'productos','productos_variantes','productos_imagenes','productos_publicacion','productos_sets','productos_sets_lineas',
    'recetas','recetas_lineas',
    'areas_produccion','productos_procesos','costos_confeccion','costos_indirectos',
    'proveedores','proveedores_cuentas','proveedores_materiales',
    'talleres','talleres_tarifas',
    'operarios','asistencias','operarios_adelantos','operarios_produccion',
    'stock_actual','kardex_movimientos','traslados','traslados_lineas','ajustes_inventario','ajustes_inventario_lineas',
    'oc','oc_lineas','oc_recepciones','oc_recepciones_lineas','importaciones','pagos_proveedores',
    'plan_maestro','plan_maestro_lineas','ot','ot_lineas','ot_corte','ot_corte_lineas',
    'ordenes_servicio','ordenes_servicio_lineas','ordenes_servicio_avios','tickets_operacion','ot_eventos',
    'ingresos_pt','ingresos_pt_lineas',
    'defectos','controles_calidad','controles_calidad_detalle','lotes_pt','trazabilidad_eventos',
    'ventas','ventas_lineas','ventas_pagos','devoluciones','devoluciones_lineas',
    'pedidos_b2b','pedidos_b2b_lineas','pedidos_b2b_despachos',
    'series_comprobantes','comprobantes','comprobantes_lineas','guias_remision','guias_remision_items',
    'cupones','notificaciones_stock','notificaciones'
  ];
begin
  foreach staff_table in array staff_tables loop
    execute format('drop policy if exists %I on public.%I', staff_table || '_staff_full', staff_table);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() is not null and public.tiene_algun_rol(array[''gerente'',''jefe_produccion'',''operario'',''almacenero'',''cajero'',''vendedor_b2b'',''contador'']::rol_sistema[])) with check (auth.uid() is not null and public.tiene_algun_rol(array[''gerente'',''jefe_produccion'',''operario'',''almacenero'',''cajero'',''vendedor_b2b'',''contador'']::rol_sistema[]))',
      staff_table || '_staff_full',
      staff_table
    );
  end loop;
end$$;

-- =================================================================
-- Configuración y audit_log: solo gerente
-- =================================================================
drop policy if exists "configuracion_admin_full" on public.configuracion;
create policy "configuracion_admin_full" on public.configuracion
  for all using (public.es_admin()) with check (public.es_admin());

drop policy if exists "audit_admin_read" on public.audit_log;
create policy "audit_admin_read" on public.audit_log
  for select using (public.es_admin() or public.tiene_rol('contador'::rol_sistema));

drop policy if exists "audit_authenticated_insert" on public.audit_log;
create policy "audit_authenticated_insert" on public.audit_log
  for insert with check (auth.uid() is not null);
