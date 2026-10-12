import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
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

  /*
   * ¿El cliente hizo otro pedido DESPUÉS de este? Entonces este, si sigue sin
   * pagar, fue un intento de compra que reemplazó (pedido de Javier, 12/10/2026).
   */
  let posterior: { id: string; numero: string; estado: string } | null = null;
  if (data.pedido.estado === 'PENDIENTE_PAGO' || data.pedido.estado === 'WHATSAPP_DERIVADO') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = (await createClient()) as unknown as { from: (t: string) => any };
    const { data: yo } = await sb.from('pedidos_web').select('cliente_id, fecha').eq('id', id).maybeSingle();
    if (yo?.cliente_id) {
      const { data: otros } = await sb.from('pedidos_web').select('id, numero, estado')
        .eq('cliente_id', yo.cliente_id).gt('fecha', yo.fecha).neq('estado', 'CANCELADO')
        .order('fecha', { ascending: false }).limit(1);
      posterior = ((otros ?? []) as { id: string; numero: string; estado: string }[])[0] ?? null;
    }
  }

  return (
    <PageShell
      title={data.pedido.numero}
      description={`Pedido web recibido el ${new Date(data.pedido.fecha).toLocaleString('es-PE', { timeZone: 'America/Lima' })}`}
      actions={
        <Link href="/pedidos-web" className="text-sm text-slate-500 hover:text-corp-900">
          ← Volver al listado
        </Link>
      }
    >
      {posterior && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Este pedido parece un intento anterior: el mismo cliente hizo después el pedido{' '}
            <Link href={`/pedidos-web/${posterior.id}`} className="font-mono underline">{posterior.numero}</Link>.
          </p>
          <p className="mt-1 text-xs">
            Antes de despachar, confirma cuál pagó. Si este no se pagó, cancélalo para que no quede pendiente.
          </p>
        </div>
      )}
      <DetalleClient data={data} almacenes={almacenes} />
    </PageShell>
  );
}
