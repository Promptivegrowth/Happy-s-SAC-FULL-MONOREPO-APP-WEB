import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { SubmitButton } from '@/components/forms/submit-button';
import { crearCorte } from '@/server/actions/corte';

async function action(fd: FormData) { 'use server'; await crearCorte(null, fd); }

export const metadata = { title: 'Nueva orden de corte' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ ot?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [{ data: ots }, { data: prods }, { data: ops }] = await Promise.all([
    sb.from('ot').select('id, numero').not('estado', 'in', '("COMPLETADA","CANCELADA")').order('numero', { ascending: false }).limit(100),
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    sb.from('operarios').select('id, codigo, nombres, apellido_paterno').eq('activo', true).order('nombres'),
  ]);

  return (
    <PageShell title="Nueva orden de corte" description="Una orden por modelo. Después agregas las líneas por talla.">
      <Card className="max-w-3xl p-6">
        <form action={action} className="space-y-6">
          <FormGrid cols={2}>
            <FormRow label="OT" required>
              <select name="ot_id" defaultValue={sp.ot ?? ''} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Seleccionar OT —</option>
                {ots?.map((o) => <option key={o.id} value={o.id}>{o.numero}</option>)}
              </select>
            </FormRow>
            <FormRow label="Producto / modelo" required>
              <select name="producto_id" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— Seleccionar —</option>
                {prods?.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre}</option>)}
              </select>
            </FormRow>
            <FormRow label="Responsable (operario)">
              <select name="responsable_operario_id" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">—</option>
                {ops?.map((o) => <option key={o.id} value={o.id}>{o.nombres} {o.apellido_paterno ?? ''}</option>)}
              </select>
            </FormRow>
            <FormRow label="Capas tendidas">
              <Input name="capas_tendidas" type="number" min={0} defaultValue={0} />
            </FormRow>
            <FormRow label="Metros consumidos">
              <Input name="metros_consumidos" type="number" step="0.01" min={0} defaultValue={0} />
            </FormRow>
          </FormGrid>
          <FormRow label="Observación">
            <Textarea name="observacion" rows={2} />
          </FormRow>
          <div className="flex justify-end">
            <SubmitButton variant="premium" size="lg">Crear corte</SubmitButton>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
