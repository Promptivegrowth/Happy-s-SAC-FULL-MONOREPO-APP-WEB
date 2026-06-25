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
import { Boxes, AlertTriangle, History } from 'lucide-react';
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
    // Cast porque oculto_en_selectores es de migración 52 (aún no en types autogen)
    (sb as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (k: string, v: unknown) => {
            eq: (k: string, v: unknown) => {
              order: (k: string) => Promise<{ data: Array<{ id: string; codigo: string; nombre: string; tipo: string }> | null }>;
            };
          };
        };
      };
    })
      .from('almacenes')
      .select('id, codigo, nombre, tipo')
      .eq('activo', true)
      .eq('oculto_en_selectores', false)
      .order('nombre'),
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
        {/* "Todos los productos" es el default (vista vacía o vista=todo). Útil para
            ver el catálogo completo y poder modificar stock incluso de variantes en 0. */}
        <FilterChip href={chipUrl({ vista: '' })} active={!sp.vista || sp.vista === 'todo'}>
          Todos los productos
        </FilterChip>
        <FilterChip href={chipUrl({ vista: 'conStock' })} active={sp.vista === 'conStock'}>
          Solo con stock
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

// Una fila por (almacén × variante). Si nunca hubo movimiento, cantidad = 0.
type Fila = {
  variante_id: string;
  sku: string;
  talla: string;
  producto_nombre: string;
  almacen_id: string;
  almacen_nombre: string;
  cantidad: number;
};

async function InventarioTable({ q, almacen, vista }: SP) {
  const sb = await createClient();

  // Estrategia (default = mostrar todo, incluso variantes en 0)
  //  - DEFAULT (vista vacía o 'todo'): LEFT JOIN sintético — todas las variantes activas
  //    × almacenes activos, con stock_actual cuando exista (0 si no hay fila). Útil para
  //    poder ver/ajustar stock de cualquier variante aunque no haya tenido movimiento aún.
  //  - 'conStock': query directa a stock_actual con cantidad>0 (rápida).
  //  - 'bajo': query directa con 0<cantidad<=5.
  const incluirCeros = !vista || vista === 'todo';

  // 1) Cargar stock real
  let stockQuery = sb
    .from('stock_actual')
    .select('cantidad, almacen_id, variante_id')
    .not('variante_id', 'is', null)
    .limit(5000);
  if (almacen) stockQuery = stockQuery.eq('almacen_id', almacen);
  if (!incluirCeros) {
    if (vista === 'bajo') stockQuery = stockQuery.lte('cantidad', 5).gt('cantidad', 0);
    else stockQuery = stockQuery.gt('cantidad', 0);
  }
  const { data: stocksRaw } = await stockQuery;
  const stocksMap = new Map<string, number>(); // key = almacen|variante
  for (const s of (stocksRaw ?? []) as { variante_id: string; almacen_id: string; cantidad: string | number }[]) {
    stocksMap.set(`${s.almacen_id}|${s.variante_id}`, Number(s.cantidad ?? 0));
  }

  let filas: Fila[] = [];

  // Normalizar query: el autocomplete devuelve "Nombre · Talla N" — extraemos
  // solo la primera parte para que la búsqueda matchee aunque el formato sea distinto.
  const qNorm = q ? (q.split('·')[0]?.trim() ?? q) : '';

  if (incluirCeros) {
    // 2a) Variantes activas + almacenes activos → producto cruz
    // OJO: NO usar .or() con productos.nombre — Supabase ignora silenciosamente
    // los filtros sobre foreign tables en .or() y devuelve todo (o nada).
    // Mejor: traer todas las variantes (límite 2000) y filtrar client-side
    // donde sí podemos cruzar sku + nombre del producto.
    const { data: varsRaw } = await sb
      .from('productos_variantes')
      .select('id, sku, talla, productos!inner(nombre, activo)')
      .eq('activo', true)
      .eq('productos.activo', true)
      .order('sku')
      .limit(2000);
    let variantes = ((varsRaw ?? []) as unknown as {
      id: string; sku: string; talla: string; productos: { nombre: string } | null;
    }[]).filter((v) => v.productos);
    if (qNorm) {
      const qq = qNorm.toLowerCase();
      variantes = variantes.filter(
        (v) =>
          v.sku.toLowerCase().includes(qq) ||
          (v.productos?.nombre ?? '').toLowerCase().includes(qq),
      );
    }

    const { data: almsAll } = await sb.from('almacenes').select('id, nombre').eq('activo', true).order('nombre');
    const almacenes = ((almsAll ?? []) as { id: string; nombre: string }[]).filter(
      (a) => !almacen || a.id === almacen,
    );

    for (const v of variantes) {
      for (const a of almacenes) {
        filas.push({
          variante_id: v.id,
          sku: v.sku,
          talla: v.talla,
          producto_nombre: v.productos!.nombre,
          almacen_id: a.id,
          almacen_nombre: a.nombre,
          cantidad: stocksMap.get(`${a.id}|${v.id}`) ?? 0,
        });
      }
    }
    // Ordenar: con stock primero (descendente), luego cero
    filas.sort((x, y) => y.cantidad - x.cantidad || x.sku.localeCompare(y.sku));
  } else {
    // 2b) Solo lo que hay con stock — necesitamos info de variante y almacén para mostrar nombres
    const varIds = Array.from(new Set([...stocksMap.keys()].map((k) => k.split('|')[1] ?? '')));
    const almIds = Array.from(new Set([...stocksMap.keys()].map((k) => k.split('|')[0] ?? '')));
    if (varIds.length === 0) {
      filas = [];
    } else {
      const [{ data: vars }, { data: alms }] = await Promise.all([
        sb.from('productos_variantes').select('id, sku, talla, productos(nombre)').in('id', varIds),
        sb.from('almacenes').select('id, nombre').in('id', almIds),
      ]);
      const vmap = new Map(
        ((vars ?? []) as unknown as { id: string; sku: string; talla: string; productos: { nombre: string } | null }[]).map((v) => [v.id, v]),
      );
      const amap = new Map(((alms ?? []) as { id: string; nombre: string }[]).map((a) => [a.id, a]));
      for (const [key, cantidad] of stocksMap) {
        const [aId, vId] = key.split('|');
        const v = vmap.get(vId ?? '');
        const a = amap.get(aId ?? '');
        if (!v || !a) continue;
        filas.push({
          variante_id: v.id,
          sku: v.sku,
          talla: v.talla,
          producto_nombre: v.productos?.nombre ?? '—',
          almacen_id: a.id,
          almacen_nombre: a.nombre,
          cantidad,
        });
      }
      // Filtro client-side por texto (usando query normalizada — solo el nombre del producto)
      if (qNorm) {
        const qq = qNorm.toLowerCase();
        filas = filas.filter((f) => f.sku.toLowerCase().includes(qq) || f.producto_nombre.toLowerCase().includes(qq));
      }
      filas.sort((x, y) => y.cantidad - x.cantidad || x.sku.localeCompare(y.sku));
    }
  }

  // Limitar a 500 filas para no romper el render
  const filasMostrar = filas.slice(0, 500);

  if (filasMostrar.length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="h-6 w-6" />}
        title={q ? 'Sin coincidencias' : incluirCeros ? 'Sin variantes' : 'Sin stock'}
        description={
          qNorm
            ? `Sin coincidencias para "${qNorm}".`
            : incluirCeros
              ? 'No hay variantes activas. Creá productos y variantes desde el catálogo.'
              : 'No hay stock con los filtros seleccionados. Probá "Todos los productos" para ver variantes sin stock.'
        }
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
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filasMostrar.map((f) => {
              const bajo = f.cantidad > 0 && f.cantidad <= 5;
              const cero = f.cantidad === 0;
              return (
                <TableRow key={`${f.almacen_id}-${f.variante_id}`} className={cero ? 'opacity-60' : ''}>
                  <TableCell>
                    <Badge variant="secondary">{f.almacen_nombre}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{f.sku}</TableCell>
                  <TableCell className="font-medium">{f.producto_nombre}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{f.talla.replace('T', '')}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`font-semibold ${
                        cero ? 'text-slate-400' : bajo ? 'text-amber-600' : 'text-corp-900'
                      }`}
                    >
                      {formatNumber(f.cantidad)}
                    </span>
                    {bajo && <AlertTriangle className="ml-1 inline h-3 w-3 text-amber-500" />}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/kardex/variante/${f.variante_id}`}
                        title="Ver historial de movimientos"
                      >
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <History className="h-3.5 w-3.5 text-slate-500" />
                        </Button>
                      </Link>
                      <AjustarStockButton
                        almacenId={f.almacen_id}
                        almacenNombre={f.almacen_nombre}
                        varianteId={f.variante_id}
                        sku={f.sku}
                        productoNombre={f.producto_nombre}
                        talla={f.talla}
                        cantidadActual={f.cantidad}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filas.length > 500 && (
          <div className="border-t bg-slate-50/50 p-3 text-center text-xs text-slate-500">
            Mostrando 500 de {filas.length} filas. Usá los filtros para reducir.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
