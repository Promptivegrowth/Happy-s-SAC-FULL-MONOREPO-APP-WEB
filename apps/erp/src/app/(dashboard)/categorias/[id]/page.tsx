import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { CategoriaForm } from '@/components/forms/categoria-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarCategoria } from '@/server/actions/categorias';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb.from('categorias').select('*').eq('id', id).single();
  if (!data) notFound();

  async function onDelete() {
    'use server';
    return eliminarCategoria(id);
  }

  return (
    <PageShell
      title={`Editar: ${data.nombre}`}
      description={`Código ${data.codigo} · slug /${data.slug ?? ''}`}
      actions={<DeleteButton action={onDelete} itemName="esta categoría" />}
    >
      <CategoriaForm initial={data} />
    </PageShell>
  );
}
