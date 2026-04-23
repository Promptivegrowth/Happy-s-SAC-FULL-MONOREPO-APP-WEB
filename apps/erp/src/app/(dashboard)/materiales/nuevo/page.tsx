import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { MaterialForm } from '@/components/forms/material-form';

export const metadata = { title: 'Nuevo material' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = await createClient();
  const [{ data: unidades }, { data: proveedores }] = await Promise.all([
    sb.from('unidades_medida').select('id, codigo, nombre').order('codigo'),
    sb.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
  ]);
  return (
    <PageShell title="Nuevo material" description="Telas, avíos, insumos o empaques. Aparecen en las recetas (BOM).">
      <MaterialForm unidades={unidades ?? []} proveedores={proveedores ?? []} />
    </PageShell>
  );
}
