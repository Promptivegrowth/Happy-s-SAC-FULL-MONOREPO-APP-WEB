import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { FileText, Pencil } from 'lucide-react';

export const metadata = { title: 'Recetas (BOM)' };
export const dynamic = 'force-dynamic';

export default async function RecetasPage() {
  const sb = await createClient();
  const { data } = await sb.from('recetas')
    .select('id, version, activa, fecha_vigencia_desde, productos(id, codigo, nombre), recetas_lineas(id)')
    .order('updated_at', { ascending: false }).limit(200);

  return (
    <PageShell title="Recetas (BOM)" description="Listas de materiales por producto y talla. Versionadas. Editables.">
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Sin recetas"
          description="Las recetas se crean automáticamente con cada producto. Importa los Excels o crea un producto."
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Producto</TableHead><TableHead>Código</TableHead><TableHead>Versión</TableHead>
              <TableHead className="text-right">Líneas BOM</TableHead><TableHead>Vigencia</TableHead><TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((r) => {
                const p = (r as unknown as { productos?: { id: string; nombre: string; codigo: string } }).productos;
                const ln = (r as unknown as { recetas_lineas?: { id: string }[] }).recetas_lineas ?? [];
                return (
                  <TableRow key={r.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-medium">
                      <Link href={`/recetas/${r.id}`} className="hover:text-happy-600">{p?.nombre}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p?.codigo}</TableCell>
                    <TableCell><Badge variant="outline">{r.version}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{ln.length}</TableCell>
                    <TableCell className="text-sm">{r.fecha_vigencia_desde}</TableCell>
                    <TableCell>{r.activa ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Histórica</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/recetas/${r.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
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
