import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { PageShell } from '@/components/page-shell';
import { OperarioForm } from '@/components/forms/operario-form';
import { DeleteButton } from '@/components/forms/delete-button';
import { eliminarOperario } from '@/server/actions/operarios';
import { getJornadaEstandar } from '../_jornada';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const [{ data }, { data: areas }, jornada] = await Promise.all([
    sb.from('operarios').select('*').eq('id', id).single(),
    sb.from('areas_produccion').select('id, nombre').eq('activa', true).order('nombre'),
    getJornadaEstandar(),
  ]);
  if (!data) notFound();

  async function onDelete() { 'use server'; return eliminarOperario(id); }

  const nombre = [data.nombres, data.apellido_paterno, data.apellido_materno].filter(Boolean).join(' ');

  return (
    <PageShell
      title={`Editar: ${nombre}`}
      description={`Código ${data.codigo}`}
      actions={<DeleteButton action={onDelete} label="Desactivar" itemName="este operario" redirectTo="/operarios" />}
    >
      <OperarioForm
        initial={data}
        areas={(areas ?? []).map((a) => ({ id: a.id as string, nombre: a.nombre as string }))}
        jornadaEstandar={jornada}
      />
    </PageShell>
  );
}
