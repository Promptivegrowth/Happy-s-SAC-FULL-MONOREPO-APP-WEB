import { PageShell } from '@/components/page-shell';
import { TallerForm } from '@/components/forms/taller-form';

export const metadata = { title: 'Nuevo taller' };

export default function Page() {
  return (
    <PageShell title="Nuevo taller" description="Talleres externos de costura, bordado, estampado, acabados...">
      <TallerForm />
    </PageShell>
  );
}
