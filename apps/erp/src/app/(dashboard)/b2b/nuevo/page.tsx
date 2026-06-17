import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { ArrowLeft, Users } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { listarClientesB2B } from '@/server/actions/b2b';
import { NuevoPedidoB2BForm } from './form-client';

export const metadata = { title: 'Nuevo pedido B2B' };
export const dynamic = 'force-dynamic';

export default async function NuevoPedidoB2BPage() {
  const resCli = await listarClientesB2B();
  const clientes = resCli.ok ? (resCli.data ?? []) : [];

  return (
    <PageShell
      title="Nuevo pedido B2B"
      description="Crea la cabecera del pedido en BORRADOR. Las líneas se agregan en el detalle."
      actions={
        <Link href="/b2b">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      {clientes.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No hay clientes activos"
          description="Necesitas al menos un cliente activo para crear un pedido B2B."
          action={
            <Link href="/clientes">
              <Button variant="outline" size="sm">
                Ir a Clientes
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="p-6">
          <NuevoPedidoB2BForm clientes={clientes} />
        </Card>
      )}
    </PageShell>
  );
}
