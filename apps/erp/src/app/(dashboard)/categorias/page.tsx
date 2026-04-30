import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Tags, Pencil, Globe, Info, AlertTriangle, ArrowRight } from 'lucide-react';
import { ToggleCategoriaActivo } from './toggle-activo-client';
import { AccionesMasivasCategoria } from './acciones-masivas-client';
import { PublicarTodoElCatalogoButton } from './publicar-todo-client';

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
  // Productos sin categoría asignada (huérfanos): no se publican hasta que se les asigne categoría.
  const huerfanos = (prods ?? []).filter((p) => p.categoria_id == null).length;
  // Para el botón "Publicar todo el catálogo" descontamos los huérfanos del total
  // (ellos no son publicables hasta tener categoría).
  const sinPublicarPublicables = Math.max(0, (totalProductos - huerfanos) - totalPublicados);

  return (
    <PageShell
      title="Categorías"
      description="Categorías que se muestran en la tienda web y agrupan los disfraces."
      actions={
        <div className="flex items-center gap-2">
          <PublicarTodoElCatalogoButton totalSinPublicar={sinPublicarPublicables} />
          <Link href="/categorias/nuevo">
            <Button variant="premium">
              <Plus className="h-4 w-4" /> Nueva categoría
            </Button>
          </Link>
        </div>
      }
    >
      {/* Alerta huérfanos: productos sin categoría asignada que no se pueden publicar */}
      {huerfanos > 0 && (
        <Link
          href="/productos?sin_categoria=1"
          className="group flex items-start gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 transition hover:border-amber-400 hover:bg-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 space-y-0.5 text-sm">
            <p className="font-bold text-amber-900">
              ⚠️ {huerfanos} producto{huerfanos === 1 ? '' : 's'} sin categoría asignada
            </p>
            <p className="text-xs text-amber-800">
              Estos productos NO se publican en la web hasta que les asignes categoría. Click acá para verlos y categorizarlos.
            </p>
          </div>
          <span className="flex items-center gap-1 self-center text-sm font-bold text-amber-700">
            Asignar categoría <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </span>
        </Link>
      )}

      {/* Banner explicativo del modelo de visibilidad (1 capa) */}
      <div className="flex items-start gap-3 rounded-lg border border-corp-200 bg-corp-50/40 p-4 text-sm">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-corp-700" />
        <div className="space-y-1 text-slate-700">
          <p className="font-semibold text-corp-900">Cómo funciona la publicación en la web</p>
          <p className="text-xs">
            El <strong>toggle "Categoría activa"</strong> publica o despublica TODOS los productos
            de la categoría en la web. Es la única acción que necesitás para una categoría completa.
          </p>
          <ul className="ml-4 list-disc text-xs text-slate-600">
            <li>
              <strong>ENCENDER</strong> → publica todos los productos de la categoría en la web.
            </li>
            <li>
              <strong>APAGAR</strong> → despublica todos los productos de la categoría en la web.
              Al volver a encender, se publican de nuevo automáticamente.
            </li>
            <li>
              <strong>Botón verde "Publicar todo el catálogo"</strong> arriba: enciende todas las
              categorías y publica todos los productos de un click (excepto los huérfanos sin
              categoría asignada — esos requieren acción aparte).
            </li>
            <li>
              ¿Necesitás ocultar UN producto puntual sin afectar al resto de la categoría? Andá
              a <code className="rounded bg-slate-100 px-1">/web-catalogo</code> y usá el toggle
              individual de ese producto.
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
