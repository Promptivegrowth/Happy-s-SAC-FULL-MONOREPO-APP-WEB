'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActionForm } from './use-action-form';
import { SubmitButton } from './submit-button';
import { SunatLookup } from './sunat-lookup';
import { UbigeoSelect } from './ubigeo-select';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Switch } from '@happy/ui/switch';
import { FormGrid, FormRow, FormSection } from '@happy/ui/form-row';
import { Button } from '@happy/ui/button';
import { crearTaller, actualizarTaller } from '@/server/actions/talleres';

const ESPECIALIDADES = [
  { v: 'COSTURA',     l: 'Costura' },
  { v: 'CORTE',       l: 'Corte' },
  { v: 'BORDADO',     l: 'Bordado' },
  { v: 'ESTAMPADO',   l: 'Estampado' },
  { v: 'SUBLIMADO',   l: 'Sublimado' },
  { v: 'PLISADO',     l: 'Plisado' },
  { v: 'DECORADO',    l: 'Decorado' },
  { v: 'ACABADO',     l: 'Acabado' },
  { v: 'PLANCHADO',   l: 'Planchado' },
  { v: 'OJAL_BOTON',  l: 'Ojal y botón' },
] as const;

type Taller = {
  id?: string;
  codigo?: string | null;
  nombre?: string | null;
  tipo_documento?: string | null;
  numero_documento?: string | null;
  direccion?: string | null;
  ubigeo?: string | null;
  telefono?: string | null;
  contacto_nombre?: string | null;
  emite_comprobante?: boolean | null;
  banco?: string | null;
  numero_cuenta?: string | null;
  notas?: string | null;
  calificacion?: number | null;
  especialidades?: string[] | null;
  activo?: boolean | null;
};

export function TallerForm({ initial }: { initial?: Taller }) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarTaller.bind(null, initial!.id!) : crearTaller;
  const { formAction, state } = useActionForm(action, isEdit ? 'Taller actualizado' : 'Taller creado');

  const [emite, setEmite] = useState<boolean>(initial?.emite_comprobante ?? false);
  const [activo, setActivo] = useState<boolean>(initial?.activo ?? true);
  const [especialidades, setEspecialidades] = useState<string[]>(initial?.especialidades ?? ['COSTURA']);
  const [doc, setDoc] = useState(initial?.numero_documento ?? '');
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [direccion, setDireccion] = useState(initial?.direccion ?? '');
  const tipoDoc = initial?.tipo_documento ?? 'RUC';

  function toggleEsp(v: string) {
    setEspecialidades((arr) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }
  function applyLookup(d: { numero?: string; razonSocial?: string; nombreCompleto?: string; direccion?: string }) {
    if (d.numero) setDoc(d.numero);
    const n = d.razonSocial ?? d.nombreCompleto;
    if (n) setNombre(n);
    if (d.direccion) setDireccion(d.direccion);
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Identificación" description="Si el taller emite RUC, autocompleta con SUNAT.">
        <FormGrid cols={3}>
          <FormRow label="Código" required error={state.fields?.codigo}>
            <Input name="codigo" defaultValue={initial?.codigo ?? ''} required maxLength={20} placeholder="TAL-001" />
          </FormRow>
          <FormRow label="Tipo doc" hint="Opcional si no formaliza">
            <select name="tipo_documento" defaultValue={tipoDoc} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">—</option>
              <option value="RUC">RUC</option>
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
            </select>
          </FormRow>
          <FormRow label="Número doc">
            <SunatLookup tipo={(tipoDoc === 'DNI' ? 'dni' : 'ruc')} defaultValue={doc} onResult={applyLookup} name="numero_documento" />
          </FormRow>
        </FormGrid>
        <FormRow label="Nombre" required error={state.fields?.nombre}>
          <Input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </FormRow>
      </FormSection>

      <FormSection title="Especialidades" description="Marca todas las que correspondan.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {ESPECIALIDADES.map((e) => (
            <label key={e.v} className="flex cursor-pointer items-center gap-2 rounded-md border bg-white p-2 text-sm transition hover:bg-happy-50">
              <input
                type="checkbox"
                name="especialidades"
                value={e.v}
                checked={especialidades.includes(e.v)}
                onChange={() => toggleEsp(e.v)}
                className="h-4 w-4 accent-happy-500"
              />
              <span>{e.l}</span>
            </label>
          ))}
        </div>
      </FormSection>

      <FormSection title="Contacto y dirección">
        <FormGrid cols={2}>
          <FormRow label="Dirección" className="sm:col-span-2">
            <Input name="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </FormRow>
          <FormRow label="Ubigeo">
            <UbigeoSelect name="ubigeo" value={initial?.ubigeo ?? null} />
          </FormRow>
          <FormRow label="Teléfono">
            <Input name="telefono" defaultValue={initial?.telefono ?? ''} />
          </FormRow>
          <FormRow label="Contacto">
            <Input name="contacto_nombre" defaultValue={initial?.contacto_nombre ?? ''} />
          </FormRow>
          <FormRow label="Calificación (0-5)">
            <Input name="calificacion" type="number" step="0.1" defaultValue={initial?.calificacion ?? 5} min={0} max={5} />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Pagos">
        <FormGrid cols={2}>
          <FormRow label="Banco">
            <Input name="banco" defaultValue={initial?.banco ?? ''} placeholder="BCP / BBVA / Interbank" />
          </FormRow>
          <FormRow label="Número de cuenta / CCI">
            <Input name="numero_cuenta" defaultValue={initial?.numero_cuenta ?? ''} />
          </FormRow>
        </FormGrid>
        <FormRow label="Notas">
          <Textarea name="notas" defaultValue={initial?.notas ?? ''} rows={2} />
        </FormRow>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={emite} onCheckedChange={setEmite} />
            <input type="hidden" name="emite_comprobante" value={emite ? 'on' : 'off'} />
            <span>Emite comprobante (RUC)</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={activo} onCheckedChange={setActivo} />
            <input type="hidden" name="activo" value={activo ? 'on' : 'off'} />
            <span>Activo</span>
          </label>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/talleres"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">{isEdit ? 'Guardar cambios' : 'Crear taller'}</SubmitButton>
      </div>
    </form>
  );
}
