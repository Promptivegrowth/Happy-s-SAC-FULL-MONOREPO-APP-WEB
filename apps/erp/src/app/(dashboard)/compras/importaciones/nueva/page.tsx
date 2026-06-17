import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { ArrowLeft, Ship } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { listarProveedoresParaImportacion } from '@/server/actions/importaciones';
import { NuevaImportacionForm } from './form-client';

export const metadata = { title: 'Nueva importación' };
export const dynamic = 'force-dynamic';

export default async function NuevaImportacionPage() {
  const resProvs = await listarProveedoresParaImportacion();
  const proveedores = resProvs.ok ? (resProvs.data ?? []) : [];

  return (
    <PageShell
      title="Nueva importación internacional"
      description="Crea la cabecera del embarque. Luego vincula las OCs y carga los costos aduaneros."
      actions={
        <Link href="/compras/importaciones">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      {proveedores.length === 0 ? (
        <EmptyState
          icon={<Ship className="h-6 w-6" />}
          title="No hay proveedores registrados"
          description="Registra al menos un proveedor activo antes de crear una importación."
          action={
            <Link href="/proveedores">
              <Button variant="outline" size="sm">
                Ir a Proveedores
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="p-6">
          <NuevaImportacionForm proveedores={proveedores} />
        </Card>
      )}
    </PageShell>
  );
}
