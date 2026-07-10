import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, ListOrdered } from 'lucide-react';
import { CatalogoClient } from './client';

export const metadata = { title: 'Catálogo de pasos operativos' };
export const dynamic = 'force-dynamic';

type Area = { id: string; codigo: string; nombre: string; activa: boolean };
type Paso = { id: string; area_id: string; nombre: string; orden: number; activo: boolean };

export default async function Page() {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };

  const [{ data: areasData }, { data: pasosData }] = await Promise.all([
    sb.from('areas_produccion').select('id, codigo, nombre, activa').eq('activa', true).order('nombre'),
    sbAny
      .from('catalogo_pasos_operativos')
      .select('id, area_id, nombre, orden, activo')
      .order('area_id')
      .order('orden'),
  ]);

  const areas = (areasData ?? []) as Area[];
  const pasos = (pasosData ?? []) as Paso[];

  // Conteo de uso por (area_id, nombre): cuántos productos_procesos vigentes
  // tienen ese descripcion_operativa en esa área. Sirve para bloquear el
  // "eliminar" y avisar en el UI.
  const usosMap = new Map<string, number>(); // key = `${area_id}::${nombre}`
  if (pasos.length > 0) {
    const { data: usos } = await sbAny
      .from('productos_procesos')
      .select('area_id, descripcion_operativa')
      .eq('activo', true)
      .not('descripcion_operativa', 'is', null);
    for (const u of usos ?? []) {
      const k = `${u.area_id}::${u.descripcion_operativa}`;
      usosMap.set(k, (usosMap.get(k) ?? 0) + 1);
    }
  }

  const pasosConUsos = pasos.map((p) => ({
    ...p,
    usos: usosMap.get(`${p.area_id}::${p.nombre}`) ?? 0,
  }));

  return (
    <PageShell
      title="Catálogo de pasos operativos"
      description="Lista de pasos concretos que se pueden asignar dentro de cada área (ej: DESEMBOLSADO DE PAQUETES dentro de ACABADO, DELANTERO IZQ dentro de BORDADO). Alimenta el dropdown 'Paso operativo' del editor de recetas."
      actions={
        <div className="flex items-center gap-2">
          <Link href="/configuracion">
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-1 font-display font-semibold text-corp-900">Tips</h3>
        <ul className="ml-5 list-disc text-xs text-slate-600">
          <li>
            El <strong>paso operativo</strong> es el nombre concreto del trabajo dentro de un área
            (ej. dentro de ACABADO puede haber DESEMBOLSADO, LIMPIEZA, DOBLADO Y EMBOLSADO, etc.).
          </li>
          <li>
            El <strong>orden</strong> define cómo se ordenan en el dropdown (menor arriba). Múltiplos
            de 10 permiten insertar más adelante sin renumerar todo.
          </li>
          <li>
            <strong>Eliminar vs desactivar</strong>: eliminar borra la fila (solo si no la usa ningún
            proceso activo). Desactivar lo oculta del dropdown pero mantiene las operaciones
            existentes.
          </li>
          <li>
            Un mismo nombre <strong>puede repetirse entre áreas distintas</strong> (ej.
            &quot;SUBLIMADO 1 ARTE&quot; existe en CORTE, ESTAMPADO y SUBLIMADO). Dentro de la misma
            área no se puede repetir.
          </li>
        </ul>
      </div>

      {areas.length === 0 ? (
        <EmptyState
          icon={<ListOrdered className="h-6 w-6" />}
          title="Sin áreas activas"
          description="Primero activá al menos un área en /configuracion/areas para poder cargar sus pasos."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <CatalogoClient areas={areas} pasos={pasosConUsos} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

