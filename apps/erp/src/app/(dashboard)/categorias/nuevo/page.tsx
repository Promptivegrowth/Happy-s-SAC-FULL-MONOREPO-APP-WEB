import { PageShell } from '@/components/page-shell';
import { CategoriaForm } from '@/components/forms/categoria-form';

export const metadata = { title: 'Nueva categoría' };

export default function Page() {
  return (
    <PageShell title="Nueva categoría" description="Las categorías se muestran en la web y agrupan productos.">
      <CategoriaForm />
    </PageShell>
  );
}
