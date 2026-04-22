import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus } from 'lucide-react';

export const metadata = { title: 'Proveedores' };
export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
  const sb = await createClient();
  const { data } = await sb.from('proveedores').select('id, numero_documento, razon_social, direccion, telefono, email, es_importacion, activo').order('razon_social').limit(300);

  return (
    <PageShell
      title="Proveedores"
      description="Lista de proveedores nacionales y de importación."
      actions={<Link href="/proveedores/nuevo"><Button><Plus className="h-4 w-4" /> Nuevo</Button></Link>}
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>RUC</TableHead><TableHead>Razón Social</TableHead><TableHead>Dirección</TableHead>
              <TableHead>Contacto</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin proveedores. Importa con <code>pnpm db:import-excel</code>.</TableCell></TableRow>}
              {data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.numero_documento}</TableCell>
                  <TableCell className="font-medium">{p.razon_social}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-slate-600">{p.direccion}</TableCell>
                  <TableCell className="text-sm">{p.telefono ?? p.email ?? '—'}</TableCell>
                  <TableCell>{p.es_importacion ? <Badge>Importación</Badge> : <Badge variant="secondary">Nacional</Badge>}</TableCell>
                  <TableCell>{p.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
