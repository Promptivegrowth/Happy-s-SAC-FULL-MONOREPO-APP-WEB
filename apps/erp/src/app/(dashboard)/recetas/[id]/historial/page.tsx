import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { historialVersionesReceta } from '@/server/actions/recetas';
import { HistorialClient } from './historial-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historial de versiones' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: receta } = await sb
    .from('recetas')
    .select('id, producto_id, productos(id, nombre, codigo)')
    .eq('id', id)
    .single();
  if (!receta) notFound();

  const prod = (receta as unknown as { productos: { id: string; nombre: string; codigo: string } }).productos;
  const historial = await historialVersionesReceta(prod.id);

  return (
    <PageShell
      title={`Historial de versiones: ${prod.nombre}`}
      description={`Versiones anteriores de materiales y procesos · ${prod.codigo}`}
      actions={
        <Link href={`/recetas/${id}`}>
          <Button variant="outline" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Volver a la receta
          </Button>
        </Link>
      }
    >
      <HistorialClient historial={historial} recetaActualId={id} />
    </PageShell>
  );
}
