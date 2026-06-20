import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { obtenerOC } from '@/server/actions/oc';
import { listarPagosOC } from '@/server/actions/pagos-proveedores';
import { DetalleClient } from './detalle-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const oc = await obtenerOC(id);
  return { title: oc ? `OC ${oc.numero}` : 'OC' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const oc = await obtenerOC(id);
  if (!oc) notFound();
  const pagos = await listarPagosOC(id);

  return (
    <PageShell
      title={oc.numero}
      description={`${oc.proveedor_razon_social} · ${new Date(oc.fecha).toLocaleDateString('es-PE')}`}
      actions={
        <Link href="/oc" className="text-sm text-slate-500 hover:text-corp-900">
          ← Volver al listado
        </Link>
      }
    >
      <DetalleClient oc={oc} pagos={pagos} />
    </PageShell>
  );
}
