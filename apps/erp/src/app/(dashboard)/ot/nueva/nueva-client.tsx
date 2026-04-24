'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useActionForm } from '@/components/forms/use-action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { crearOT } from '@/server/actions/ot';

type Campana = { id: string; nombre: string };

export function NuevaOTForm({ campanas, fechaEntregaDefault }: { campanas: Campana[]; fechaEntregaDefault: string }) {
  const { formAction, state } = useActionForm(crearOT, 'OT creada');
  const [campanaId, setCampanaId] = useState<string>('');

  return (
    <form action={formAction} className="space-y-6">
      <FormGrid cols={2}>
        <FormRow label="Fecha de entrega objetivo" error={state.fields?.fecha_entrega_objetivo}>
          <Input name="fecha_entrega_objetivo" type="date" defaultValue={fechaEntregaDefault} />
        </FormRow>
        <FormRow label="Prioridad" hint="Menor = más urgente" error={state.fields?.prioridad}>
          <Input name="prioridad" type="number" min={0} max={1000} defaultValue={100} />
        </FormRow>
      </FormGrid>

      <FormRow label="Campaña" hint="Opcional. Asocia la OT a una campaña activa.">
        <select
          name="campana_id"
          value={campanaId}
          onChange={(e) => setCampanaId(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Sin campaña</option>
          {campanas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </FormRow>

      <FormRow label="Observación" error={state.fields?.observacion}>
        <Textarea
          name="observacion"
          rows={3}
          placeholder="Notas iniciales: prioridades, contexto, instrucciones especiales…"
        />
      </FormRow>

      {state.error && !state.fields && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link href="/ot">
          <Button variant="outline" type="button">
            Cancelar
          </Button>
        </Link>
        <SubmitButton variant="premium" size="lg">
          Crear OT
        </SubmitButton>
      </div>
    </form>
  );
}
