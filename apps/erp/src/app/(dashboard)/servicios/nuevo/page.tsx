import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { SubmitButton } from '@/components/forms/submit-button';
import { crearOS } from '@/server/actions/corte';

async function action(fd: FormData) { 'use server'; await crearOS(null, fd); }

export const metadata = { title: 'Nueva orden de servicio' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = await createClient();
  const [{ data: ots }, { data: talleres }] = await Promise.all([
    sb.from('ot').select('id, numero').not('estado', 'in', '("COMPLETADA","CANCELADA")').order('numero', { ascending: false }).limit(100),
    sb.from('talleres').select('id, codigo, nombre').eq('activo', true).order('nombre'),
  ]);

  return (
    <PageShell title="Nueva Orden de Servicio" description="Envío de trabajo a taller externo.">
      <Card className="max-w-3xl p-6">
        <form action={action} className="space-y-6">
          <FormGrid cols={2}>
            <FormRow label="OT" required>
              <select name="ot_id" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Seleccionar OT —</option>
                {ots?.map((o) => <option key={o.id} value={o.id}>{o.numero}</option>)}
              </select>
            </FormRow>
            <FormRow label="Taller" required>
              <select name="taller_id" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Seleccionar —</option>
                {talleres?.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nombre}</option>)}
              </select>
            </FormRow>
            <FormRow label="Proceso" required>
              <select name="proceso" required defaultValue="COSTURA" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option>COSTURA</option><option>BORDADO</option><option>ESTAMPADO</option>
                <option>SUBLIMADO</option><option>PLISADO</option><option>DECORADO</option>
                <option>ACABADO</option><option>PLANCHADO</option><option>OJAL_BOTON</option>
              </select>
            </FormRow>
            <FormRow label="Fecha entrega esperada">
              <Input name="fecha_entrega_esperada" type="date" />
            </FormRow>
            <FormRow label="Monto base (S/)">
              <Input name="monto_base" type="number" step="0.01" min={0} defaultValue={0} />
            </FormRow>
            <FormRow label="Adicional movilidad (S/)">
              <Input name="adicional_movilidad" type="number" step="0.01" min={0} defaultValue={0} />
            </FormRow>
            <FormRow label="Adicional campaña (S/)">
              <Input name="adicional_campana" type="number" step="0.01" min={0} defaultValue={0} />
            </FormRow>
            <FormRow label="Es campaña">
              <select name="es_campana" defaultValue="off" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="off">No</option><option value="on">Sí</option>
              </select>
            </FormRow>
          </FormGrid>
          <FormRow label="Cuidados especiales" hint="Texto que verá el taller">
            <Textarea name="cuidados" rows={2} />
          </FormRow>
          <FormRow label="Consideraciones técnicas">
            <Textarea name="consideraciones" rows={2} />
          </FormRow>
          <FormRow label="Observaciones generales">
            <Textarea name="observaciones" rows={2} />
          </FormRow>
          <div className="flex justify-end">
            <SubmitButton variant="premium" size="lg">Crear OS</SubmitButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
