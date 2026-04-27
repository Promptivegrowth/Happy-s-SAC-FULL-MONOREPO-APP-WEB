import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Tags, Pencil } from 'lucide-react';
import { ToggleCategoriaActivo } from './toggle-activo-client';

export const metadata = { title: 'Categorías' };
export const dynamic = 'force-dynamic';

export default async function CategoriasPage() {
  const sb = await createClient();
  const { data } = await sb.from('categorias').select('id, codigo, nombre, slug, icono, publicar_en_web, orden_web, activo').order('orden_web');

  return (
    <PageShell
      title="Categorías"
      description="Categorías que se muestran en la tienda web y agrupan los disfraces. Apagar una categoría oculta automáticamente todos sus productos de la web (sin tocar el toggle individual de cada uno)."
      actions={
        <Link href="/categorias/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nueva categoría</Button></Link>
      }
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Tags className="h-6 w-6" />}
          title="Aún no hay categorías"
          description="Crea categorías para organizar los disfraces y mostrarlos en la tienda."
          action={<Link href="/categorias/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Crear primera categoría</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Slug</TableHead>
              <TableHead>Web</TableHead><TableHead>Orden</TableHead><TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((c) => (
                <TableRow key={c.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/categorias/${c.id}`} className="hover:text-happy-600">
                      {c.icono} {c.nombre}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">/{c.slug}</TableCell>
                  <TableCell>{c.publicar_en_web ? <Badge variant="success">Visible</Badge> : <Badge variant="secondary">Oculta</Badge>}</TableCell>
                  <TableCell>{c.orden_web}</TableCell>
                  <TableCell><ToggleCategoriaActivo id={c.id} activo={!!c.activo} /></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/categorias/${c.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </PageShell>
  );
}
