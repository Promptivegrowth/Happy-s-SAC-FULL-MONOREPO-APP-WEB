import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';

export const metadata = { title: 'Categorías' };
export const dynamic = 'force-dynamic';

export default async function CategoriasPage() {
  const sb = await createClient();
  const { data } = await sb.from('categorias').select('id, codigo, nombre, slug, icono, publicar_en_web, orden_web, activo').order('orden_web');
  return (
    <PageShell title="Categorías" description="Categorías que se muestran en la tienda web y agrupan los disfraces.">
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Slug</TableHead>
            <TableHead>Web</TableHead><TableHead>Orden</TableHead><TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data?.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                <TableCell className="font-medium">{c.icono} {c.nombre}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">/{c.slug}</TableCell>
                <TableCell>{c.publicar_en_web ? <Badge variant="success">Visible</Badge> : <Badge variant="secondary">Oculta</Badge>}</TableCell>
                <TableCell>{c.orden_web}</TableCell>
                <TableCell>{c.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Inactiva</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
