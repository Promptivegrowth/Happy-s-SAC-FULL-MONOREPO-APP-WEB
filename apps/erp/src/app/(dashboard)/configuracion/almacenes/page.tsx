import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { UmbralInput } from './umbral-input';

export const metadata = { title: 'Configuración de almacenes' };
export const dynamic = 'force-dynamic';

type Alm = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  stock_minimo_default: number | null;
};

export default async function Page() {
  await requireRol('gerente');
  const sb = await createClient();
  const { data } = await (sb as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        order: (k: string) => Promise<{ data: Alm[] | null }>;
      };
    };
  })
    .from('almacenes')
    .select('id, codigo, nombre, tipo, activo, stock_minimo_default')
    .order('codigo');
  const almacenes = data ?? [];

  return (
    <PageShell
      title="Configuración de almacenes"
      description="Umbrales de stock mínimo por almacén — se usan en /inventario y en las alertas."
    >
      <Card className="border-sky-200 bg-sky-50 p-4 text-xs text-sky-900">
        <p className="mb-1 font-semibold">¿Qué es el umbral de stock mínimo?</p>
        <p>
          Es el número que dispara la alerta <strong>&quot;Stock bajo&quot;</strong> en cada almacén.
          Ejemplo: si Santa Bárbara tiene umbral 5 y un SKU cae a 4 unidades ahí, se pinta en amber y aparece en la lista de alertas.
          Cada tienda tiene su propia realidad: si Huallaga rota muy rápido, umbral 1 es suficiente; si en Santa Bárbara hay reposición semanal, umbral 5 es más prudente.
          <br />Valor <strong>0</strong> = no alerta nunca en ese almacén (útil para Merma o Materia Prima).
        </p>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Umbral de stock bajo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {almacenes.map((a) => (
              <TableRow key={a.id} className={!a.activo ? 'opacity-50' : ''}>
                <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                <TableCell className="font-medium">{a.nombre}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{a.tipo}</Badge>
                </TableCell>
                <TableCell>
                  {a.activo
                    ? <Badge variant="success" className="text-[10px]">Activo</Badge>
                    : <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <UmbralInput id={a.id} valorInicial={a.stock_minimo_default ?? 0} deshabilitado={!a.activo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Este umbral aplica a <strong>productos terminados (variantes)</strong>. Los
            materiales (telas, avíos) usan su propio stock mínimo definido en cada material,
            desde el CRUD de <code>/materiales</code>.
          </p>
        </div>
      </Card>
    </PageShell>
  );
}
