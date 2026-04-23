import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { ProveedorForm } from '@/components/forms/proveedor-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarProveedor } from '@/server/actions/proveedores';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data } = await sb.from('proveedores').select('*').eq('id', id).single();
  if (!data) notFound();

  async function onDelete() { 'use server'; return eliminarProveedor(id); }

  return (
    <PageShell
      title={`Editar: ${data.razon_social}`}
      description={`${data.tipo_documento} ${data.numero_documento}`}
      actions={<DeleteButton action={onDelete} label="Desactivar" itemName="este proveedor" />}
    >
      <ProveedorForm initial={data} />
    </PageShell>
  );
}
