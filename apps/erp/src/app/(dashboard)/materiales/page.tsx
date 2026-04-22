import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN } from '@happy/lib';
import { PageShell } from '@/components/page-shell';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';

export const metadata = { title: 'Materiales' };
export const dynamic = 'force-dynamic';

export default async function MaterialesPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  let q = sb.from('materiales').select('id, codigo, nombre, categoria, precio_unitario, activo, unidades_medida!unidad_compra_id(codigo)').order('categoria').order('nombre').limit(500);
  if (sp.q) q = q.ilike('nombre', `%${sp.q}%`);
  if (sp.cat) q = q.eq('categoria', sp.cat);
  const { data } = await q;

  return (
    <PageShell
      title="Materiales"
      description="Telas, avíos e insumos utilizados en la producción. Editables desde aquí."
      actions={
        <Link href="/materiales/nuevo"><Button><Plus className="h-4 w-4" /> Nuevo material</Button></Link>
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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    Sin materiales. Corre <code className="rounded bg-slate-100 px-1">pnpm db:import-excel</code>.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((m) => {
                const u = (m as unknown as { unidades_medida?: { codigo: string } }).unidades_medida;
                return (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.codigo}</TableCell>
                  <TableCell className="font-medium">{m.nombre}</TableCell>
                  <TableCell><Badge variant="secondary">{m.categoria}</Badge></TableCell>
                  <TableCell className="text-sm">{u?.codigo ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">{formatPEN(Number(m.precio_unitario ?? 0))}</TableCell>
                  <TableCell>{m.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                </TableRow>
              );})}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
