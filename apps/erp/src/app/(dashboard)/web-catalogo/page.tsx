import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { FilterChip } from '@/components/filter-chip';
import { Globe, ExternalLink, Pencil, Star, Search, AlertTriangle } from 'lucide-react';
import { ToggleClient } from './toggle-client';

export const metadata = { title: 'Publicación Web' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; estado?: string; cat?: string; destacado?: string; sin_categoria?: string };

type ProductoRow = {
  id: string;
  codigo: string;
  nombre: string;
  categoria_id: string | null;
  categorias: { id: string; nombre: string } | null;
};

type PubData = {
  publicado: boolean;
  slug: string | null;
  destacado_web: boolean | null;
  orden_web: number | null;
  titulo_web: string | null;
  publicado_en: string | null;
};

export default async function WebCatalogoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  // Dos queries separadas + merge in-memory: el embedded join puede devolver
  // null por RLS aunque el row exista, dando falso "Oculto". Esto es más
  // predecible (mismo comentario que tenía la versión anterior).
  // Para categorías traemos TODAS (activas + inactivas) para que los chips
  // de filtro sigan funcionando aunque el cliente apague alguna.
  const [{ data: productosRaw }, { data: pubs }, { data: categoriasRaw }] = await Promise.all([
    sb
      .from('productos')
      .select('id, codigo, nombre, categoria_id, categorias!productos_categoria_id_fkey(id, nombre)')
      .eq('activo', true)
      .order('nombre'),
    sb
      .from('productos_publicacion')
      .select('producto_id, publicado, slug, destacado_web, orden_web, titulo_web, publicado_en'),
    sb.from('categorias').select('id, nombre, activo').order('nombre'),
  ]);

  const productos = ((productosRaw ?? []) as unknown as ProductoRow[]);
  const categorias = ((categoriasRaw ?? []) as { id: string; nombre: string; activo: boolean | null }[]);

  const pubMap = new Map<string, PubData>();
  for (const p of pubs ?? []) {
    pubMap.set(p.producto_id as string, {
      publicado: !!p.publicado,
      slug: p.slug,
      destacado_web: p.destacado_web,
      orden_web: p.orden_web,
      titulo_web: p.titulo_web,
      publicado_en: p.publicado_en,
    });
  }

  // Stats globales (siempre sobre el conjunto SIN filtrar — para que los
  // contadores arriba no varíen al cambiar filtros).
  const totalPublicados = (pubs ?? []).filter((p) => p.publicado).length;
  const totalOcultos = productos.length - totalPublicados;
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';

  // Aplicar filtros in-memory.
  const filtrados = productos.filter((p) => {
    const pub = pubMap.get(p.id);
    if (sp.q && sp.q.trim()) {
      const q = sp.q.trim().toLowerCase();
      const titulo = (pub?.titulo_web ?? p.nombre).toLowerCase();
      const codigo = p.codigo.toLowerCase();
      if (!titulo.includes(q) && !codigo.includes(q)) return false;
    }
    if (sp.estado === 'publicados' && !pub?.publicado) return false;
    if (sp.estado === 'ocultos' && pub?.publicado) return false;
    if (sp.destacado === '1' && !pub?.destacado_web) return false;
    if (sp.sin_categoria === '1' && p.categoria_id) return false;
    if (sp.cat && p.categoria_id !== sp.cat) return false;
    return true;
  });

  // Helper para componer URLs preservando los filtros vigentes.
  function chipUrl(params: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    if (sp.q) next.set('q', sp.q);
    if (sp.estado) next.set('estado', sp.estado);
    if (sp.cat) next.set('cat', sp.cat);
    if (sp.destacado) next.set('destacado', sp.destacado);
    if (sp.sin_categoria) next.set('sin_categoria', sp.sin_categoria);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return s ? `/web-catalogo?${s}` : '/web-catalogo';
  }

  const filtrosActivos = Boolean(sp.q || sp.estado || sp.cat || sp.destacado || sp.sin_categoria);

  return (
    <PageShell
      title="Publicación Web"
      description="Toggle 1-clic para publicar/ocultar productos en disfraceshappys.com"
      actions={
        <a href={webUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline">
            <Globe className="h-4 w-4" /> Abrir tienda
          </Button>
        </a>
      }
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="success" className="gap-1">
          <Globe className="h-3 w-3" /> {totalPublicados} publicados
        </Badge>
        <Badge variant="secondary">{totalOcultos} ocultos</Badge>
      </div>

      {/* Buscador + chips de estado / destacado / sin categoría */}
      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" action="/web-catalogo" className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          {/* Preservar filtros activos al enviar la búsqueda */}
          {sp.estado && <input type="hidden" name="estado" value={sp.estado} />}
          {sp.cat && <input type="hidden" name="cat" value={sp.cat} />}
          {sp.destacado && <input type="hidden" name="destacado" value={sp.destacado} />}
          {sp.sin_categoria && <input type="hidden" name="sin_categoria" value={sp.sin_categoria} />}
          <Input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder="Buscar por nombre o código…"
            className="pl-9"
          />
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            href={chipUrl({ estado: '', destacado: '', sin_categoria: '', cat: '' })}
            active={!sp.estado && !sp.destacado && !sp.sin_categoria && !sp.cat}
          >
            Todos
          </FilterChip>
          <FilterChip
            href={chipUrl({ estado: 'publicados' })}
            active={sp.estado === 'publicados'}
            variant="success"
          >
            <Globe className="h-3 w-3" /> Publicados
          </FilterChip>
          <FilterChip
            href={chipUrl({ estado: 'ocultos' })}
            active={sp.estado === 'ocultos'}
            variant="secondary"
          >
            Ocultos
          </FilterChip>
          <FilterChip
            href={chipUrl({ destacado: sp.destacado === '1' ? '' : '1' })}
            active={sp.destacado === '1'}
            variant="default"
          >
            <Star className="h-3 w-3" /> Destacados (Home)
          </FilterChip>
          <FilterChip
            href={chipUrl({ sin_categoria: sp.sin_categoria === '1' ? '' : '1', cat: '' })}
            active={sp.sin_categoria === '1'}
            variant="default"
            className="bg-amber-500 hover:bg-amber-600"
          >
            <AlertTriangle className="h-3 w-3" /> Sin categoría
          </FilterChip>
        </div>
      </div>

      {/* Chips por categoría: TODAS (incluso inactivas marcadas) para no perder
          la posibilidad de gestionar productos de categorías apagadas. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Categoría:</span>
        <FilterChip href={chipUrl({ cat: '', sin_categoria: '' })} active={!sp.cat && !sp.sin_categoria}>
          Todas
        </FilterChip>
        {categorias.map((c) => {
          const inactiva = !c.activo;
          return (
            <FilterChip
              key={c.id}
              href={chipUrl({ cat: c.id, sin_categoria: '' })}
              active={sp.cat === c.id}
              className={inactiva ? 'opacity-50 grayscale' : ''}
            >
              <span title={inactiva ? 'Apagada para web — solo gestión interna' : undefined}>
                {c.nombre}
                {inactiva && <span className="ml-1 text-[9px] uppercase">off</span>}
              </span>
            </FilterChip>
          );
        })}
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title={
            filtrosActivos
              ? sp.q
                ? `Sin resultados para "${sp.q}"`
                : 'Sin productos con esos filtros'
              : 'Sin productos en el catálogo'
          }
          description={
            filtrosActivos
              ? 'Probá ajustar la búsqueda o limpiar los filtros.'
              : 'Crea productos primero en /productos.'
          }
          action={
            filtrosActivos ? (
              <Link href="/web-catalogo">
                <Button variant="outline">Limpiar filtros</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Destacado</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Estado web</TableHead>
                  <TableHead>Publicado el</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((p) => {
                  const pub = pubMap.get(p.id);
                  return (
                    <TableRow key={p.id} className="hover:bg-happy-50/50">
                      <TableCell className="font-medium">
                        <Link href={`/productos/${p.id}`} className="hover:text-happy-600">
                          {pub?.titulo_web ?? p.nombre}
                        </Link>
                        <div className="font-mono text-[10px] text-slate-400">{p.codigo}</div>
                      </TableCell>
                      <TableCell>
                        {p.categorias?.nombre ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {p.categorias.nombre}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-amber-500 text-[10px]" title="Producto huérfano — no se publica hasta asignar categoría">
                            sin categoría
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {pub?.slug ? `/${pub.slug}` : <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell>
                        {pub?.destacado_web ? (
                          <Badge variant="default" className="gap-1">
                            <Star className="h-3 w-3 fill-current" /> Home
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{pub?.orden_web ?? 100}</TableCell>
                      <TableCell>
                        <ToggleClient productoId={p.id} publicado={pub?.publicado ?? false} />
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {pub?.publicado_en
                          ? new Date(pub.publicado_en).toLocaleDateString('es-PE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {pub?.publicado && pub.slug && (
                            <a
                              href={`${webUrl}/productos/${pub.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="ghost" size="sm" title="Ver en web">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          )}
                          <Link href={`/productos/${p.id}`}>
                            <Button variant="ghost" size="sm" title="Editar publicación">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
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
