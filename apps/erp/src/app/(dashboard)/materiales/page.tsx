import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN } from '@happy/lib';
import { PageShell } from '@/components/page-shell';
import { Plus, Search, Boxes, Pencil } from 'lucide-react';

export const metadata = { title: 'Materiales' };
export const dynamic = 'force-dynamic';

export default async function MaterialesPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  let q = sb.from('materiales')
    .select('id, codigo, nombre, categoria, precio_unitario, activo, unidades_medida!unidad_compra_id(codigo)')
    .order('categoria').order('nombre').limit(500);
  if (sp.q) q = q.ilike('nombre', `%${sp.q}%`);
  if (sp.cat) q = q.eq('categoria', sp.cat as 'TELA' | 'AVIO' | 'INSUMO' | 'EMPAQUE');
  const { data } = await q;

  return (
    <PageShell
      title="Materiales"
      description="Telas, avíos e insumos. Editables desde aquí; aparecen en las recetas (BOM)."
      actions={
        <Link href="/materiales/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo material</Button></Link>
      }
    >
      <form className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar…" className="w-64 pl-9" />
        </div>
        {['TELA','AVIO','INSUMO','EMPAQUE'].map((c) => (
          <Link key={c} href={`?cat=${c}`}>
            <Badge variant={sp.cat === c ? 'default' : 'outline'} className="cursor-pointer">{c}</Badge>
          </Link>
        ))}
        <Link href="/materiales"><Badge variant="secondary" className="cursor-pointer">Todos</Badge></Link>
      </form>

      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="Sin materiales"
          description="Carga los Excels iniciales o crea materiales manualmente."
          action={<Link href="/materiales/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Crear material</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((m) => {
                const u = (m as unknown as { unidades_medida?: { codigo: string } | null }).unidades_medida;
                return (
                  <TableRow key={m.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-mono text-xs">{m.codigo}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/materiales/${m.id}`} className="hover:text-happy-600">{m.nombre}</Link>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{m.categoria}</Badge></TableCell>
                    <TableCell className="text-sm">{u?.codigo ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{formatPEN(Number(m.precio_unitario ?? 0))}</TableCell>
                    <TableCell>{m.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/materiales/${m.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
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
