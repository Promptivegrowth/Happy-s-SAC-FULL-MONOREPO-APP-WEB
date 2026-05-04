import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { SubmitButton } from '@/components/forms/submit-button';
import { crearCorte } from '@/server/actions/corte';
import { ComboboxBusqueda } from './form-client';

async function action(fd: FormData) { 'use server'; await crearCorte(null, fd); }

export const metadata = { title: 'Nueva orden de corte' };
export const dynamic = 'force-dynamic';

/** Si código es igual al nombre, mostrá solo el nombre. Sino mostrá ambos. */
function dedup(codigo: string | null, nombre: string | null): { label: string; sublabel?: string } {
  const c = (codigo ?? '').trim();
  const n = (nombre ?? '').trim();
  if (!c || c.toUpperCase() === n.toUpperCase()) return { label: n || c };
  return { label: n, sublabel: c };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ot?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const [{ data: ots }, { data: prods }, { data: ops }] = await Promise.all([
    sb.from('ot').select('id, numero').not('estado', 'in', '("COMPLETADA","CANCELADA")').order('numero', { ascending: false }).limit(100),
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(2000),
    sb.from('operarios').select('id, codigo, nombres, apellido_paterno').eq('activo', true).order('nombres'),
  ]);

  const otOptions = (ots ?? []).map((o) => ({ id: o.id as string, label: o.numero as string }));
  const prodOptions = (prods ?? []).map((p) => ({
    id: p.id as string,
    ...dedup(p.codigo as string | null, p.nombre as string | null),
  }));
  const opOptions = (ops ?? []).map((o) => ({
    id: o.id as string,
    label: `${o.nombres ?? ''} ${o.apellido_paterno ?? ''}`.trim() || (o.codigo as string),
    sublabel: o.codigo as string,
  }));

  return (
    <PageShell title="Nueva orden de corte" description="Una orden por modelo. Después agregas las líneas por talla.">
      <Card className="max-w-3xl p-6">
        <form action={action} className="space-y-6">
          <FormGrid cols={2}>
            <FormRow label="OT" required>
              <ComboboxBusqueda
                name="ot_id"
                options={otOptions}
                defaultId={sp.ot ?? ''}
                placeholder="Buscar OT por número…"
                required
              />
            </FormRow>
            <FormRow label="Producto / modelo" required>
              <ComboboxBusqueda
                name="producto_id"
                options={prodOptions}
                placeholder="Buscar por nombre o código del modelo…"
                required
              />
            </FormRow>
            <FormRow label="Responsable (operario)">
              <ComboboxBusqueda
                name="responsable_operario_id"
                options={opOptions}
                placeholder="Buscar operario…"
              />
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
