import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { SearchAutocomplete } from '@/components/search-autocomplete';
import { FilterChip } from '@/components/filter-chip';
import { TableSkeleton } from '@/components/skeletons';
import { formatNumber } from '@happy/lib';
import { Boxes, AlertTriangle } from 'lucide-react';
import { AjustarStockButton } from './ajustar-stock-client';
import { NuevoMovimientoButton } from './nuevo-movimiento-client';

export const metadata = { title: 'Inventario' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; almacen?: string; vista?: string };

export default async function InventarioPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  // Datos para filtros: almacenes activos + index de variantes para autocomplete
  const [{ data: almacenesData }, { data: variantesIndex }] = await Promise.all([
    sb.from('almacenes').select('id, codigo, nombre, tipo').eq('activo', true).order('nombre'),
    sb
      .from('productos_variantes')
      .select('id, sku, talla, productos(nombre)')
      .eq('activo', true)
      .order('sku')
      .limit(1500),
  ]);

  const almacenes = (almacenesData ?? []) as { id: string; codigo: string; nombre: string; tipo: string }[];

  const indexItems = (variantesIndex ?? []).map((v) => {
    const prodNombre = (v as unknown as { productos?: { nombre: string } }).productos?.nombre ?? '';
    return {
      id: v.id,
      label: `${prodNombre} · Talla ${v.talla.replace('T', '')}`,
      sublabel: `SKU ${v.sku}`,
      // No href: el search se aplica al filtro q de la tabla.
    };
  });

  // Lista plana de variantes para el modal "Nuevo movimiento"
  const variantesParaModal = (variantesIndex ?? []).map((v) => {
    const prodNombre = (v as unknown as { productos?: { nombre: string } }).productos?.nombre ?? '';
    return { id: v.id as string, sku: v.sku as string, talla: v.talla as string, producto_nombre: prodNombre };
  });

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.almacen) sp2.set('almacen', sp.almacen);
    if (sp.vista) sp2.set('vista', sp.vista);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  const tableKey = `${sp.q ?? ''}|${sp.almacen ?? ''}|${sp.vista ?? ''}`;

  return (
    <PageShell
      title="Stock actual"
      description="Vista consolidada de inventario por almacén y SKU."
      actions={
        <div className="flex items-center gap-2">
          <NuevoMovimientoButton almacenes={almacenes} variantes={variantesParaModal} />
          <Link href="/inventario/alertas">
            <Button variant="outline" className="gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Ver alertas
            </Button>
          </Link>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchAutocomplete items={indexItems} placeholder="Buscar por SKU o nombre del producto…" />
        <FilterChip href={chipUrl({ vista: '' })} active={!sp.vista}>
          Con stock
        </FilterChip>
        <FilterChip href={chipUrl({ vista: 'todo' })} active={sp.vista === 'todo'}>
          Todo (incluye 0)
        </FilterChip>
        <FilterChip href={chipUrl({ vista: 'bajo' })} active={sp.vista === 'bajo'} variant="destructive">
          <AlertTriangle className="h-3 w-3" /> Stock bajo (≤5)
        </FilterChip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Almacén:</span>
        <FilterChip href={chipUrl({ almacen: '' })} active={!sp.almacen}>
          Todos
        </FilterChip>
        {almacenes.map((a) => (
          <FilterChip key={a.id} href={chipUrl({ almacen: a.id })} active={sp.almacen === a.id}>
            {a.nombre}
          </FilterChip>
        ))}
      </div>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={5} />}>
        <InventarioTable {...sp} />
      </Suspense>
    </PageShell>
  );
}

type StockRow = {
  id: string;
  cantidad: number;
  almacen_id: string;
  variante_id: string;
  almacenes: { nombre: string; codigo: string } | null;
  productos_variantes: {
    sku: string;
    talla: string;
    productos: { nombre: string } | null;
  } | null;
};

async function InventarioTable({ q, almacen, vista }: SP) {
  const sb = await createClient();
  let query = sb
    .from('stock_actual')
    .select('id, cantidad, almacen_id, variante_id, almacenes(nombre, codigo), productos_variantes!inner(sku, talla, productos(nombre))')
    .not('variante_id', 'is', null)
    .order('cantidad', { ascending: false })
    .limit(300);

  if (vista === 'bajo') query = query.lte('cantidad', 5).gt('cantidad', 0);
  else if (vista !== 'todo') query = query.gt('cantidad', 0);

  if (almacen) query = query.eq('almacen_id', almacen);
  if (q) query = query.ilike('productos_variantes.sku', `%${q}%`);

  const { data } = await query;
  const stocks = (data ?? []) as unknown as StockRow[];

  // Filtro adicional client-side por nombre de producto (cuando search tiene texto que no matchea SKU)
  const stocksFiltrados = q
    ? stocks.filter(
        (s) =>
          s.productos_variantes?.sku.toLowerCase().includes(q.toLowerCase()) ||
          s.productos_variantes?.productos?.nombre.toLowerCase().includes(q.toLowerCase()),
      )
    : stocks;

  if (stocksFiltrados.length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="h-6 w-6" />}
        title="Sin stock"
        description={q ? `Sin coincidencias para "${q}".` : 'No hay stock con los filtros seleccionados.'}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Almacén</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Ajustar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stocksFiltrados.map((s) => {
              const a = s.almacenes;
              const v = s.productos_variantes;
              const cantidad = Number(s.cantidad);
              const bajo = cantidad <= 5;
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <Badge variant="secondary">{a?.nombre}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{v?.sku}</TableCell>
                  <TableCell className="font-medium">{v?.productos?.nombre}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{v?.talla?.replace('T', '')}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-semibold ${bajo ? 'text-amber-600' : 'text-corp-900'}`}>
                      {formatNumber(cantidad)}
                    </span>
                    {bajo && <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-500" />}
                  </TableCell>
                  <TableCell className="text-right">
                    {v && a && (
                      <AjustarStockButton
                        almacenId={s.almacen_id}
                        almacenNombre={a.nombre}
                        varianteId={s.variante_id}
                        sku={v.sku}
                        productoNombre={v.productos?.nombre ?? ''}
                        talla={v.talla}
                        cantidadActual={cantidad}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
