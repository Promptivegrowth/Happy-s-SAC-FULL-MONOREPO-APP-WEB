import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Package, ArrowLeft, ExternalLink, Factory } from 'lucide-react';
import { PageShell } from '@/components/page-shell';

export const dynamic = 'force-dynamic';

const TIPO_TONO: Record<string, string> = {
  PRODUCCION: 'bg-emerald-100 text-emerald-800',
  VENTA: 'bg-violet-100 text-violet-800',
  TRASLADO: 'bg-sky-100 text-sky-800',
  DEVOLUCION: 'bg-amber-100 text-amber-800',
  MERMA: 'bg-rose-100 text-rose-800',
  AJUSTE_ENTRADA: 'bg-slate-100 text-slate-700',
  AJUSTE_SALIDA: 'bg-slate-100 text-slate-700',
};

export default async function ProductoTrazaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = await createClient();

  // Producto base
  const { data: prod } = await sb
    .from('productos')
    .select('id, codigo, nombre, activo')
    .eq('id', id)
    .maybeSingle();
  if (!prod) notFound();

  // Variantes
  const { data: variantesRaw } = await sb
    .from('productos_variantes')
    .select('id, sku, talla, color_variante, activo')
    .eq('producto_id', id)
    .order('talla');
  const variantes = (variantesRaw ?? []) as Array<{
    id: string;
    sku: string;
    talla: string;
    color_variante: string | null;
    activo: boolean;
  }>;
  const varianteIds = variantes.map((v) => v.id);

  // Stock por variante
  const { data: stockRaw } = varianteIds.length
    ? await sb
        .from('stock_actual')
        .select('variante_id, cantidad')
        .in('variante_id', varianteIds)
        .gt('cantidad', 0)
    : { data: [] };
  const stockPorVariante = new Map<string, number>();
  let stockTotal = 0;
  for (const s of (stockRaw ?? []) as Array<{ variante_id: string; cantidad: number }>) {
    const c = Number(s.cantidad);
    stockPorVariante.set(s.variante_id, (stockPorVariante.get(s.variante_id) ?? 0) + c);
    stockTotal += c;
  }

  // Eventos consolidados
  const { data: eventosRaw } = varianteIds.length
    ? await sb
        .from('trazabilidad_eventos')
        .select(
          'id, fecha, tipo, cantidad, observacion, ' +
            'variante:variante_id(id, sku, talla), ' +
            'almacen_origen:almacen_origen(codigo), ' +
            'almacen_destino:almacen_destino(codigo), ' +
            'ot:ot_id(id, numero), ' +
            'cliente:cliente_id(id, razon_social, nombres)',
        )
        .in('variante_id', varianteIds)
        .order('fecha', { ascending: false })
        .limit(200)
    : { data: [] };

  type Evt = {
    id: number;
    fecha: string;
    tipo: string;
    cantidad: number | null;
    observacion: string | null;
    variante: { id: string; sku: string; talla: string } | null;
    almacen_origen: { codigo: string } | null;
    almacen_destino: { codigo: string } | null;
    ot: { id: string; numero: string } | null;
    cliente: { id: string; razon_social: string | null; nombres: string | null } | null;
  };
  const eventos = ((eventosRaw ?? []) as unknown as Evt[]);

  return (
    <PageShell
      title={prod.nombre}
      description={
        <span className="inline-flex items-center gap-2 text-sm">
          <Package className="h-3.5 w-3.5" />
          Producto <span className="font-mono text-happy-700">{prod.codigo}</span>
          <span className="text-slate-400">·</span>
          {variantes.length} variante{variantes.length === 1 ? '' : 's'}
          {!prod.activo && <Badge variant="destructive" className="text-[10px]">INACTIVO</Badge>}
        </span>
      }
      actions={
        <Link href="/trazabilidad">
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-happy-600">
            <ArrowLeft className="h-3.5 w-3.5" /> Volver
          </span>
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Variantes activas</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {variantes.filter((v) => v.activo).length}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Stock total</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{stockTotal}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Eventos en timeline</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{eventos.length}</p>
        </Card>
      </div>

      {/* Tabla de variantes */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
          <Package className="h-4 w-4" /> Variantes (click → timeline detallado por talla)
        </h3>
        {variantes.length === 0 ? (
          <p className="text-xs text-slate-500">Sin variantes registradas.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead className="text-right">Stock total</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variantes.map((v) => {
                const cant = stockPorVariante.get(v.id) ?? 0;
                return (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                    <TableCell className="text-sm">{v.talla.replace('T', '')}</TableCell>
                    <TableCell className="text-sm">{v.color_variante ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={v.activo ? 'secondary' : 'destructive'} className="text-[10px]">
                        {v.activo ? 'Sí' : 'No'}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm ${cant > 0 ? 'font-semibold' : 'text-slate-400'}`}>
                      {cant}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/trazabilidad/variante/${v.id}`}
                        className="inline-flex items-center text-xs text-happy-700 hover:underline"
                      >
                        Ver timeline <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Eventos agregados de todas las variantes */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-corp-900">
          <Factory className="h-4 w-4" /> Eventos consolidados ({eventos.length})
        </h3>
        {eventos.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Sin movimientos registrados para este producto.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Variante</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead>OT / Cliente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventos.map((e) => {
                  const fechaTxt = new Date(e.fecha).toLocaleString('es-PE', {
                    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                  });
                  const cli = e.cliente?.razon_social ?? e.cliente?.nombres ?? null;
                  const tono = TIPO_TONO[e.tipo] ?? 'bg-slate-100 text-slate-700';
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tono}`}>
                          {e.tipo}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.variante && (
                          <Link href={`/trazabilidad/variante/${e.variante.id}`} className="hover:underline">
                            <span className="font-mono">{e.variante.sku}</span>
                            <span className="text-slate-400"> · T{e.variante.talla.replace('T', '')}</span>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {e.almacen_origen?.codigo ?? '—'}
                        {e.almacen_destino && ` → ${e.almacen_destino.codigo}`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{e.cantidad ?? '—'}</TableCell>
                      <TableCell className="text-xs">
                        {e.ot && (
                          <Link href={`/trazabilidad/ot/${e.ot.id}`} className="text-happy-700 hover:underline">
                            {e.ot.numero}
                          </Link>
                        )}
                        {cli && <div className="text-[11px] text-slate-500">{cli}</div>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
