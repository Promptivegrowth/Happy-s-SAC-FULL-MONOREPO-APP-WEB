import Link from 'next/link';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { getSession } from '@/server/session';
import { listarAlmacenes } from '@/server/actions/kardex';
import { listarVariantesParaTraslado } from '@/server/actions/traslados';
import { NuevoTrasladoForm } from './form-client';

export const metadata = { title: 'Nuevo traslado' };
export const dynamic = 'force-dynamic';

export default async function NuevoTrasladoPage() {
  const [resAlms, resVars, sesion] = await Promise.all([
    listarAlmacenes(),
    listarVariantesParaTraslado(),
    getSession(),
  ]);
  /*
   * Corregir stock desde el traslado es un conteo, y contar es trabajo de
   * almacén. Los roles tienen que ser LOS MISMOS que acepta
   * `requierePermisoConteo` en el servidor: si acá se ofreciera de más, el
   * botón aparecería y el guardado fallaría.
   */
  const ROLES_QUE_CUENTAN = ['gerente', 'almacenero', 'almacen_la_quinta'];
  const puedeAjustar = sesion.roles.some((r) => ROLES_QUE_CUENTAN.includes(r));
  // Excluir MATERIA_PRIMA: los traslados entre almacenes son de productos
  // terminados, no se hacen contra MP. Cliente lo pidió explícito.
  const almacenes = resAlms.ok
    ? (resAlms.data ?? []).filter((a) => a.tipo !== 'MATERIA_PRIMA')
    : [];
  const variantes = resVars.ok ? (resVars.data ?? []) : [];
  // Los traslados NO manejan materiales (pedido cliente 2026-08-27).
  const materiales: never[] = [];

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
          sinMateriales
          puedeAjustar={puedeAjustar}
        />
      )}
    </PageShell>
  );
}
