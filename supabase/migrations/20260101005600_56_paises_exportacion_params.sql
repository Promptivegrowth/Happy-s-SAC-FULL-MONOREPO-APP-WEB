-- ===========================================================================
-- HAPPY SAC — Parámetros de país destino para auto-cálculo de exportación
-- ===========================================================================
-- Objetivo: dejar el módulo funcional para que al elegir un país el sistema
-- auto-complete puerto sugerido, INCOTERM típico, acuerdo comercial aplicable,
-- y calcule drawback estimado + saldo a favor del exportador.
--
-- Referencias:
--   - CAN (Comunidad Andina): Ecuador es miembro pleno. Arancel 0% con
--     Certificado de Origen (Decisión 416). Venezuela salió en 2006.
--   - TLC Perú-Chile (2006): 0% arancel textiles con Certificado de Origen.
--   - Drawback (D.S. 104-95-EF): devolución 3% del valor FOB exportado para
--     insumos importados usados en el producto. Requiere Solicitud SUNAT.
--   - Saldo a Favor del Exportador (SFE, Art. 34 Ley IGV): IGV pagado en
--     compras nacionales usadas en la exportación se recupera contra IGV
--     nacional o se pide devolución.
-- ===========================================================================

alter table public.paises_exportacion
  add column if not exists puerto_default text,
  add column if not exists incoterm_default text,
  add column if not exists acuerdo_comercial text,          -- 'CAN', 'TLC-CHILE', 'NINGUNO'
  add column if not exists certificado_origen_requerido boolean not null default true,
  add column if not exists arancel_preferencial_pct numeric(5,2) default 0,
  add column if not exists iva_pais_destino_pct numeric(5,2),
  add column if not exists observaciones text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'paises_incoterm_default_chk') then
    alter table public.paises_exportacion
      add constraint paises_incoterm_default_chk
      check (incoterm_default is null or incoterm_default in ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'paises_acuerdo_chk') then
    alter table public.paises_exportacion
      add constraint paises_acuerdo_chk
      check (acuerdo_comercial is null or acuerdo_comercial in ('CAN','TLC-CHILE','MERCOSUR','TLC-EEUU','TLC-UE','TPP','ALIANZA-PACIFICO','NINGUNO'));
  end if;
end$$;

-- Actualizar los 3 países sembrados con datos operativos
update public.paises_exportacion set
  puerto_default = 'Callao (marítimo) / Jorge Chávez (aéreo)',
  incoterm_default = 'FOB',
  acuerdo_comercial = 'CAN',
  certificado_origen_requerido = true,
  arancel_preferencial_pct = 0,
  iva_pais_destino_pct = 12.00,
  observaciones = 'Miembro CAN (Decisión 416). Con Certificado de Origen CAN el arancel es 0%. IVA Ecuador 12% lo paga el importador allá. Puerto destino típico: Guayaquil (marítimo) o Quito (aéreo).'
where codigo_iso = 'EC';

update public.paises_exportacion set
  puerto_default = 'Callao (marítimo) / Jorge Chávez (aéreo)',
  incoterm_default = 'FOB',
  acuerdo_comercial = 'TLC-CHILE',
  certificado_origen_requerido = true,
  arancel_preferencial_pct = 0,
  iva_pais_destino_pct = 19.00,
  observaciones = 'TLC Perú-Chile (2006). Textiles con Certificado de Origen: arancel 0%. IVA Chile 19% lo paga el importador allá. Puertos destino típicos: Valparaíso, San Antonio, Iquique.'
where codigo_iso = 'CL';

update public.paises_exportacion set
  puerto_default = 'Callao (marítimo) / Jorge Chávez (aéreo)',
  incoterm_default = 'FOB',
  acuerdo_comercial = 'NINGUNO',
  certificado_origen_requerido = false,
  arancel_preferencial_pct = 0,
  iva_pais_destino_pct = 16.00,
  observaciones = 'Sin TLC activo con Perú. Aranceles y regulaciones cambiarias variables — validar antes del embarque. Puertos destino: La Guaira o Puerto Cabello. Considerar volatilidad del BsD.'
where codigo_iso = 'VE';

-- Tabla de parámetros globales de exportación (drawback %, IGV base para SFE, etc.)
create table if not exists public.exportacion_parametros (
  clave text primary key,
  valor_num numeric,
  valor_txt text,
  descripcion text,
  updated_at timestamptz default now()
);

insert into public.exportacion_parametros (clave, valor_num, descripcion) values
  ('DRAWBACK_PCT',       3.00,  'Porcentaje de drawback sobre valor FOB (D.S. 104-95-EF). Actualmente 3%.'),
  ('IGV_PCT',           18.00,  'IGV nacional (Art. 5 Ley IGV). Usado para estimar Saldo a Favor del Exportador.'),
  ('DRAWBACK_TOPE_UIT', 20.00,  'Tope anual de drawback en UIT por exportador (aprox — validar con SUNAT).')
on conflict (clave) do nothing;

alter table public.exportacion_parametros enable row level security;

drop policy if exists exportacion_parametros_read on public.exportacion_parametros;
create policy exportacion_parametros_read on public.exportacion_parametros
  for select using (true);

drop policy if exists exportacion_parametros_write on public.exportacion_parametros;
create policy exportacion_parametros_write on public.exportacion_parametros
  for all
  using (
    exists (select 1 from public.usuarios_roles ur
            where ur.usuario_id = auth.uid() and ur.rol = 'gerente')
  )
  with check (
    exists (select 1 from public.usuarios_roles ur
            where ur.usuario_id = auth.uid() and ur.rol = 'gerente')
  );

comment on table public.exportacion_parametros is
  'Parámetros globales de exportación: drawback %, IGV %, topes. Editable por gerente.';

-- Persistir además en ventas los cálculos de drawback / SFE al momento del
-- registro (para que queden inmutables aunque cambien los parámetros después).
alter table public.ventas
  add column if not exists drawback_estimado_pen numeric(14,2),
  add column if not exists saldo_favor_exportador_pen numeric(14,2);

comment on column public.ventas.drawback_estimado_pen is
  'Drawback estimado (% * total FOB en soles) al momento de emitir la factura. Referencial — la devolución real depende de la solicitud SUNAT y sus validaciones.';
comment on column public.ventas.saldo_favor_exportador_pen is
  'Saldo a Favor del Exportador estimado (Art. 34 Ley IGV). Referencial — el monto real se calcula sobre las compras nacionales usadas.';
