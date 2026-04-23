import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { ClienteForm } from '@/components/forms/cliente-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarCliente } from '@/server/actions/clientes';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb.from('clientes').select('*').eq('id', id).single();
  if (!data) notFound();

  const titulo = data.razon_social ?? `${data.nombres ?? ''} ${data.apellido_paterno ?? ''}`.trim();

  async function onDelete() { 'use server'; return eliminarCliente(id); }

  return (
    <PageShell
      title={`Editar: ${titulo}`}
      description={`${data.tipo_documento} ${data.numero_documento} · ${data.tipo_cliente}`}
      actions={<DeleteButton action={onDelete} label="Desactivar" itemName="este cliente" />}
    >
      <ClienteForm initial={data} />
    </PageShell>
  );
}
