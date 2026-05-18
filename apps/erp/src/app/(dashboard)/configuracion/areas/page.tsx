import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Factory } from 'lucide-react';
import { AreasTable } from './client';

export const metadata = { title: 'Áreas de producción' };
export const dynamic = 'force-dynamic';

type Area = {
  id: string;
  codigo: string;
  nombre: string;
  valor_minuto: number | null;
  activa: boolean;
};

export default async function Page() {
  const sb = await createClient();
  const { data: areasData } = await sb
    .from('areas_produccion')
    .select('id, codigo, nombre, valor_minuto, activa')
    .order('codigo');
  const areas = (areasData ?? []) as Area[];

  // Conteo de uso
  const usosMap = new Map<string, number>();
  if (areas.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = sb as unknown as { from: (t: string) => any };
    const { data: procesos } = await sbAny
      .from('productos_procesos')
      .select('area_id')
      .eq('activo', true) // contar solo procesos vigentes (mig 38)
      .in('area_id', areas.map((a) => a.id));
    for (const p of procesos ?? []) {
      const id = p.area_id as string;
      usosMap.set(id, (usosMap.get(id) ?? 0) + 1);
    }
  }
  const areasConUso = areas.map((a) => ({ ...a, usos: usosMap.get(a.id) ?? 0 }));

  return (
    <PageShell
      title="Áreas de producción"
      description="Catálogo de áreas (CORTE, COSTURA, BORDADO, etc.) con su tarifa por minuto. Cada operación de receta se asigna a un área para calcular el costo de mano de obra."
      actions={
        <div className="flex items-center gap-2">
          <Link href="/configuracion">
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <AreasTable.NewButton />
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-1 font-display font-semibold text-corp-900">Tips</h3>
        <ul className="ml-5 list-disc text-xs text-slate-600">
          <li>
            <strong>Valor por minuto</strong>: lo que cuesta 1 minuto de trabajo en esa área. Se multiplica por el
            tiempo estándar de cada operación para calcular el costo MO de la receta.
          </li>
          <li>
            <strong>Tarifas actuales del cliente</strong>: Corte 0.211 · Decorado 0.110 · Estampado 0.152 · Bordado
            0.234 · Sublimado 0.373 · Plisado 0.133 · Acabado 0.152 · Planchado 0.133 · Servicio Taller 0.183 · Costura 0.183.
          </li>
          <li>
            <strong>Eliminar vs Desactivar</strong>: eliminar borra la fila (solo si no la usa ningún proceso).
            Desactivar la oculta del selector pero mantiene los procesos que ya la tienen asignada.
          </li>
          <li>
            <strong>Histórico de valor por minuto</strong>: cada vez que cambiás el valor de un área queda
            registrado con fecha. Tocá el ícono del reloj 🕒 para ver la evolución y comparar contra valores anteriores.
          </li>
        </ul>
      </div>

      {areas.length === 0 ? (
        <EmptyState
          icon={<Factory className="h-6 w-6" />}
          title="Sin áreas configuradas"
          description="Agregá las áreas para que las recetas puedan asignar procesos y calcular costos MO."
          action={<AreasTable.NewButton />}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">S/ por minuto</TableHead>
                  <TableHead>En uso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areasConUso.map((a) => (
                  <TableRow key={a.id} className={!a.activa ? 'opacity-60' : ''}>
                    <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                    <TableCell className="font-medium">{a.nombre}</TableCell>
                    <TableCell className="text-right font-mono">
                      {a.valor_minuto !== null ? (
                        <span className="font-semibold text-emerald-700">
                          S/ {Number(a.valor_minuto).toFixed(3)}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.usos === 0 ? (
                        <Badge variant="outline" className="text-[10px] text-slate-400">Sin uso</Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px]">
                          {a.usos} proceso{a.usos === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <AreasTable.ToggleActiva areaId={a.id} activa={a.activa} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <AreasTable.HistoricoButton areaId={a.id} areaNombre={a.nombre} />
                        <AreasTable.EditButton area={a} />
                        <AreasTable.DeleteButton areaId={a.id} usos={a.usos} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
