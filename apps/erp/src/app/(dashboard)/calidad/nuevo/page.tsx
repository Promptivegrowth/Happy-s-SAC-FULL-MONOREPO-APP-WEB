import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import {
  listarDefectos,
  listarOTsParaCalidad,
  listarOSsParaCalidad,
  listarProductosParaCalidad,
  listarTalleresParaCalidad,
  listarOperariosParaCalidad,
} from '@/server/actions/calidad';
import { NuevoControlForm } from './form-client';

export const metadata = { title: 'Registrar control de calidad' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [resDef, resOTs, resOSs, resProd, resTalleres, resOperarios] = await Promise.all([
    listarDefectos(),
    listarOTsParaCalidad(),
    listarOSsParaCalidad(),
    listarProductosParaCalidad(),
    listarTalleresParaCalidad(),
    listarOperariosParaCalidad(),
  ]);

  const defectos = resDef.ok ? (resDef.data ?? []) : [];
  const ots = resOTs.ok ? (resOTs.data ?? []) : [];
  const oss = resOSs.ok ? (resOSs.data ?? []) : [];
  const productos = resProd.ok ? (resProd.data ?? []) : [];
  const talleres = resTalleres.ok ? (resTalleres.data ?? []) : [];
  const operarios = resOperarios.ok ? (resOperarios.data ?? []) : [];

  return (
    <PageShell
      title="Registrar control de calidad"
      description="Inspecciona producto terminado. Los defectos detectados se descuentan automáticamente del total OK."
      actions={
        <Link href="/calidad">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      {defectos.length === 0 ? (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            No hay defectos activos en el catálogo. Puedes registrar controles sin fallas (cantidad
            OK = revisada) o{' '}
            <Link href="/calidad/defectos" className="font-semibold underline">
              crear defectos primero
            </Link>
            .
          </p>
        </Card>
      ) : null}

      <NuevoControlForm
        defectos={defectos}
        ots={ots}
        oss={oss}
        productos={productos}
        talleres={talleres}
        operarios={operarios}
      />
    </PageShell>
  );
}
