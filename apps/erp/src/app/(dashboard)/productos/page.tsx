import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN } from '@happy/lib';
import { PageShell } from '@/components/page-shell';
import { SearchAutocomplete } from '@/components/search-autocomplete';
import { Plus, Shirt, Pencil, Globe } from 'lucide-react';

export const metadata = { title: 'Productos' };
export const dynamic = 'force-dynamic';

type CatRow = { id: string; nombre: string };
type CampRow = { id: string; nombre: string; activa: boolean };
type ProdRow = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  destacado: boolean | null;
  categorias: { id: string; nombre: string } | null;
  campanas: { id: string; nombre: string } | null;
  productos_variantes: { sku: string; talla: string; precio_publico: number | null }[];
  productos_publicacion: { publicado: boolean; destacado_web: boolean | null }[];
};

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; estado?: string; web?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const cat = sp.cat?.trim() ?? '';
  const estado = sp.estado?.trim() ?? '';
  const web = sp.web?.trim() ?? '';
  const sb = await createClient();

  // Categorías + campañas para filtros
  const [{ data: catsData }, { data: campsData }] = await Promise.all([
    sb.from('categorias').select('id, nombre').eq('activo', true).order('nombre'),
    sb.from('campanas').select('id, nombre, activa').eq('activa', true).order('nombre'),
  ]);
  const categorias = (catsData ?? []) as CatRow[];
  const campanas = (campsData ?? []) as CampRow[];

  // Lista corta para autocomplete (todos los productos activos)
  const { data: indexData } = await sb
    .from('productos')
    .select('id, codigo, nombre, categorias(nombre)')
    .eq('activo', true)
    .order('nombre')
    .limit(500);
  const indexItems = (indexData ?? []).map((p) => {
    const c = (p as unknown as { categorias?: { nombre: string } | null }).categorias;
    return {
      id: p.id,
      label: p.nombre,
      sublabel: [p.codigo, c?.nombre].filter(Boolean).join(' · '),
      href: `/productos/${p.id}`,
    };
  });

  // Query principal
  let query = sb
    .from('productos')
    .select(
      'id, codigo, nombre, activo, destacado, categorias(id, nombre), campanas(id, nombre), productos_variantes(sku, talla, precio_publico), productos_publicacion(publicado, destacado_web)',
    )
    .order('nombre')
    .limit(200);
  if (q) query = query.ilike('nombre', `%${q}%`);
  if (cat) query = query.eq('categoria_id', cat);
  if (estado === 'activo') query = query.eq('activo', true);
  if (estado === 'inactivo') query = query.eq('activo', false);
  const { data } = await query;
  let productos = ((data ?? []) as unknown as ProdRow[]);
  if (web === 'si') productos = productos.filter((p) => p.productos_publicacion?.[0]?.publicado);
  if (web === 'no') productos = productos.filter((p) => !p.productos_publicacion?.[0]?.publicado);

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (q) sp2.set('q', q);
    if (cat) sp2.set('cat', cat);
    if (estado) sp2.set('estado', estado);
    if (web) sp2.set('web', web);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

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
        <Link href="/productos">
          <Badge variant={!cat && !estado && !web ? 'default' : 'outline'} className="cursor-pointer">
            Todos
          </Badge>
        </Link>
        <Link href={chipUrl({ web: 'si' })}>
          <Badge variant={web === 'si' ? 'success' : 'outline'} className="cursor-pointer gap-1">
            <Globe className="h-3 w-3" /> Publicados
          </Badge>
        </Link>
        <Link href={chipUrl({ web: 'no' })}>
          <Badge variant={web === 'no' ? 'default' : 'outline'} className="cursor-pointer">
            Sin publicar
          </Badge>
        </Link>
        <Link href={chipUrl({ estado: estado === 'inactivo' ? '' : 'inactivo' })}>
          <Badge variant={estado === 'inactivo' ? 'destructive' : 'outline'} className="cursor-pointer">
            Inactivos
          </Badge>
        </Link>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Categoría:</span>
        <Link href={chipUrl({ cat: '' })}>
          <Badge variant={!cat ? 'default' : 'outline'} className="cursor-pointer">
            Todas
          </Badge>
        </Link>
        {categorias.map((c) => (
          <Link key={c.id} href={chipUrl({ cat: c.id })}>
            <Badge variant={cat === c.id ? 'default' : 'outline'} className="cursor-pointer">
              {c.nombre}
            </Badge>
          </Link>
        ))}
      </div>

      {campanas.length > 0 && (
        <div className="text-xs text-slate-500">
          <strong>Campañas activas:</strong> {campanas.map((c) => c.nombre).join(' · ')}
        </div>
      )}

      {productos.length === 0 ? (
        <EmptyState
          icon={<Shirt className="h-6 w-6" />}
          title="Sin productos"
          description={q ? `No hay productos que coincidan con "${q}".` : 'Crea tu primer disfraz o importa los Excels iniciales.'}
          action={
            <Link href="/productos/nuevo">
              <Button variant="premium">
                <Plus className="h-4 w-4" /> Nuevo producto
              </Button>
            </Link>
          }
        />
      ) : (
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
                        <div className="flex flex-wrap gap-1">
                          {variantes.slice(0, 8).map((v) => (
                            <Badge key={v.sku} variant="outline" className="text-[10px]">
                              {v.talla.replace('T', '')}
                            </Badge>
                          ))}
                          {variantes.length > 8 && (
                            <span className="text-[10px] text-slate-400">+{variantes.length - 8}</span>
                          )}
                          {variantes.length === 0 && (
                            <span className="text-[10px] text-slate-400">sin variantes</span>
                          )}
                        </div>
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
      )}
    </PageShell>
  );
}
