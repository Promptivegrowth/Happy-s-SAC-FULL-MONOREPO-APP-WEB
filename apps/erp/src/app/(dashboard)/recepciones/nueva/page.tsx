import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { ArrowLeft, PackageOpen } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { listarOCsParaRecepcionar } from '@/server/actions/recepciones';
import { listarAlmacenes } from '@/server/actions/kardex';
import { NuevaRecepcionForm } from './form-client';

export const metadata = { title: 'Nueva recepción' };
export const dynamic = 'force-dynamic';

export default async function NuevaRecepcionPage() {
  const [resOCs, resAlms] = await Promise.all([listarOCsParaRecepcionar(), listarAlmacenes()]);
  const ocs = resOCs.ok ? (resOCs.data ?? []) : [];
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];

  return (
    <PageShell
      title="Nueva recepción de mercadería"
      description="Selecciona una OC pendiente y registra lo que llegó físicamente al almacén."
      actions={
        <Link href="/recepciones">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      {ocs.length === 0 ? (
        <EmptyState
          icon={<PackageOpen className="h-6 w-6" />}
          title="No hay OCs pendientes de recepción"
          description="Solo se muestran OCs en estado APROBADA, ENVIADA o PARCIAL con líneas con cantidad pendiente > 0."
          action={
            <Link href="/oc">
              <Button variant="outline" size="sm">
                Ir a Órdenes de Compra
              </Button>
            </Link>
          }
        />
      ) : almacenes.length === 0 ? (
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">No hay almacenes activos. Configura uno antes de recepcionar.</p>
        </Card>
      ) : (
        <NuevaRecepcionForm ocs={ocs} almacenes={almacenes} />
      )}
    </PageShell>
  );
}
