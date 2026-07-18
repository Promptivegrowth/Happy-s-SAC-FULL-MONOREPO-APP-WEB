import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { ProductoForm } from '@/components/forms/producto-form';

export const metadata = { title: 'Nuevo producto' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const [{ data: cats }, { data: camps }, { data: fams }] = await Promise.all([
    sb.from('categorias').select('id, nombre, codigo').eq('activo', true).order('nombre'),
    sb.from('campanas').select('id, nombre, codigo').eq('activa', true).order('nombre'),
    sbAny.from('productos_familias').select('id, nombre').eq('activo', true).order('nombre'),
  ]);
  return (
    <PageShell title="Nuevo producto" description="Crea el modelo base. Las variantes (tallas) y la publicación web se configuran después.">
      <ProductoForm
        categorias={cats ?? []}
        campanas={camps ?? []}
        familias={(fams ?? []) as { id: string; nombre: string }[]}
      />
    </PageShell>
  );
}
