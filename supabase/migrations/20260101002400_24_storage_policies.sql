-- ===========================================================================
-- HAPPY SAC — Políticas de Storage
-- Buckets definidos en supabase/config.toml
-- ===========================================================================

-- ⚠️ Los buckets se crean al aplicar `supabase db reset` desde config.toml.
--     En producción, usar Dashboard > Storage > Buckets si no existen.

-- Bucket público de fotos de disfraces (web)
do $$
begin
  -- Permitir lectura pública
  insert into storage.buckets (id, name, public) values ('disfraces-fotos','disfraces-fotos', true)
    on conflict (id) do update set public = true;
  insert into storage.buckets (id, name, public) values ('banners-web','banners-web', true)
    on conflict (id) do update set public = true;

  -- Buckets privados
  insert into storage.buckets (id, name, public) values ('fichas-tecnicas','fichas-tecnicas', false)
    on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('comprobantes','comprobantes', false)
    on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('evidencias-pago','evidencias-pago', false)
    on conflict (id) do nothing;
end$$;

-- Lectura pública de disfraces-fotos y banners-web
drop policy if exists "public_read_disfraces" on storage.objects;
create policy "public_read_disfraces" on storage.objects
  for select using (bucket_id in ('disfraces-fotos','banners-web'));

-- Upload de disfraces-fotos: solo staff con rol gerente/jefe_produccion/vendedor_b2b
drop policy if exists "staff_upload_disfraces" on storage.objects;
create policy "staff_upload_disfraces" on storage.objects
  for insert
  with check (
    bucket_id in ('disfraces-fotos','banners-web','fichas-tecnicas','comprobantes','evidencias-pago')
    and auth.uid() is not null
    and public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero','vendedor_b2b','contador','cajero']::rol_sistema[])
  );

drop policy if exists "staff_update_disfraces" on storage.objects;
create policy "staff_update_disfraces" on storage.objects
  for update using (
    bucket_id in ('disfraces-fotos','banners-web','fichas-tecnicas','comprobantes','evidencias-pago')
    and auth.uid() is not null
    and public.tiene_algun_rol(array['gerente','jefe_produccion','almacenero','vendedor_b2b']::rol_sistema[])
  );

drop policy if exists "staff_delete_disfraces" on storage.objects;
create policy "staff_delete_disfraces" on storage.objects
  for delete using (
    bucket_id in ('disfraces-fotos','banners-web','fichas-tecnicas')
    and auth.uid() is not null
    and public.tiene_rol('gerente'::rol_sistema)
  );

-- Evidencias de pago (Yape/Plin screenshots): cliente puede subir, staff lee
drop policy if exists "client_upload_pago" on storage.objects;
create policy "client_upload_pago" on storage.objects
  for insert with check (
    bucket_id = 'evidencias-pago'
    and auth.uid() is not null
  );

drop policy if exists "staff_read_pago" on storage.objects;
create policy "staff_read_pago" on storage.objects
  for select using (
    bucket_id = 'evidencias-pago'
    and (
      auth.uid() is not null
      and (public.tiene_algun_rol(array['gerente','cajero','vendedor_b2b','contador']::rol_sistema[])
           or owner = auth.uid())
    )
  );
