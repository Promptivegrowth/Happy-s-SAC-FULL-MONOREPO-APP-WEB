import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';

export const metadata = { title: 'Recetas (BOM)' };
export const dynamic = 'force-dynamic';

export default async function RecetasPage() {
  const sb = await createClient();
  const { data } = await sb.from('recetas').select('id, version, activa, fecha_vigencia_desde, productos(codigo, nombre)').order('updated_at', { ascending: false }).limit(100);
  return (
    <PageShell title="Recetas (BOM)" description="Listas de materiales por producto y talla. Versionadas. Editables.">
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Producto</TableHead><TableHead>Versión</TableHead><TableHead>Vigencia</TableHead><TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-slate-500">Sin recetas. Importa con <code>pnpm db:import-excel</code>.</TableCell></TableRow>}
            {data?.map((r) => {
              const p = (r as unknown as { productos?: { nombre: string; codigo: string } }).productos;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{p?.nombre} <span className="ml-2 font-mono text-xs text-slate-500">{p?.codigo}</span></TableCell>
                  <TableCell><Badge variant="outline">{r.version}</Badge></TableCell>
                  <TableCell className="text-sm">{r.fecha_vigencia_desde}</TableCell>
                  <TableCell>{r.activa ? <Badge variant="success">Activa</Badge> : <Badge variant="secondary">Histórica</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
