import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Globe, ExternalLink, Pencil } from 'lucide-react';
import { ToggleClient } from './toggle-client';

export const metadata = { title: 'Publicación Web' };
export const dynamic = 'force-dynamic';

export default async function WebCatalogoPage() {
  const sb = await createClient();
  const { data: rows } = await sb.from('productos')
    .select('id, codigo, nombre, productos_publicacion(publicado, slug, destacado_web, orden_web, titulo_web)')
    .eq('activo', true)
    .order('nombre');

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3001';

  return (
    <PageShell
      title="Publicación Web"
      description="Toggle 1-clic para publicar/ocultar productos en disfraceshappys.com"
      actions={
        <a href={webUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="outline"><Globe className="h-4 w-4" /> Abrir tienda</Button>
        </a>
      }
    >
      {(rows ?? []).length === 0 ? (
        <EmptyState
          icon={<Globe className="h-6 w-6" />}
          title="Sin productos en el catálogo"
          description="Crea productos primero en /productos."
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Destacado</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Estado web</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows?.map((p) => {
                const pubs = (p as unknown as { productos_publicacion?: { publicado: boolean; slug: string | null; destacado_web: boolean; orden_web: number; titulo_web: string | null }[] }).productos_publicacion ?? [];
                const pub = pubs[0];
                return (
                  <TableRow key={p.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-medium">
                      <Link href={`/productos/${p.id}`} className="hover:text-happy-600">
                        {pub?.titulo_web ?? p.nombre}
                      </Link>
                      <div className="font-mono text-[10px] text-slate-400">{p.codigo}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">{pub?.slug ? `/${pub.slug}` : '—'}</TableCell>
                    <TableCell>{pub?.destacado_web ? <Badge>★</Badge> : '—'}</TableCell>
                    <TableCell>{pub?.orden_web ?? 100}</TableCell>
                    <TableCell><ToggleClient productoId={p.id} publicado={pub?.publicado ?? false} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {pub?.publicado && pub.slug && (
                          <a href={`${webUrl}/productos/${pub.slug}`} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm" title="Ver en web"><ExternalLink className="h-3.5 w-3.5" /></Button>
                          </a>
                        )}
                        <Link href={`/productos/${p.id}`}>
                          <Button variant="ghost" size="sm" title="Editar publicación"><Pencil className="h-3.5 w-3.5" /></Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </PageShell>
  );
}
