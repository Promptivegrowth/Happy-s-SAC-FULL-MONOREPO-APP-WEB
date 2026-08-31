-- 86_storage_read_comprobantes
-- Faltaba una política de SELECT para el bucket privado `comprobantes`. Sin ella
-- `createSignedUrl` falla y el ERP no puede mostrar el PDF del comprobante desde
-- otra PC (pedido cliente 2026-08-30). Permitimos lectura al staff administrativo.

drop policy if exists "staff_read_comprobantes" on storage.objects;
create policy "staff_read_comprobantes" on storage.objects
  for select using (
    bucket_id = 'comprobantes'
    and auth.uid() is not null
    and public.tiene_algun_rol(
      array['gerente','contador','cajero','vendedor_b2b','jefe_produccion','almacenero']::rol_sistema[]
    )
  );

-- Permitir que el cajero pueda re-subir (upsert) el mismo PDF si re-imprime.
drop policy if exists "staff_update_disfraces" on storage.objects;
create policy "staff_update_disfraces" on storage.objects
  for update using (
    bucket_id in ('disfraces-fotos','banners-web','fichas-tecnicas','comprobantes','evidencias-pago')
    and auth.uid() is not null
    and public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero','vendedor_b2b','cajero']::rol_sistema[])
  );
