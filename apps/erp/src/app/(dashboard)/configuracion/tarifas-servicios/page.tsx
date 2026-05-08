import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Tags } from 'lucide-react';
import { TarifasTable } from './client';
import { formatPEN, formatDate } from '@happy/lib';

export const metadata = { title: 'Tarifas de servicios' };
export const dynamic = 'force-dynamic';

type Tarifa = {
  id: string;
  proceso: string | null;
  producto_id: string | null;
  talla: string | null;
  precio_unitario: number;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  observacion: string | null;
  productos: { codigo: string; nombre: string } | null;
};

export default async function Page() {
  const sb = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const [{ data: tarifasData }, { data: productos }] = await Promise.all([
    sbAny
      .from('tarifas_servicios')
      .select('id, proceso, producto_id, talla, precio_unitario, vigente_desde, vigente_hasta, observacion, productos!tarifas_servicios_producto_id_fkey(codigo, nombre)')
      .order('proceso', { nullsFirst: true })
      .order('producto_id', { nullsFirst: true }),
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre').limit(2000),
  ]);
  const tarifas = (tarifasData ?? []) as Tarifa[];

  return (
    <PageShell
      title="Tarifas de servicios"
      description="Tarifario CENTRAL de pago por unidad. Una sola entrada vale para todos los talleres. Si un taller específico cobra distinto, podés override en /talleres/[id]/tarifas."
      actions={
        <div className="flex items-center gap-2">
          <Link href="/configuracion">
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          <TarifasTable.NewButton
            productos={(productos ?? []).map((p) => ({
              id: p.id as string,
              codigo: p.codigo as string,
              nombre: p.nombre as string,
            }))}
          />
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-sm">
        <h3 className="mb-2 font-display font-semibold text-corp-900">📐 Cómo funciona la cascada de tarifas</h3>
        <p className="text-xs text-slate-600">
          Cuando el sistema calcula el monto sugerido de una OS, busca la tarifa más específica:
        </p>
        <ol className="mt-2 ml-5 list-decimal text-xs text-slate-600">
          <li>
            <strong>Override del taller</strong> (en <code className="rounded bg-slate-100 px-1">/talleres/[id]/tarifas</code>):
            si ese taller específico cobra distinto, gana.
          </li>
          <li>
            <strong>Tarifa central de servicios</strong> (esta pantalla): la estándar para todos los talleres.
          </li>
        </ol>
        <p className="mt-2 text-xs text-slate-600">
          <strong>Tip</strong>: dejá un campo vacío para que aplique a CUALQUIER valor. Empezá con tarifas por proceso
          (ej. COSTURA = S/ 4.50 para todos los productos y tallas) y agregá excepciones después.
        </p>
      </div>

      {tarifas.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Sin tarifas configuradas"
          description="Sin tarifas, el sistema no puede sugerir el monto al crear órdenes de servicio. Empezá cargando una tarifa por proceso."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proceso</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead className="text-right">Tarifa</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      {t.proceso ? (
                        <Badge variant="default" className="text-[10px]">{t.proceso.replace('_', ' ')}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier proceso</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.productos?.nombre ? (
                        <span>
                          <span className="font-medium">{t.productos.nombre}</span>
                          <span className="ml-1 font-mono text-[10px] text-slate-400">{t.productos.codigo}</span>
                        </span>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier producto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.talla ? (
                        <Badge variant="outline" className="text-[10px]">{t.talla.replace('T', '')}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier talla</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">
                      {formatPEN(Number(t.precio_unitario))}
                    </TableCell>
                    <TableCell className="text-[10px] text-slate-500">
                      {t.vigente_desde ? formatDate(t.vigente_desde) : '—'}
                      {t.vigente_hasta && ` → ${formatDate(t.vigente_hasta)}`}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-500">{t.observacion ?? ''}</TableCell>
                    <TableCell className="text-right">
                      <TarifasTable.DeleteButton tarifaId={t.id} />
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
