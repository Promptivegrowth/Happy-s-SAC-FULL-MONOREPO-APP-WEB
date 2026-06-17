import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { ArrowLeft, Ship, Globe } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import {
  obtenerImportacion,
  listarOCsDisponiblesParaImportacion,
} from '@/server/actions/importaciones';
import { siguientesEstados } from '@/server/actions/importaciones-helpers';
import { EstadoBadge } from '../estado-badge';
import { ImportacionDetalleClient } from './detalle-client';

export const metadata = { title: 'Detalle de importación' };
export const dynamic = 'force-dynamic';

export default async function ImportacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [res, resOCs] = await Promise.all([
    obtenerImportacion(id),
    listarOCsDisponiblesParaImportacion(),
  ]);
  if (!res.ok || !res.data) {
    if (res.error?.toLowerCase().includes('no encontrada')) notFound();
    return (
      <PageShell title="Importación" description="Error al cargar la importación.">
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">{res.error ?? 'No se pudo cargar'}</p>
        </Card>
      </PageShell>
    );
  }

  const { importacion, ocs_vinculadas } = res.data;
  const ocsDisponibles = resOCs.ok ? (resOCs.data ?? []) : [];
  const transiciones = siguientesEstados(importacion.estado);
  const editable = importacion.estado !== 'RECIBIDA' && importacion.estado !== 'CANCELADA';

  return (
    <PageShell
      title={`Importación ${importacion.numero}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Ship className="h-3 w-3" />
            {importacion.proveedor_razon_social}
          </Badge>
          {importacion.pais_origen && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Globe className="h-3 w-3" />
              {importacion.pais_origen}
            </Badge>
          )}
          <EstadoBadge estado={importacion.estado} />
        </span>
      }
      actions={
        <Link href="/compras/importaciones">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      <ImportacionDetalleClient
        importacion={importacion}
        ocsVinculadas={ocs_vinculadas}
        ocsDisponibles={ocsDisponibles}
        transiciones={transiciones}
        editable={editable}
      />
    </PageShell>
  );
}
