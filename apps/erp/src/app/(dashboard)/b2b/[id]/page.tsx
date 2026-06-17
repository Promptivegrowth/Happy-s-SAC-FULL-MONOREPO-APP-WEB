import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { obtenerPedidoB2B, listarVariantesParaB2B } from '@/server/actions/b2b';
import { listarAlmacenes } from '@/server/actions/kardex';
import { EstadoB2BBadge } from '../page';
import { DetallePedidoB2BClient } from './detalle-client';

export const metadata = { title: 'Detalle de pedido B2B' };
export const dynamic = 'force-dynamic';

export default async function PedidoB2BDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await obtenerPedidoB2B(id);
  if (!res.ok || !res.data) {
    if (res.error?.toLowerCase().includes('no encontrado')) notFound();
    return (
      <PageShell title="Pedido B2B" description="Error al cargar el pedido.">
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">{res.error ?? 'No se pudo cargar'}</p>
        </Card>
      </PageShell>
    );
  }

  const { pedido, lineas, despachos } = res.data;

  // Cargar variantes y almacenes en paralelo (necesarios para el cliente).
  // Si el pedido está en BORRADOR usaremos variantes para agregar líneas; si
  // pasó de BORRADOR aún cargamos almacenes para registrar despachos.
  const lista = pedido.lista_precio ?? 'PUBLICO';
  const [resVars, resAlms] = await Promise.all([
    listarVariantesParaB2B(lista),
    listarAlmacenes(),
  ]);
  const variantes = resVars.ok ? (resVars.data ?? []) : [];
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];

  return (
    <PageShell
      title={`Pedido ${pedido.numero}`}
      description={
        <span className="flex items-center gap-2">
          <EstadoB2BBadge estado={pedido.estado} />
          <span className="text-slate-400">·</span>
          <span className="text-xs text-slate-600">{pedido.cliente_razon_social}</span>
          {pedido.lista_precio && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-xs font-medium text-slate-600">{pedido.lista_precio}</span>
            </>
          )}
        </span>
      }
      actions={
        <Link href="/b2b">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      <DetallePedidoB2BClient
        pedido={pedido}
        lineas={lineas}
        despachos={despachos}
        variantes={variantes}
        almacenes={almacenes}
      />
    </PageShell>
  );
}
