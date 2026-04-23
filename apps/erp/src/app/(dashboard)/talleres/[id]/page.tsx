import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { TallerForm } from '@/components/forms/taller-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarTaller } from '@/server/actions/talleres';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb.from('talleres').select('*').eq('id', id).single();
  if (!data) notFound();

  async function onDelete() { 'use server'; return eliminarTaller(id); }

  return (
    <PageShell
      title={`Editar: ${data.nombre}`}
      description={`Código ${data.codigo}`}
      actions={<DeleteButton action={onDelete} label="Desactivar" itemName="este taller" />}
    >
      <TallerForm initial={data} />
    </PageShell>
  );
}
