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
import { crearOperario, actualizarOperario } from '@/server/actions/operarios';

type Area = { id: string; nombre: string };

type Operario = {
  id?: string;
  codigo?: string | null;
  nombres?: string | null;
  apellido_paterno?: string | null;
  apellido_materno?: string | null;
  dni?: string | null;
  telefono?: string | null;
  email?: string | null;
  area_id?: string | null;
  tipo_operario?: string | null;
  tipo_contrato?: string | null;
  tarifa_destajo?: number | null;
  sueldo_base?: number | null;
  fecha_ingreso?: string | null;
  jornada_personalizada?: boolean | null;
  jornada_inicio?: string | null;
  jornada_fin?: string | null;
  jornada_dias?: string[] | null;
  notas?: string | null;
  activo?: boolean | null;
};

type JornadaEstandar = { inicio: string; fin: string; dias: string[] };

const TIPOS_OPERARIO = [
  { v: 'OPERARIO',       l: 'Operario' },
  { v: 'AYUDANTE',       l: 'Ayudante' },
  { v: 'SUPERVISOR',     l: 'Supervisor' },
  { v: 'JEFE_AREA',      l: 'Jefe de área' },
  { v: 'ADMINISTRATIVO', l: 'Administrativo' },
  { v: 'SERVICIO',       l: 'Servicio (limpieza, comedor)' },
] as const;

const TIPOS_CONTRATO = [
  { v: 'PLANILLA',    l: 'Planilla',    hint: 'En planilla, paga sueldo base mensual' },
  { v: 'DESTAJO',     l: 'Destajo',     hint: 'Cobra por unidad producida' },
  { v: 'MIXTO',       l: 'Mixto',       hint: 'Sueldo + destajo' },
  { v: 'HONORARIOS',  l: 'Honorarios',  hint: 'Recibo por honorarios (RH)' },
] as const;

const DIAS = [
  { v: 'LUN', l: 'L' }, { v: 'MAR', l: 'M' }, { v: 'MIE', l: 'X' },
  { v: 'JUE', l: 'J' }, { v: 'VIE', l: 'V' }, { v: 'SAB', l: 'S' }, { v: 'DOM', l: 'D' },
] as const;

export function OperarioForm({ initial, areas, jornadaEstandar }: {
  initial?: Operario;
  areas: Area[];
  jornadaEstandar: JornadaEstandar;
}) {
  const isEdit = Boolean(initial?.id);
  const action = isEdit ? actualizarOperario.bind(null, initial!.id!) : crearOperario;
  const { formAction, state } = useActionForm(action, isEdit ? 'Operario actualizado' : 'Operario creado');

  const [activo, setActivo] = useState<boolean>(initial?.activo ?? true);
  const [dni, setDni] = useState(initial?.dni ?? '');
  const [nombres, setNombres] = useState(initial?.nombres ?? '');
  const [apPat, setApPat] = useState(initial?.apellido_paterno ?? '');
  const [apMat, setApMat] = useState(initial?.apellido_materno ?? '');
  const [tipoContrato, setTipoContrato] = useState(initial?.tipo_contrato ?? 'PLANILLA');
  const [jornadaPersonalizada, setJornadaPersonalizada] = useState<boolean>(initial?.jornada_personalizada ?? false);
  const [jornadaDias, setJornadaDias] = useState<string[]>(initial?.jornada_dias ?? jornadaEstandar.dias);

  function applyLookup(d: { numero?: string; nombres?: string; apellidoPaterno?: string; apellidoMaterno?: string }) {
    if (d.numero) setDni(d.numero);
    if (d.nombres) setNombres(d.nombres);
    if (d.apellidoPaterno) setApPat(d.apellidoPaterno);
    if (d.apellidoMaterno) setApMat(d.apellidoMaterno);
  }

  function toggleDia(v: string) {
    setJornadaDias((arr) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  const contratoSel = TIPOS_CONTRATO.find((c) => c.v === tipoContrato);
  const necesitaSueldo = tipoContrato === 'PLANILLA' || tipoContrato === 'MIXTO';
  const necesitaDestajo = tipoContrato === 'DESTAJO' || tipoContrato === 'MIXTO';

  return (
    <form action={formAction} className="space-y-6">
      <FormSection title="Identificación" description="Cargá el DNI y el sistema autocompleta nombres y apellidos.">
        <FormGrid cols={3}>
          <FormRow label="Código" hint={initial?.codigo ? 'Editable' : 'Dejá vacío para autogenerar (OP-NNN)'} error={state.fields?.codigo}>
            <Input name="codigo" defaultValue={initial?.codigo ?? ''} maxLength={20} placeholder={initial?.codigo ? 'OP-001' : 'Se autogenera'} />
          </FormRow>
          <div className="sm:col-span-2">
            <FormRow label="DNI" required={!isEdit} error={state.fields?.dni}>
              <SunatLookup tipo="dni" defaultValue={dni} onResult={applyLookup} name="dni" />
            </FormRow>
          </div>
        </FormGrid>
        <FormGrid cols={3}>
          <FormRow label="Nombres" required error={state.fields?.nombres}>
            <Input name="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
          </FormRow>
          <FormRow label="Apellido paterno">
            <Input name="apellido_paterno" value={apPat} onChange={(e) => setApPat(e.target.value)} />
          </FormRow>
          <FormRow label="Apellido materno">
            <Input name="apellido_materno" value={apMat} onChange={(e) => setApMat(e.target.value)} />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Categoría y área" description="Tipo de operario y área de planta donde trabaja.">
        <FormGrid cols={2}>
          <FormRow label="Tipo de operario" required>
            <select
              name="tipo_operario"
              defaultValue={initial?.tipo_operario ?? 'OPERARIO'}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              required
            >
              {TIPOS_OPERARIO.map((t) => (
                <option key={t.v} value={t.v}>{t.l}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Área de producción" hint="A qué área pertenece (corte, costura, acabado, etc.).">
            <select
              name="area_id"
              defaultValue={initial?.area_id ?? ''}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Sin área asignada —</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Modalidad de trabajo" description="Define si está en planilla y cómo se le paga.">
        <FormGrid cols={2}>
          <FormRow label="Tipo de contrato" hint={contratoSel?.hint}>
            <select
              name="tipo_contrato"
              value={tipoContrato}
              onChange={(e) => setTipoContrato(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {TIPOS_CONTRATO.map((t) => (
                <option key={t.v} value={t.v}>{t.l}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Fecha de ingreso">
            <Input name="fecha_ingreso" type="date" defaultValue={initial?.fecha_ingreso ?? ''} />
          </FormRow>
          {necesitaSueldo && (
            <FormRow label="Sueldo base (S/)">
              <Input name="sueldo_base" type="number" step="0.01" min="0" defaultValue={initial?.sueldo_base ?? ''} placeholder="1025.00" />
            </FormRow>
          )}
          {necesitaDestajo && (
            <FormRow label="Tarifa destajo (S/ por unidad)" hint="Pago por unidad producida. Puede sobreescribirse desde tarifas de servicios.">
              <Input name="tarifa_destajo" type="number" step="0.01" min="0" defaultValue={initial?.tarifa_destajo ?? ''} placeholder="2.50" />
            </FormRow>
          )}
        </FormGrid>
      </FormSection>

      <FormSection
        title="Jornada de trabajo"
        description={`Por defecto usa la jornada estándar (${jornadaEstandar.inicio} a ${jornadaEstandar.fin}, ${jornadaEstandar.dias.join('-')}). Activá el switch sólo si este operario tiene un horario distinto.`}
      >
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={jornadaPersonalizada} onCheckedChange={setJornadaPersonalizada} />
          <input type="hidden" name="jornada_personalizada" value={jornadaPersonalizada ? 'on' : 'off'} />
          <span>Jornada personalizada</span>
        </label>
        {jornadaPersonalizada && (
          <div className="mt-3 rounded-lg border bg-slate-50 p-3 space-y-3">
            <FormGrid cols={2}>
              <FormRow label="Hora de entrada" required>
                <Input name="jornada_inicio" type="time" defaultValue={initial?.jornada_inicio ?? jornadaEstandar.inicio} required={jornadaPersonalizada} />
              </FormRow>
              <FormRow label="Hora de salida" required>
                <Input name="jornada_fin" type="time" defaultValue={initial?.jornada_fin ?? jornadaEstandar.fin} required={jornadaPersonalizada} />
              </FormRow>
            </FormGrid>
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">Días laborables</p>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((d) => {
                  const on = jornadaDias.includes(d.v);
                  return (
                    <label key={d.v} className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold transition ${on ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-happy-300'}`}>
                      <input
                        type="checkbox"
                        name="jornada_dias"
                        value={d.v}
                        checked={on}
                        onChange={() => toggleDia(d.v)}
                        className="sr-only"
                      />
                      {d.l}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title="Contacto y notas">
        <FormGrid cols={2}>
          <FormRow label="Teléfono">
            <Input name="telefono" defaultValue={initial?.telefono ?? ''} />
          </FormRow>
          <FormRow label="Email">
            <Input name="email" type="email" defaultValue={initial?.email ?? ''} />
          </FormRow>
          <FormRow label="Notas internas" className="sm:col-span-2">
            <Textarea name="notas" defaultValue={initial?.notas ?? ''} rows={2} />
          </FormRow>
        </FormGrid>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={activo} onCheckedChange={setActivo} />
          <input type="hidden" name="activo" value={activo ? 'on' : 'off'} />
          <span>Operario activo</span>
        </label>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/operarios"><Button variant="outline" type="button">Cancelar</Button></Link>
        <SubmitButton variant="premium" size="lg">{isEdit ? 'Guardar cambios' : 'Crear operario'}</SubmitButton>
      </div>
    </form>
  );
}
