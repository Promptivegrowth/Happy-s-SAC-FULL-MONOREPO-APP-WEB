import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { MaterialForm } from '@/components/forms/material-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarMaterial } from '@/server/actions/materiales';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data }, { data: unidades }, { data: proveedores }] = await Promise.all([
    sb.from('materiales').select('*').eq('id', id).single(),
    sb.from('unidades_medida').select('id, codigo, nombre').order('codigo'),
    sb.from('proveedores').select('id, razon_social').eq('activo', true).order('razon_social'),
  ]);
  if (!data) notFound();

  async function onDelete() { 'use server'; return eliminarMaterial(id); }

  return (
    <PageShell
      title={`Editar: ${data.nombre}`}
      description={`Código ${data.codigo} · ${data.categoria}`}
      actions={<DeleteButton action={onDelete} itemName="este material" />}
    >
      <MaterialForm initial={data} unidades={unidades ?? []} proveedores={proveedores ?? []} />
    </PageShell>
  );
}
