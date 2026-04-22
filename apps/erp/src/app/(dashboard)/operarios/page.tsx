import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';

export const metadata = { title: 'Operarios' };
export const dynamic = 'force-dynamic';

export default async function OperariosPage() {
  const sb = await createClient();
  const { data } = await sb.from('operarios').select('id, codigo, nombres, apellido_paterno, dni, tipo_contrato, tarifa_destajo, sueldo_base, activo, areas_produccion(nombre)').order('nombres');
  return (
    <PageShell title="Operarios" description="Personal de planta propia (corte, decorado, acabados, etc.).">
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>DNI</TableHead>
            <TableHead>Área</TableHead><TableHead>Contrato</TableHead><TableHead>Estado</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin operarios registrados.</TableCell></TableRow>}
            {data?.map((o) => {
              const a = (o as unknown as { areas_produccion?: { nombre: string } }).areas_produccion;
              return (
                <TableRow key={o.id}>
                  <TableCell className="font-mono text-xs">{o.codigo}</TableCell>
                  <TableCell className="font-medium">{o.nombres} {o.apellido_paterno}</TableCell>
                  <TableCell className="font-mono text-xs">{o.dni}</TableCell>
                  <TableCell className="text-sm">{a?.nombre ?? '—'}</TableCell>
                  <TableCell><Badge variant="secondary">{o.tipo_contrato ?? '—'}</Badge></TableCell>
                  <TableCell>{o.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>
    </PageShell>
  );
}
