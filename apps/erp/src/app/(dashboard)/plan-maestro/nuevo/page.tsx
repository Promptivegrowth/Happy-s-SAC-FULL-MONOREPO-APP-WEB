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
  // Calcular default: lunes próximo y domingo siguiente
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() + ((1 + 7 - hoy.getDay()) % 7 || 7));
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <PageShell title="Nuevo plan maestro" description="Define el rango de la semana de producción.">
      <Card className="max-w-2xl p-6">
        <form action={action} className="space-y-6">
          <FormGrid cols={2}>
            <FormRow label="Fecha inicio" required>
              <Input name="fecha_inicio" type="date" defaultValue={fmt(lunes)} required />
            </FormRow>
            <FormRow label="Fecha fin" required>
              <Input name="fecha_fin" type="date" defaultValue={fmt(domingo)} required />
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
