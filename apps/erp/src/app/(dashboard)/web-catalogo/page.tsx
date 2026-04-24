import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Globe, ExternalLink, Pencil, Star } from 'lucide-react';
import { ToggleClient } from './toggle-client';

export const metadata = { title: 'Publicación Web' };
export const dynamic = 'force-dynamic';

export default async function WebCatalogoPage() {
  const sb = await createClient();

  // Dos queries separadas + merge in-memory: el embedded join puede devolver null
  // por RLS aunque el row exista, dando falso "Oculto". Esto es más predecible.
  const [{ data: productos }, { data: pubs }] = await Promise.all([
    sb.from('productos').select('id, codigo, nombre').eq('activo', true).order('nombre'),
    sb
      .from('productos_publicacion')
      .select('producto_id, publicado, slug, destacado_web, orden_web, titulo_web, publicado_en'),
  ]);

  const pubMap = new Map<
    string,
    {
      publicado: boolean;
      slug: string | null;
      destacado_web: boolean | null;
      orden_web: number | null;
      titulo_web: string | null;
      publicado_en: string | null;
    }
  >();
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

  const totalPublicados = (pubs ?? []).filter((p) => p.publicado).length;
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';

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
        <Badge variant="secondary">
          {(productos ?? []).length - totalPublicados} ocultos
        </Badge>
      </div>

      {(productos ?? []).length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title="Sin productos en el catálogo"
          description="Crea productos primero en /productos."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Destacado</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Estado web</TableHead>
                  <TableHead>Publicado el</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productos?.map((p) => {
                  const pub = pubMap.get(p.id);
                  return (
                    <TableRow key={p.id} className="hover:bg-happy-50/50">
                      <TableCell className="font-medium">
                        <Link href={`/productos/${p.id}`} className="hover:text-happy-600">
                          {pub?.titulo_web ?? p.nombre}
                        </Link>
                        <div className="font-mono text-[10px] text-slate-400">{p.codigo}</div>
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
