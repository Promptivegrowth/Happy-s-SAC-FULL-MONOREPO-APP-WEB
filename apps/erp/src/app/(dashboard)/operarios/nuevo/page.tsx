import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { OperarioForm } from '@/components/forms/operario-form';
import { getJornadaEstandar } from '../_jornada';

export const metadata = { title: 'Nuevo operario' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = await createClient();
  const [{ data: areas }, jornada] = await Promise.all([
    sb.from('areas_produccion').select('id, nombre').eq('activa', true).order('nombre'),
    getJornadaEstandar(),
  ]);

  return (
    <PageShell title="Nuevo operario" description="Cargá el DNI y se autocompleta con RENIEC.">
      <OperarioForm
        areas={(areas ?? []).map((a) => ({ id: a.id as string, nombre: a.nombre as string }))}
        jornadaEstandar={jornada}
      />
    </PageShell>
  );
}
