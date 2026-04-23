'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { SunatLookup } from './sunat-lookup';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Button } from '@happy/ui/button';
import { crearProveedor, actualizarProveedor } from '@/server/actions/proveedores';

type Proveedor = {
  id?: string;
  tipo_documento?: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE' | null;
  numero_documento?: string | null;
  razon_social?: string | null;
  nombre_comercial?: string | null;
  direccion?: string | null;
  ubigeo?: string | null;
  telefono?: string | null;
  email?: string | null;
  contacto_nombre?: string | null;
  contacto_telefono?: string | null;
  dias_pago_default?: number | null;
  moneda?: string | null;
  es_importacion?: boolean | null;
  notas?: string | null;
  activo?: boolean | null;
};

export function ProveedorForm({ initial }: { initial?: Proveedor }) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarProveedor.bind(null, initial!.id!) : crearProveedor;
  const { formAction, state } = useActionForm(action, isEdit ? 'Proveedor actualizado' : 'Proveedor creado');

  const [numero, setNumero] = useState(initial?.numero_documento ?? '');
  const [razon, setRazon] = useState(initial?.razon_social ?? '');
  const [direccion, setDireccion] = useState(initial?.direccion ?? '');
  const [imp, setImp] = useState(initial?.es_importacion ?? false);
  const [activo, setActivo] = useState(initial?.activo ?? true);

  function applyLookup(d: { numero?: string; razonSocial?: string; direccion?: string }) {
    if (d.numero) setNumero(d.numero);
    if (d.razonSocial) setRazon(d.razonSocial);
    if (d.direccion) setDireccion(d.direccion);
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Identificación" description="Autocompleta con SUNAT.">
        <FormGrid cols={3}>
          <FormRow label="Tipo">
            <select name="tipo_documento" defaultValue={initial?.tipo_documento ?? 'RUC'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="RUC">RUC</option>
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
            </select>
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label="Número" required error={state.fields?.numero_documento}>
              <SunatLookup tipo="ruc" defaultValue={numero} onResult={applyLookup} name="numero_documento" required />
            </FormRow>
          </div>
        </FormGrid>
        <FormGrid cols={2}>
          <FormRow label="Razón social" required error={state.fields?.razon_social}>
            <Input name="razon_social" value={razon} onChange={(e) => setRazon(e.target.value)} required />
          </FormRow>
          <FormRow label="Nombre comercial">
            <Input name="nombre_comercial" defaultValue={initial?.nombre_comercial ?? ''} />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Dirección y contacto">
        <FormRow label="Dirección">
          <Input name="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </FormRow>
        <FormGrid cols={2}>
          <FormRow label="Ubigeo">
            <Input name="ubigeo" defaultValue={initial?.ubigeo ?? ''} maxLength={6} pattern="\d{6}" placeholder="150115" />
          </FormRow>
          <FormRow label="Teléfono">
            <Input name="telefono" defaultValue={initial?.telefono ?? ''} />
          </FormRow>
          <FormRow label="Email">
            <Input name="email" type="email" defaultValue={initial?.email ?? ''} />
          </FormRow>
          <FormRow label="Contacto (persona)">
            <Input name="contacto_nombre" defaultValue={initial?.contacto_nombre ?? ''} />
          </FormRow>
          <FormRow label="Tel. del contacto">
            <Input name="contacto_telefono" defaultValue={initial?.contacto_telefono ?? ''} />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Términos comerciales">
        <FormGrid cols={3}>
          <FormRow label="Días de pago" hint="0 = al contado">
            <Input name="dias_pago_default" type="number" defaultValue={initial?.dias_pago_default ?? 0} min={0} />
          </FormRow>
          <FormRow label="Moneda">
            <select name="moneda" defaultValue={initial?.moneda ?? 'PEN'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="PEN">PEN (Soles)</option>
              <option value="USD">USD (Dólares)</option>
            </select>
          </FormRow>
        </FormGrid>
        <FormRow label="Notas">
          <Textarea name="notas" defaultValue={initial?.notas ?? ''} rows={2} />
        </FormRow>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={imp} onCheckedChange={setImp} />
            <input type="hidden" name="es_importacion" value={imp ? 'on' : 'off'} />
            <span>Es proveedor de importación</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <input type="hidden" name="activo" value={activo ? 'on' : 'off'} />
            <span>Activo</span>
          </label>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/proveedores"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">{isEdit ? 'Guardar cambios' : 'Crear proveedor'}</SubmitButton>
      </div>
    </form>
  );
}
