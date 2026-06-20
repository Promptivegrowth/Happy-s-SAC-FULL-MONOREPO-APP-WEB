import { PageShell } from '@/components/page-shell';
import {
  listarProveedoresParaOC,
  listarAlmacenesParaOC,
  listarUnidades,
} from '@/server/actions/oc';
import { NuevaOCForm } from './nueva-form';

export const metadata = { title: 'Nueva OC' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [proveedores, almacenes, unidades] = await Promise.all([
    listarProveedoresParaOC(),
    listarAlmacenesParaOC(),
    listarUnidades(),
  ]);
  return (
    <PageShell
      title="Nueva orden de compra"
      description="Registre una compra a proveedor (nacional, importación o servicio a taller)."
    >
      <NuevaOCForm proveedores={proveedores} almacenes={almacenes} unidades={unidades} />
    </PageShell>
  );
}
