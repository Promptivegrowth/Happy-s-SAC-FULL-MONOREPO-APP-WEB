import { PageShell } from '@/components/page-shell';
import { ClienteForm } from '@/components/forms/cliente-form';

export const metadata = { title: 'Nuevo cliente' };

export default function Page() {
  return (
    <PageShell title="Nuevo cliente" description="Autocompleta los datos con SUNAT (RUC) o RENIEC (DNI).">
      <ClienteForm />
    </PageShell>
  );
}
