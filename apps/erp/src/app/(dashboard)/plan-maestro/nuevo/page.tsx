import { PageShell } from '@/components/page-shell';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { SubmitButton } from '@/components/forms/submit-button';
import { crearPlan } from '@/server/actions/plan-maestro';

async function action(fd: FormData) { 'use server'; await crearPlan(null, fd); }

export const metadata = { title: 'Nuevo plan maestro' };

export default function Page() {
  // Calcular default: próximo miércoles y miércoles siguiente (ciclo semanal HAPPY SAC).
  // Si hoy es miércoles, arranca el siguiente miércoles (no hoy mismo).
  const hoy = new Date();
  const diasHastaProximoMiercoles = ((3 + 7 - hoy.getDay()) % 7) || 7;
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() + diasHastaProximoMiercoles);
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const semanaDelMes = Math.ceil(inicio.getDate() / 7);
  const mesNombre = inicio.toLocaleDateString('es-PE', { month: 'long' });

  return (
    <PageShell
      title="Nuevo plan maestro"
      description="Define el rango de la semana de producción (default: miércoles a miércoles)."
    >
      <Card className="max-w-2xl p-6">
        <form action={action} className="space-y-6">
          <div className="rounded-md border border-corp-200 bg-corp-50/40 px-4 py-2.5 text-sm">
            <p className="font-medium text-corp-900">
              Semana {semanaDelMes} de {mesNombre.charAt(0).toUpperCase() + mesNombre.slice(1)}
            </p>
            <p className="text-xs text-slate-500">
              Editá las fechas si necesitas otro rango. El default es miércoles a miércoles.
            </p>
          </div>

          <FormGrid cols={2}>
            <FormRow label="Fecha inicio" required hint="Default: próximo miércoles">
              <Input name="fecha_inicio" type="date" defaultValue={fmt(inicio)} required />
            </FormRow>
            <FormRow label="Fecha fin" required hint="Default: 1 semana después">
              <Input name="fecha_fin" type="date" defaultValue={fmt(fin)} required />
            </FormRow>
          </FormGrid>
          <FormRow label="Notas">
            <Textarea name="notas" rows={3} placeholder="Comentarios sobre el plan, prioridades, campañas..." />
          </FormRow>
          <div className="flex justify-end">
            <SubmitButton variant="premium" size="lg">Crear plan</SubmitButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
