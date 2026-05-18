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

type HorarioDia = { dia: string; inicio: string; fin: string };

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
  jornada_horarios?: HorarioDia[] | null;
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

  // Cada día puede tener su propio horario. El estado se mantiene como un Map
  // dia->{inicio,fin} por día, así al apagar/prender un día no se pierde el
  // horario que el usuario haya configurado previamente.
  const inicialHorarios = (): Record<string, { inicio: string; fin: string }> => {
    const map: Record<string, { inicio: string; fin: string }> = {};
    // Pre-carga la jornada estándar para todos los días (fallback cuando se
    // marca un día sin tocar las horas).
    for (const d of DIAS) {
      map[d.v] = { inicio: jornadaEstandar.inicio, fin: jornadaEstandar.fin };
    }
    if (initial?.jornada_horarios?.length) {
      for (const h of initial.jornada_horarios) map[h.dia] = { inicio: h.inicio, fin: h.fin };
    } else if (initial?.jornada_inicio && initial?.jornada_fin && initial?.jornada_dias) {
      for (const d of initial.jornada_dias) {
        map[d] = { inicio: initial.jornada_inicio, fin: initial.jornada_fin };
      }
    }
    return map;
  };
  const [horariosPorDia, setHorariosPorDia] = useState<Record<string, { inicio: string; fin: string }>>(inicialHorarios);
  const [diasActivos, setDiasActivos] = useState<string[]>(
    initial?.jornada_horarios?.length
      ? initial.jornada_horarios.map((h) => h.dia)
      : (initial?.jornada_dias ?? jornadaEstandar.dias),
  );

  function applyLookup(d: { numero?: string; nombres?: string; apellidoPaterno?: string; apellidoMaterno?: string }) {
    if (d.numero) setDni(d.numero);
    if (d.nombres) setNombres(d.nombres);
    if (d.apellidoPaterno) setApPat(d.apellidoPaterno);
    if (d.apellidoMaterno) setApMat(d.apellidoMaterno);
  }

  function toggleDia(v: string) {
    setDiasActivos((arr) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]));
  }

  function setHoraDia(dia: string, campo: 'inicio' | 'fin', valor: string) {
    setHorariosPorDia((m) => ({ ...m, [dia]: { ...m[dia]!, [campo]: valor } }));
  }

  /** Atajo: copia el horario del primer día activo al resto de días activos. */
  function aplicarATodos() {
    if (diasActivos.length === 0) return;
    const ref = horariosPorDia[diasActivos[0]!];
    if (!ref) return;
    setHorariosPorDia((m) => {
      const next = { ...m };
      for (const d of diasActivos) next[d] = { ...ref };
      return next;
    });
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
        description={`Por defecto usa la jornada estándar (${jornadaEstandar.inicio} a ${jornadaEstandar.fin}, ${jornadaEstandar.dias.join('-')}). Activá el switch sólo si este operario tiene un horario distinto. Cada día puede tener su propio horario.`}
      >
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={jornadaPersonalizada} onCheckedChange={setJornadaPersonalizada} />
          <input type="hidden" name="jornada_personalizada" value={jornadaPersonalizada ? 'on' : 'off'} />
          <span>Jornada personalizada</span>
        </label>

        {jornadaPersonalizada && (
          <div className="mt-3 space-y-3 rounded-lg border bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-700">Días laborables</p>
                <p className="text-[11px] text-slate-500">Tocá para activar/desactivar. Cada día activo configura su propia entrada/salida abajo.</p>
              </div>
              {diasActivos.length > 1 && (
                <button
                  type="button"
                  onClick={aplicarATodos}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-happy-400 hover:text-happy-700"
                  title="Copia el horario del primer día activo al resto"
                >
                  Aplicar horario del 1° día a todos
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const on = diasActivos.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDia(d.v)}
                    className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition ${on ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-happy-300'}`}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>

            {/* Inputs ocultos: serializamos los horarios por día como JSON para
                que el server action los reciba en un solo campo. */}
            <input
              type="hidden"
              name="jornada_horarios"
              value={JSON.stringify(diasActivos.map((dia) => ({ dia, inicio: horariosPorDia[dia]?.inicio ?? '', fin: horariosPorDia[dia]?.fin ?? '' })))}
            />

            {diasActivos.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 bg-white p-3 text-center text-xs italic text-slate-400">
                Seleccioná al menos un día arriba para configurar su horario.
              </p>
            ) : (
              <div className="space-y-1.5">
                {DIAS.filter((d) => diasActivos.includes(d.v)).map((d) => {
                  const h = horariosPorDia[d.v] ?? { inicio: jornadaEstandar.inicio, fin: jornadaEstandar.fin };
                  return (
                    <div key={d.v} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                      <span className="text-xs font-semibold text-slate-700">
                        {d.l} <span className="ml-1 text-[10px] uppercase text-slate-400">{d.v}</span>
                      </span>
                      <label className="flex items-center gap-2 text-[11px] text-slate-500">
                        Entrada
                        <Input
                          type="time"
                          value={h.inicio}
                          onChange={(e) => setHoraDia(d.v, 'inicio', e.target.value)}
                          className="h-8 text-xs"
                          required
                        />
                      </label>
                      <label className="flex items-center gap-2 text-[11px] text-slate-500">
                        Salida
                        <Input
                          type="time"
                          value={h.fin}
                          onChange={(e) => setHoraDia(d.v, 'fin', e.target.value)}
                          className="h-8 text-xs"
                          required
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              Sin límite de duración: cada día puede tener jornada completa, media o parcial.
            </p>
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
