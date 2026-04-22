import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDateTime } from '@happy/lib';

export const metadata = { title: 'Libro de Reclamaciones' };
export const dynamic = 'force-dynamic';

const tono = (e: string) =>
  e === 'NUEVO' ? 'warning' :
  e === 'EN_REVISION' ? 'default' :
  e === 'RESUELTO' ? 'success' :
  'secondary';

export default async function ReclamosPage() {
  const sb = await createClient();
  const { data } = await sb.from('reclamos').select('id, numero, fecha, tipo, cliente_nombre, cliente_documento_numero, descripcion, estado').order('fecha', { ascending: false }).limit(200);

  return (
    <PageShell
      title="Libro de Reclamaciones (INDECOPI)"
      description="Reclamos y quejas recibidos desde la tienda web — Ley 29571."
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>N°</TableHead><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead>
              <TableHead>Consumidor</TableHead><TableHead>Detalle</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin reclamos.</TableCell></TableRow>}
              {data?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                  <TableCell className="text-sm">{formatDateTime(r.fecha)}</TableCell>
                  <TableCell><Badge variant={r.tipo === 'RECLAMO' ? 'destructive' : 'warning'}>{r.tipo}</Badge></TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.cliente_nombre}</div>
                    <div className="font-mono text-xs text-slate-500">{r.cliente_documento_numero}</div>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-xs text-slate-600">{r.descripcion}</TableCell>
                  <TableCell><Badge variant={tono(r.estado)}>{r.estado.replace('_',' ')}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
