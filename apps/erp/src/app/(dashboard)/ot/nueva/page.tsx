import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@happy/ui/select';
import { PageShell } from '@/components/page-shell';
import { SubmitButton } from '@/components/forms/submit-button';
import { crearOT } from '@/server/actions/ot';

export const metadata = { title: 'Nueva OT' };
export const dynamic = 'force-dynamic';

async function action(fd: FormData) {
  'use server';
  await crearOT(null, fd);
}

export default async function Page() {
  const sb = await createClient();
  const { data: campanas } = await sb
    .from('campanas')
    .select('id, nombre')
    .eq('activa', true)
    .order('nombre');

  const hoy = new Date();
  const entrega = new Date(hoy);
  entrega.setDate(hoy.getDate() + 14);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <PageShell
      title="Nueva Orden de Trabajo"
      description="Crea una OT en BORRADOR. Después podrás agregar líneas (productos × tallas × cantidades)."
    >
      <Card className="max-w-2xl p-6">
        <form action={action} className="space-y-6">
          <FormGrid cols={2}>
            <FormRow label="Fecha de entrega objetivo">
              <Input name="fecha_entrega_objetivo" type="date" defaultValue={fmt(entrega)} />
            </FormRow>
            <FormRow label="Prioridad" hint="Menor = más urgente">
              <Input name="prioridad" type="number" min={0} max={1000} defaultValue={100} />
            </FormRow>
          </FormGrid>

          <FormRow label="Campaña" hint="Opcional. Asocia la OT a una campaña activa.">
            <Select name="campana_id">
              <SelectTrigger>
                <SelectValue placeholder="Sin campaña" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Sin campaña</SelectItem>
                {(campanas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>

          <FormRow label="Observación">
            <Textarea
              name="observacion"
              rows={3}
              placeholder="Notas iniciales: prioridades, contexto, instrucciones especiales…"
            />
          </FormRow>

          <div className="flex justify-end">
            <SubmitButton variant="premium" size="lg">
              Crear OT
            </SubmitButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
