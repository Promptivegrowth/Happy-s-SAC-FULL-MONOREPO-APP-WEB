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
import { crearCliente, actualizarCliente } from '@/server/actions/clientes';

type Cliente = {
  id?: string;
  tipo_documento?: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';
  numero_documento?: string;
  tipo_cliente?: 'PUBLICO_FINAL' | 'MAYORISTA_A' | 'MAYORISTA_B' | 'MAYORISTA_C' | 'INDUSTRIAL';
  razon_social?: string | null;
  nombres?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  nombre_comercial?: string | null;
  email?: string | null;
  telefono?: string | null;
  telefono_secundario?: string | null;
  direccion?: string | null;
  ubigeo?: string | null;
  notas?: string | null;
  activo?: boolean;
  descuento_default?: number | null;
};

export function ClienteForm({ initial }: { initial?: Cliente }) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarCliente.bind(null, initial!.id!) : crearCliente;
  const { formAction, state } = useActionForm(action, isEdit ? 'Cliente actualizado' : 'Cliente creado');

  const [tipoDoc, setTipoDoc] = useState<'DNI' | 'RUC' | 'CE' | 'PASAPORTE'>(initial?.tipo_documento ?? 'DNI');
  const [numero, setNumero] = useState(initial?.numero_documento ?? '');
  const [razon, setRazon] = useState(initial?.razon_social ?? '');
  const [nombres, setNombres] = useState(initial?.nombres ?? '');
  const [apPat, setApPat] = useState(initial?.apellido_paterno ?? '');
  const [apMat, setApMat] = useState(initial?.apellido_materno ?? '');
  const [direccion, setDireccion] = useState(initial?.direccion ?? '');
  const [activo, setActivo] = useState(initial?.activo ?? true);

  const isRUC = tipoDoc === 'RUC';

  function applyLookup(d: { numero?: string; razonSocial?: string; nombres?: string; apellidoPaterno?: string; apellidoMaterno?: string; direccion?: string; nombreCompleto?: string }) {
    if (d.numero) setNumero(d.numero);
    if (isRUC && d.razonSocial) setRazon(d.razonSocial);
    if (!isRUC) {
      if (d.nombres) setNombres(d.nombres);
      if (d.apellidoPaterno) setApPat(d.apellidoPaterno);
      if (d.apellidoMaterno) setApMat(d.apellidoMaterno);
    }
    if (d.direccion) setDireccion(d.direccion);
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Identificación" description="Autocompleta con SUNAT (RUC) o RENIEC (DNI).">
        <FormGrid cols={3}>
          <FormRow label="Tipo de documento" required>
            <select
              name="tipo_documento"
              value={tipoDoc}
              onChange={(e) => setTipoDoc(e.target.value as 'DNI' | 'RUC' | 'CE' | 'PASAPORTE')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">Carnet Extranjería</option>
              <option value="PASAPORTE">Pasaporte</option>
            </select>
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label={`Número de ${tipoDoc}`} required error={state.fields?.numero_documento}>
              {tipoDoc === 'DNI' || tipoDoc === 'RUC' ? (
                <SunatLookup tipo={tipoDoc.toLowerCase() as 'dni' | 'ruc'} defaultValue={numero} onResult={applyLookup} name="numero_documento" required />
              ) : (
                <Input name="numero_documento" defaultValue={numero} maxLength={20} required />
              )}
            </FormRow>
          </div>
        </FormGrid>

        {isRUC ? (
          <FormGrid cols={2}>
            <FormRow label="Razón social" required error={state.fields?.razon_social}>
              <Input name="razon_social" value={razon} onChange={(e) => setRazon(e.target.value)} required />
            </FormRow>
            <FormRow label="Nombre comercial">
              <Input name="nombre_comercial" defaultValue={initial?.nombre_comercial ?? ''} />
            </FormRow>
          </FormGrid>
        ) : (
          <FormGrid cols={3}>
            <FormRow label="Nombres" required>
              <Input name="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
            </FormRow>
            <FormRow label="Apellido paterno">
              <Input name="apellido_paterno" value={apPat} onChange={(e) => setApPat(e.target.value)} />
            </FormRow>
            <FormRow label="Apellido materno">
              <Input name="apellido_materno" value={apMat} onChange={(e) => setApMat(e.target.value)} />
            </FormRow>
          </FormGrid>
        )}

        <FormRow label="Tipo de cliente" required hint="Define qué lista de precios aplica por defecto">
          <select name="tipo_cliente" defaultValue={initial?.tipo_cliente ?? 'PUBLICO_FINAL'} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="PUBLICO_FINAL">Público final</option>
            <option value="MAYORISTA_A">Mayorista A</option>
            <option value="MAYORISTA_B">Mayorista B</option>
            <option value="MAYORISTA_C">Mayorista C</option>
            <option value="INDUSTRIAL">Industrial</option>
          </select>
        </FormRow>
      </FormSection>

      <FormSection title="Contacto y dirección">
        <FormGrid cols={2}>
          <FormRow label="Email">
            <Input name="email" type="email" defaultValue={initial?.email ?? ''} />
          </FormRow>
          <FormRow label="Teléfono">
            <Input name="telefono" defaultValue={initial?.telefono ?? ''} />
          </FormRow>
          <FormRow label="Teléfono secundario">
            <Input name="telefono_secundario" defaultValue={initial?.telefono_secundario ?? ''} />
          </FormRow>
          <FormRow label="Descuento por defecto (%)">
            <Input name="descuento_default" type="number" step="0.01" defaultValue={initial?.descuento_default ?? 0} min={0} max={100} />
          </FormRow>
          <FormRow label="Dirección" className="sm:col-span-2">
            <Input name="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </FormRow>
          <FormRow label="Ubigeo (6 dígitos INEI)" className="sm:col-span-2" hint="Próximamente: selector con autocompletar">
            <Input name="ubigeo" defaultValue={initial?.ubigeo ?? ''} maxLength={6} pattern="\d{6}" placeholder="150101 (Lima/Lima/Lima)" />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Otros">
        <FormRow label="Notas internas">
          <Textarea name="notas" defaultValue={initial?.notas ?? ''} rows={2} />
        </FormRow>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={activo} onCheckedChange={setActivo} />
          <input type="hidden" name="activo" value={activo ? 'on' : 'off'} />
          <span>Cliente activo</span>
        </label>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/clientes"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">{isEdit ? 'Guardar cambios' : 'Crear cliente'}</SubmitButton>
      </div>
    </form>
  );
}
