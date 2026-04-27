import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Tags, Pencil, Globe, Info } from 'lucide-react';
import { ToggleCategoriaActivo } from './toggle-activo-client';
import { AccionesMasivasCategoria } from './acciones-masivas-client';

export const metadata = { title: 'Categorías' };
export const dynamic = 'force-dynamic';

type CategoriaRow = {
  id: string;
  codigo: string;
  nombre: string;
  slug: string | null;
  icono: string | null;
  publicar_en_web: boolean | null;
  orden_web: number | null;
  activo: boolean | null;
};

export default async function CategoriasPage() {
  const sb = await createClient();

  // Cargamos categorías + productos (id, categoria_id) y publicaciones por separado.
  // Mergeamos in-memory para evitar problemas de RLS con embedded joins.
  const [{ data: cats }, { data: prods }, { data: pubs }] = await Promise.all([
    sb.from('categorias').select('id, codigo, nombre, slug, icono, publicar_en_web, orden_web, activo').order('orden_web'),
    sb.from('productos').select('id, categoria_id').eq('activo', true),
    sb.from('productos_publicacion').select('producto_id, publicado'),
  ]);

  const categorias = (cats ?? []) as CategoriaRow[];
  const totalPorCategoria = new Map<string, number>();
  const idsPorCategoria = new Map<string, Set<string>>();
  for (const p of prods ?? []) {
    if (!p.categoria_id) continue;
    totalPorCategoria.set(p.categoria_id, (totalPorCategoria.get(p.categoria_id) ?? 0) + 1);
    const set = idsPorCategoria.get(p.categoria_id) ?? new Set<string>();
    set.add(p.id as string);
    idsPorCategoria.set(p.categoria_id, set);
  }
  const publicadosSet = new Set(
    (pubs ?? []).filter((p) => p.publicado).map((p) => p.producto_id as string),
  );

  function publicadosDeCategoria(catId: string): number {
    const ids = idsPorCategoria.get(catId);
    if (!ids) return 0;
    let n = 0;
    for (const id of ids) if (publicadosSet.has(id)) n++;
    return n;
  }

  const totalProductos = (prods ?? []).length;
  const totalPublicados = publicadosSet.size;

  return (
    <PageShell
      title="Categorías"
      description="Categorías que se muestran en la tienda web y agrupan los disfraces."
      actions={
        <Link href="/categorias/nuevo">
          <Button variant="premium">
            <Plus className="h-4 w-4" /> Nueva categoría
          </Button>
        </Link>
      }
    >
      {/* Banner explicativo del modelo de visibilidad */}
      <div className="flex items-start gap-3 rounded-lg border border-corp-200 bg-corp-50/40 p-4 text-sm">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-corp-700" />
        <div className="space-y-1 text-slate-700">
          <p className="font-semibold text-corp-900">Cómo funciona la visibilidad en la web</p>
          <p className="text-xs">
            Un disfraz se ve en la web solo si <strong>(1) su categoría está activa</strong> Y{' '}
            <strong>(2) el producto tiene "Publicar en web" activado</strong>.
          </p>
          <ul className="ml-4 list-disc text-xs text-slate-600">
            <li>
              <strong>Apagar la categoría</strong> oculta TODOS sus productos de la web instantáneamente
              (cascada). Útil para apagar temporadas (Halloween, Fiestas Patrias, etc.).
            </li>
            <li>
              <strong>Toggle individual de producto</strong> (en /web-catalogo o detalle del producto)
              decide si ese SKU específico se muestra. Permite ocultar productos sin variantes,
              descontinuados, etc.
            </li>
            <li>
              Acción masiva <strong>"Publicar todos"</strong> (icono ⋮ a la derecha): publica de un
              click todos los productos de la categoría sin tocarlos uno por uno.
            </li>
          </ul>
        </div>
      </div>

      {/* Métricas globales */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Productos activos totales</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{totalProductos}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Publicados en web</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{totalPublicados}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Sin publicar</p>
          <p className="mt-1 font-display text-2xl font-semibold text-slate-500">
            {totalProductos - totalPublicados}
          </p>
        </Card>
      </div>

      {categorias.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Aún no hay categorías"
          description="Crea categorías para organizar los disfraces y mostrarlos en la tienda."
          action={
            <Link href="/categorias/nuevo">
              <Button variant="premium">
                <Plus className="h-4 w-4" /> Crear primera categoría
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
                  <TableHead>Slug</TableHead>
                  <TableHead className="text-right">Productos</TableHead>
                  <TableHead className="text-right">Publicados</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Categoría activa</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorias.map((c) => {
                  const total = totalPorCategoria.get(c.id) ?? 0;
                  const publicados = publicadosDeCategoria(c.id);
                  const cobertura = total > 0 ? Math.round((publicados / total) * 100) : 0;
                  return (
                    <TableRow key={c.id} className="hover:bg-happy-50/50">
                      <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/categorias/${c.id}`} className="hover:text-happy-600">
                          {c.icono} {c.nombre}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">/{c.slug}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{total}</TableCell>
                      <TableCell className="text-right">
                        {total === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : publicados === 0 ? (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            0 / {total}
                          </Badge>
                        ) : publicados === total ? (
                          <Badge variant="success" className="gap-1 font-mono text-[10px]">
                            <Globe className="h-3 w-3" /> {publicados} / {total}
                          </Badge>
                        ) : (
                          <Badge variant="default" className="bg-amber-500 font-mono text-[10px] hover:bg-amber-500">
                            {publicados} / {total} ({cobertura}%)
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{c.orden_web ?? 100}</TableCell>
                      <TableCell>
                        <ToggleCategoriaActivo id={c.id} activo={!!c.activo} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <AccionesMasivasCategoria
                            categoriaId={c.id}
                            total={total}
                            publicados={publicados}
                          />
                          <Link href={`/categorias/${c.id}`}>
                            <Button variant="ghost" size="sm" title="Editar">
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
