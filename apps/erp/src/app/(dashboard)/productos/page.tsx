import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Button } from '@happy/ui/button';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN } from '@happy/lib';
import { PageShell } from '@/components/page-shell';
import { Plus, Search, Shirt, Pencil, Globe } from 'lucide-react';

export const metadata = { title: 'Productos' };
export const dynamic = 'force-dynamic';

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const sb = await createClient();
  let query = sb
    .from('productos')
    .select('id, codigo, nombre, version_ficha, activo, categorias(nombre), productos_variantes(id, sku, talla, precio_publico), productos_publicacion(publicado)')
    .order('nombre').limit(200);
  if (q) query = query.ilike('nombre', `%${q}%`);
  const { data: productos } = await query;

  return (
    <PageShell
      title="Productos / Disfraces"
      description="Catálogo de modelos con sus variantes (talla). Aquí se crean, editan y publican en la web."
      actions={
        <Link href="/productos/nuevo">
          <Button variant="premium"><Plus className="h-4 w-4" /> Nuevo producto</Button>
        </Link>
      }
    >
      <form className="flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={q} placeholder="Buscar por nombre…" className="pl-9" />
        </div>
        <Button type="submit" variant="outline">Buscar</Button>
      </form>

      {(productos ?? []).length === 0 ? (
        <EmptyState
          icon={<Shirt className="h-6 w-6" />}
          title="Sin productos"
          description={q ? `No hay productos que coincidan con "${q}".` : 'Crea tu primer disfraz o importa los Excels iniciales.'}
          action={<Link href="/productos/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo producto</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Tallas</TableHead>
                <TableHead className="text-right">Precio desde</TableHead>
                <TableHead>Web</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos?.map((p) => {
                const variantes = (p as unknown as { productos_variantes: { sku: string; talla: string; precio_publico: number | null }[] }).productos_variantes ?? [];
                const precioMin = variantes
                  .map((v) => Number(v.precio_publico ?? 0))
                  .filter((x) => x > 0)
                  .sort((a, b) => a - b)[0];
                const cat = (p as unknown as { categorias?: { nombre: string } | null }).categorias;
                const pubs = (p as unknown as { productos_publicacion?: { publicado: boolean }[] }).productos_publicacion ?? [];
                const publicado = pubs[0]?.publicado;
                return (
                  <TableRow key={p.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/productos/${p.id}`} className="hover:text-happy-600">
                        {p.nombre}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {cat?.nombre ? <Badge variant="secondary">{cat.nombre}</Badge> : <span className="text-xs text-slate-400">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {variantes.slice(0, 8).map((v) => (
                          <Badge key={v.sku} variant="outline" className="text-[10px]">{v.talla.replace('T', '')}</Badge>
                        ))}
                        {variantes.length > 8 && <span className="text-[10px] text-slate-400">+{variantes.length - 8}</span>}
                        {variantes.length === 0 && <span className="text-[10px] text-slate-400">sin variantes</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{precioMin ? formatPEN(precioMin) : '—'}</TableCell>
                    <TableCell>
                      {publicado ? (
                        <Badge variant="success" className="gap-1"><Globe className="h-3 w-3" /> Publicado</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Oculto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/productos/${p.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
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
