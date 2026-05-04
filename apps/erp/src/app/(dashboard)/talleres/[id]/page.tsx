import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { Wallet } from 'lucide-react';
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
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/talleres/${id}/pagos`}>
            <Button variant="outline" className="gap-2">
              <Wallet className="h-4 w-4" /> Ver pagos
            </Button>
          </Link>
          <DeleteButton action={onDelete} label="Desactivar" itemName="este taller" redirectTo="/talleres" />
        </div>
      }
    >
      <TallerForm initial={data} />
    </PageShell>
  );
}
