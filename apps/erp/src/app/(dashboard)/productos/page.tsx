import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN, ordenTalla } from '@happy/lib';
import { PageShell } from '@/components/page-shell';
import { SearchAutocomplete } from '@/components/search-autocomplete';
import { FilterChip } from '@/components/filter-chip';
import { TableSkeleton } from '@/components/skeletons';
import { Plus, Shirt, Pencil, Globe, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Productos' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; cat?: string; estado?: string; web?: string; sin_categoria?: string };

export default async function ProductosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  // Datos para filtros + autocomplete (no dependen de los chips, queries pequeñas).
  const [{ data: catsData }, { data: campsData }, { data: indexData }] = await Promise.all([
    sb.from('categorias').select('id, nombre').eq('activo', true).order('nombre'),
    sb.from('campanas').select('id, nombre, activa').eq('activa', true).order('nombre'),
    sb.from('productos').select('id, codigo, nombre, categorias(nombre)').eq('activo', true).order('nombre').limit(500),
  ]);
  const categorias = (catsData ?? []) as { id: string; nombre: string }[];
  const campanas = (campsData ?? []) as { id: string; nombre: string }[];
  const indexItems = (indexData ?? []).map((p) => {
    const c = (p as unknown as { categorias?: { nombre: string } | null }).categorias;
    return {
      id: p.id,
      label: p.nombre,
      sublabel: [p.codigo, c?.nombre].filter(Boolean).join(' · '),
      href: `/productos/${p.id}`,
    };
  });

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.cat) sp2.set('cat', sp.cat);
    if (sp.estado) sp2.set('estado', sp.estado);
    if (sp.web) sp2.set('web', sp.web);
    if (sp.sin_categoria) sp2.set('sin_categoria', sp.sin_categoria);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  const sinCategoriaActivo = sp.sin_categoria === '1';

  // Key estable para que Suspense remonte sólo la tabla cuando cambian los filtros.
  const tableKey = `${sp.q ?? ''}|${sp.cat ?? ''}|${sp.estado ?? ''}|${sp.web ?? ''}|${sp.sin_categoria ?? ''}`;

  return (
    <PageShell
      title="Productos / Disfraces"
      description="Catálogo de modelos con sus variantes (talla). Aquí se crean, editan y publican en la web."
      actions={
        <Link href="/productos/nuevo">
          <Button variant="premium">
            <Plus className="h-4 w-4" /> Nuevo producto
          </Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchAutocomplete items={indexItems} placeholder="Buscar producto por nombre o código…" />
        <FilterChip href="/productos" active={!sp.cat && !sp.estado && !sp.web && !sinCategoriaActivo}>
          Todos
        </FilterChip>
        <FilterChip href={chipUrl({ web: 'si' })} active={sp.web === 'si'} variant="success">
          <Globe className="h-3 w-3" /> Publicados
        </FilterChip>
        <FilterChip href={chipUrl({ web: 'no' })} active={sp.web === 'no'}>
          Sin publicar
        </FilterChip>
        <FilterChip
          href={chipUrl({ sin_categoria: sinCategoriaActivo ? '' : '1', cat: '' })}
          active={sinCategoriaActivo}
          variant="default"
          className="bg-amber-500 hover:bg-amber-600"
        >
          <AlertTriangle className="h-3 w-3" /> Sin categoría
        </FilterChip>
        <FilterChip
          href={chipUrl({ estado: sp.estado === 'inactivo' ? '' : 'inactivo' })}
          active={sp.estado === 'inactivo'}
          variant="destructive"
        >
          Inactivos
        </FilterChip>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Categoría:</span>
        <FilterChip href={chipUrl({ cat: '' })} active={!sp.cat}>
          Todas
        </FilterChip>
        {categorias.map((c) => (
          <FilterChip key={c.id} href={chipUrl({ cat: c.id })} active={sp.cat === c.id}>
            {c.nombre}
          </FilterChip>
        ))}
      </div>

      {campanas.length > 0 && (
        <div className="text-xs text-slate-500">
          <strong>Campañas activas:</strong> {campanas.map((c) => c.nombre).join(' · ')}
        </div>
      )}

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={9} />}>
        <ProductosTable {...sp} />
      </Suspense>
    </PageShell>
  );
}

type ProdRow = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  destacado: boolean | null;
  categorias: { id: string; nombre: string } | null;
  campanas: { id: string; nombre: string } | null;
  productos_variantes: { id: string; sku: string; talla: string; precio_publico: number | null }[];
  productos_publicacion: { publicado: boolean; destacado_web: boolean | null }[];
};

async function ProductosTable({ q, cat, estado, web, sin_categoria }: SP) {
  const sb = await createClient();
  let query = sb
    .from('productos')
    .select(
      'id, codigo, nombre, activo, destacado, categorias(id, nombre), campanas(id, nombre), productos_variantes(id, sku, talla, precio_publico), productos_publicacion(publicado, destacado_web)',
    )
    .order('nombre')
    .limit(500);
  if (q) query = query.ilike('nombre', `%${q}%`);
  if (cat) query = query.eq('categoria_id', cat);
  if (sin_categoria === '1') query = query.is('categoria_id', null);
  if (estado === 'activo') query = query.eq('activo', true);
  if (estado === 'inactivo') query = query.eq('activo', false);
  const { data } = await query;
  let productos = ((data ?? []) as unknown as ProdRow[]);
  if (web === 'si') productos = productos.filter((p) => p.productos_publicacion?.[0]?.publicado);
  if (web === 'no') productos = productos.filter((p) => !p.productos_publicacion?.[0]?.publicado);

  // Cargar stock por variante para todas las variantes de los productos visibles.
  // Se batchea en chunks porque con muchos productos (límite 500) la lista de
  // UUIDs puede exceder el largo máximo de URL de PostgREST y la query falla
  // sin error visible (skeleton infinito en la página).
  const todasLasVariantes = productos.flatMap((p) => p.productos_variantes.map((v) => v.id));
  const stockPorVariante = new Map<string, number>();
  if (todasLasVariantes.length > 0) {
    const CHUNK = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < todasLasVariantes.length; i += CHUNK) {
      chunks.push(todasLasVariantes.slice(i, i + CHUNK));
    }
    try {
      const results = await Promise.all(
        chunks.map((c) =>
          sb.from('v_stock_variante_total').select('variante_id, stock_total').in('variante_id', c),
        ),
      );
      for (const { data: stocks } of results) {
        for (const s of stocks ?? []) {
          stockPorVariante.set(s.variante_id as string, Number(s.stock_total ?? 0));
        }
      }
    } catch (e) {
      // Si la vista de stock falla por cualquier motivo, seguimos renderizando
      // sin badges de stock en lugar de colgar la página entera.
      console.warn('[productos] no se pudo cargar stock_total:', (e as Error).message);
    }
  }

  if (productos.length === 0) {
    return (
      <EmptyState
        icon={<Shirt className="h-6 w-6" />}
        title="Sin productos"
        description={q ? `No hay productos que coincidan con "${q}".` : 'No hay productos con los filtros seleccionados.'}
        action={
          <Link href="/productos/nuevo">
            <Button variant="premium">
              <Plus className="h-4 w-4" /> Nuevo producto
            </Button>
          </Link>
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
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Campaña</TableHead>
              <TableHead>Tallas</TableHead>
              <TableHead className="text-right">Precio desde</TableHead>
              <TableHead>Web</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productos.map((p) => {
              const variantes = p.productos_variantes ?? [];
              const precioMin = variantes
                .map((v) => Number(v.precio_publico ?? 0))
                .filter((x) => x > 0)
                .sort((a, b) => a - b)[0];
              const pub = p.productos_publicacion?.[0];
              return (
                <TableRow key={p.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/productos/${p.id}`} className="hover:text-happy-600">
                      {p.nombre}
                    </Link>
                    {p.destacado && (
                      <Badge variant="default" className="ml-2 text-[9px]">
                        ⭐ Destacado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.categorias?.nombre ? (
                      <Badge variant="secondary">{p.categorias.nombre}</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.campanas?.nombre ? (
                      <Badge variant="default" className="bg-happy-500">
                        {p.campanas.nombre}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {variantes.length === 0 ? (
                      <Link href={`/productos/${p.id}`}>
                        <Badge
                          variant="destructive"
                          className="gap-1 text-[10px] hover:bg-amber-600"
                          title="Este producto no tiene tallas configuradas. Click para configurar."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Falta variantes
                        </Badge>
                      </Link>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {[...variantes]
                          .sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla))
                          .slice(0, 11)
                          .map((v) => {
                            const stock = stockPorVariante.get(v.id) ?? 0;
                            const sinStock = stock <= 0;
                            return (
                              <Badge
                                key={v.sku}
                                variant={sinStock ? 'destructive' : 'outline'}
                                className={`text-[10px] ${sinStock ? 'line-through opacity-80' : ''}`}
                                title={sinStock ? `Talla ${v.talla.replace('T', '')} sin stock` : `Stock: ${stock}`}
                              >
                                {v.talla.replace('T', '')}
                              </Badge>
                            );
                          })}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {precioMin ? formatPEN(precioMin) : '—'}
                  </TableCell>
                  <TableCell>
                    {pub?.publicado ? (
                      <Badge variant="success" className="gap-1">
                        <Globe className="h-3 w-3" /> Publicado
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Oculto
                      </Badge>
                    )}
                    {pub?.destacado_web && (
                      <Badge variant="default" className="ml-1 text-[9px]">
                        Home
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.activo ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/productos/${p.id}`}>
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
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
