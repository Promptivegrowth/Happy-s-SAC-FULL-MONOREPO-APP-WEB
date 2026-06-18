import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { obtenerPedidoWeb, listarAlmacenesParaPedido } from '@/server/actions/pedidos-web';
import { DetalleClient } from './detalle-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await obtenerPedidoWeb(id);
  return { title: d ? `Pedido ${d.pedido.numero}` : 'Pedido' };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await obtenerPedidoWeb(id);
  if (!data) notFound();

  const almacenes = await listarAlmacenesParaPedido();

  return (
    <PageShell
      title={data.pedido.numero}
      description={`Pedido web recibido el ${new Date(data.pedido.fecha).toLocaleString('es-PE')}`}
      actions={
        <Link href="/pedidos-web" className="text-sm text-slate-500 hover:text-corp-900">
          ← Volver al listado
        </Link>
      }
    >
      <DetalleClient data={data} almacenes={almacenes} />
    </PageShell>
  );
}
