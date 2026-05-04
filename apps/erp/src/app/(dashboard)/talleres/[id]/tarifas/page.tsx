import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Tags } from 'lucide-react';
import { NuevaTarifaButton } from './nueva-tarifa-client';
import { EliminarTarifaButton } from './eliminar-tarifa-client';
import { formatPEN, formatDate } from '@happy/lib';

export const dynamic = 'force-dynamic';

type Tarifa = {
  id: string;
  producto_id: string | null;
  proceso: string | null;
  talla: string | null;
  precio_unitario: number;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  observacion: string | null;
  productos: { codigo: string; nombre: string } | null;
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: taller } = await sb
    .from('talleres')
    .select('id, codigo, nombre, especialidades')
    .eq('id', id)
    .maybeSingle();
  if (!taller) notFound();

  const { data: tarifasData } = await sb
    .from('talleres_tarifas')
    .select('id, producto_id, proceso, talla, precio_unitario, vigente_desde, vigente_hasta, observacion, productos(codigo, nombre)')
    .eq('taller_id', id)
    .order('producto_id', { nullsFirst: true })
    .order('proceso', { nullsFirst: true });
  const tarifas = (tarifasData ?? []) as unknown as Tarifa[];

  // Productos para el modal
  const { data: productos } = await sb
    .from('productos')
    .select('id, codigo, nombre')
    .eq('activo', true)
    .order('nombre')
    .limit(2000);

  return (
    <PageShell
      title={`Tarifas de pago: ${taller.nombre}`}
      description={`Configurá cuánto le pagás al taller por unidad. Las tarifas más específicas (producto + proceso + talla) ganan sobre las genéricas.`}
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/talleres/${id}`}>
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver al taller
            </Button>
          </Link>
          <NuevaTarifaButton
            tallerId={id}
            productos={(productos ?? []).map((p) => ({
              id: p.id as string,
              codigo: p.codigo as string,
              nombre: p.nombre as string,
            }))}
          />
        </div>
      }
    >
      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-2 font-display text-sm font-semibold text-corp-900">📐 Cómo funciona la tarifa más específica</h3>
        <p className="text-xs text-slate-600">
          Cuando se calcula el monto sugerido de una OS, el sistema busca de más específico a menos:
        </p>
        <ol className="mt-2 ml-5 list-decimal text-xs text-slate-600">
          <li>Producto + Proceso + Talla (la más específica)</li>
          <li>Producto + Proceso (cualquier talla)</li>
          <li>Solo Proceso (cualquier producto/talla)</li>
          <li>Genérica del taller (sin filtros)</li>
        </ol>
        <p className="mt-2 text-xs text-slate-600">
          <strong>Tip</strong>: empezá con tarifas por proceso (ej. COSTURA = S/ 4.50). Después agregá excepciones por
          producto si algún modelo cobra distinto.
        </p>
      </div>

      {tarifas.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Sin tarifas configuradas"
          description="Sin tarifas, el sistema no puede sugerir el monto de cada OS. Empezá cargando una tarifa por proceso."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Proceso</TableHead>
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
                      {t.proceso ? (
                        <Badge variant="default" className="text-[10px]">{t.proceso}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Cualquier proceso</Badge>
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
                      <EliminarTarifaButton tarifaId={t.id} tallerId={id} />
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
