import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { listarDefectos } from '@/server/actions/calidad';
import { requireRol } from '@/server/session';
import { DefectosClient } from './defectos-client';

export const metadata = { title: 'Catálogo de defectos' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  // Solo gerente o jefe_produccion (gerente pasa por el bypass en requireRol).
  await requireRol(['jefe_produccion']);

  const res = await listarDefectos(true);
  const defectos = res.ok ? (res.data ?? []) : [];

  return (
    <PageShell
      title="Catálogo de defectos"
      description="Tipos de defecto detectables en control de calidad. Define severidad y acción por defecto."
      actions={
        <Link href="/calidad">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </Link>
      }
    >
      <DefectosClient defectosIniciales={defectos} />
    </PageShell>
  );
}
