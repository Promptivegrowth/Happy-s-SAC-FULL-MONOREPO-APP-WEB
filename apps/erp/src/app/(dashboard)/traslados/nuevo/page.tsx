import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { listarAlmacenes } from '@/server/actions/kardex';
import {
  listarVariantesParaTraslado,
  listarMaterialesParaTraslado,
} from '@/server/actions/traslados';
import { NuevoTrasladoForm } from './form-client';

export const metadata = { title: 'Nuevo traslado' };
export const dynamic = 'force-dynamic';

export default async function NuevoTrasladoPage() {
  const [resAlms, resVars, resMats] = await Promise.all([
    listarAlmacenes(),
    listarVariantesParaTraslado(),
    listarMaterialesParaTraslado(),
  ]);
  const almacenes = resAlms.ok ? (resAlms.data ?? []) : [];
  const variantes = resVars.ok ? (resVars.data ?? []) : [];
  const materiales = resMats.ok ? (resMats.data ?? []) : [];

  return (
    <PageShell
      title="Nuevo traslado entre almacenes"
      description="Crea un traslado en BORRADOR. El stock recién se mueve al despachar."
      actions={
        <Link href="/traslados">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      {almacenes.length < 2 ? (
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">
            Necesitas al menos 2 almacenes activos para crear un traslado.
          </p>
        </Card>
      ) : (
        <NuevoTrasladoForm
          almacenes={almacenes}
          variantes={variantes}
          materiales={materiales}
        />
      )}
    </PageShell>
  );
}
