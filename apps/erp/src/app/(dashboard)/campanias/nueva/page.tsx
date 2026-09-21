import { PageShell } from '@/components/page-shell';
import { CampanaForm } from '@/components/forms/campana-form';

export const metadata = { title: 'Nueva campaña' };
export const dynamic = 'force-dynamic';

export default function NuevaCampanaPage() {
  return (
    <PageShell
      title="Nueva campaña"
      description="Una temporada o promoción de la tienda web. Después le asignás los disfraces."
    >
      <CampanaForm />
    </PageShell>
  );
}
