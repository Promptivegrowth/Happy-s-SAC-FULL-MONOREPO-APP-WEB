import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { PageShell } from '@/components/page-shell';
import { NuevaOTForm } from './nueva-client';

export const metadata = { title: 'Nueva OT' };
export const dynamic = 'force-dynamic';

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
      description="Crea una OT en BORRADOR. Después podrás agregar líneas (productos × tallas × cantidades) desde la página de detalle."
    >
      <Card className="max-w-2xl p-6">
        <NuevaOTForm campanas={campanas ?? []} fechaEntregaDefault={fmt(entrega)} />
      </Card>
    </PageShell>
  );
}
