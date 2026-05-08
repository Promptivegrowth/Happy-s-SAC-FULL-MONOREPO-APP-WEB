import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Ruler } from 'lucide-react';
import { UnidadesTable } from './client';

export const metadata = { title: 'Unidades de medida' };
export const dynamic = 'force-dynamic';

type Unidad = {
  id: string;
  codigo: string;
  nombre: string;
  simbolo: string | null;
  tipo: string | null;
  sunat_codigo: string | null;
  factor_conversion: number | null;
  unidad_base: string | null;
  activo: boolean;
};

export default async function Page() {
  const sb = await createClient();
  const { data: unidadesData } = await sb
    .from('unidades_medida')
    .select('id, codigo, nombre, simbolo, tipo, sunat_codigo, factor_conversion, unidad_base, activo')
    .order('codigo');
  const unidades = (unidadesData ?? []) as Unidad[];

  // Conteo de uso por unidad para deshabilitar el botón Eliminar cuando está en uso
  const usosMap = new Map<string, { compra: number; consumo: number }>();
  if (unidades.length > 0) {
    const ids = unidades.map((u) => u.id);
    const [{ data: matsCompra }, { data: matsConsumo }] = await Promise.all([
      sb.from('materiales').select('unidad_compra_id').in('unidad_compra_id', ids),
      sb.from('materiales').select('unidad_consumo_id').in('unidad_consumo_id', ids),
    ]);
    for (const m of matsCompra ?? []) {
      const id = m.unidad_compra_id as string;
      const e = usosMap.get(id) ?? { compra: 0, consumo: 0 };
      e.compra++;
      usosMap.set(id, e);
    }
    for (const m of matsConsumo ?? []) {
      const id = m.unidad_consumo_id as string;
      const e = usosMap.get(id) ?? { compra: 0, consumo: 0 };
      e.consumo++;
      usosMap.set(id, e);
    }
  }

  const unidadesConUso = unidades.map((u) => ({
    ...u,
    usos: usosMap.get(u.id) ?? { compra: 0, consumo: 0 },
  }));

  return (
    <PageShell
      title="Unidades de medida"
      description='Catálogo de unidades para materiales (compra y consumo). Las que están "en uso" no se pueden eliminar — desactivalas para esconderlas del selector sin romper materiales existentes.'
      actions={
        <div className="flex items-center gap-2">
          <Link href="/configuracion">
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <UnidadesTable.NewButton />
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-1 font-display font-semibold text-corp-900">Tips</h3>
        <ul className="ml-5 list-disc text-xs text-slate-600">
          <li>
            <strong>Tipo</strong>: clasificá la unidad. PESO=kg/g, LONGITUD=m/cm, VOLUMEN=L/ml, UNIDAD=pieza/par,
            CONJUNTO=rollo/madeja/cono (agrupa varias unidades base).
          </li>
          <li>
            <strong>Factor de conversión + unidad base</strong>: si comprás "Rollo de 50 metros" y consumís en "metros",
            la unidad ROLLO debería tener factor 50 y base &quot;m&quot;. Sirve para conversiones automáticas.
          </li>
          <li>
            <strong>Código SUNAT</strong>: equivalencia para emisión de comprobantes electrónicos (catálogo SUNAT 03).
            Ej: m=&quot;MTR&quot;, kg=&quot;KGM&quot;, unid=&quot;NIU&quot;.
          </li>
          <li>
            <strong>Eliminar vs Desactivar</strong>: eliminar borra la fila (solo si no está en uso). Desactivar la
            esconde del selector pero la mantiene para los materiales que ya la tienen.
          </li>
        </ul>
      </div>

      {unidades.length === 0 ? (
        <EmptyState
          icon={<Ruler className="h-6 w-6" />}
          title="Sin unidades configuradas"
          description="Agregá la primera unidad para poder cargar materiales."
          action={<UnidadesTable.NewButton />}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Símbolo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>SUNAT</TableHead>
                  <TableHead className="text-right">Factor</TableHead>
                  <TableHead>Base</TableHead>
                  <TableHead>En uso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidadesConUso.map((u) => {
                  const totalUsos = u.usos.compra + u.usos.consumo;
                  return (
                    <TableRow key={u.id} className={!u.activo ? 'opacity-60' : ''}>
                      <TableCell className="font-mono text-xs">{u.codigo}</TableCell>
                      <TableCell className="font-medium">{u.nombre}</TableCell>
                      <TableCell className="font-mono text-xs">{u.simbolo ?? '—'}</TableCell>
                      <TableCell>
                        {u.tipo ? (
                          <Badge variant="secondary" className="text-[10px]">{u.tipo}</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-500">{u.sunat_codigo ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {u.factor_conversion ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{u.unidad_base ?? '—'}</TableCell>
                      <TableCell>
                        {totalUsos === 0 ? (
                          <Badge variant="outline" className="text-[10px] text-slate-400">Sin uso</Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px]" title={`Compra: ${u.usos.compra} · Consumo: ${u.usos.consumo}`}>
                            {totalUsos} mat.
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <UnidadesTable.ToggleActivo unidadId={u.id} activo={u.activo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <UnidadesTable.EditButton unidad={u} />
                          <UnidadesTable.DeleteButton unidadId={u.id} usos={totalUsos} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
