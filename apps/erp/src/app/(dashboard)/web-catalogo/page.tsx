import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Globe } from 'lucide-react';

export const metadata = { title: 'Publicación Web' };
export const dynamic = 'force-dynamic';

export default async function WebCatalogoPage() {
  const sb = await createClient();
  const { data: pubs } = await sb.from('productos_publicacion')
    .select('producto_id, publicado, slug, destacado_web, orden_web, productos(codigo, nombre, imagen_principal_url)')
    .order('orden_web');

  return (
    <PageShell
      title="Publicación Web"
      description="Productos del ERP que se muestran en la tienda disfraceshappys.com. Toggle 1-clic para publicar/ocultar."
      actions={
        <Link href="/web-catalogo/banners">
          <Badge variant="outline" className="cursor-pointer"><Globe className="mr-1 h-3 w-3" /> Banners web</Badge>
        </Link>
      }
    >
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Producto</TableHead><TableHead>Slug</TableHead>
            <TableHead>Estado</TableHead><TableHead>Destacado</TableHead><TableHead>Orden</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(pubs ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">Aún no hay productos publicados. Desde el detalle de producto activa “Publicar en web”.</TableCell></TableRow>}
            {pubs?.map((p) => {
              const prod = (p as unknown as { productos?: { nombre: string; codigo: string } }).productos;
              return (
                <TableRow key={p.producto_id}>
                  <TableCell className="font-medium">{prod?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">/{p.slug}</TableCell>
                  <TableCell>{p.publicado ? <Badge variant="success">Publicado</Badge> : <Badge variant="secondary">Oculto</Badge>}</TableCell>
                  <TableCell>{p.destacado_web ? <Badge>★ Destacado</Badge> : '—'}</TableCell>
                  <TableCell>{p.orden_web}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
