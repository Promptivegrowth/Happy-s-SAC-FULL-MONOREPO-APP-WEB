import { PageShell } from '@/components/page-shell';
import { ProveedorForm } from '@/components/forms/proveedor-form';

export const metadata = { title: 'Nuevo proveedor' };

export default function Page() {
  return (
    <PageShell title="Nuevo proveedor" description="Autocompleta los datos con SUNAT.">
      <ProveedorForm />
    </PageShell>
  );
}
