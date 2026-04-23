import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Truck, Pencil } from 'lucide-react';

export const metadata = { title: 'Proveedores' };
export const dynamic = 'force-dynamic';

export default async function ProveedoresPage() {
  const sb = await createClient();
  const { data } = await sb.from('proveedores').select('id, numero_documento, razon_social, direccion, telefono, email, es_importacion, activo').order('razon_social').limit(300);

  return (
    <PageShell
      title="Proveedores"
      description="Lista de proveedores nacionales y de importación. Autocompleta con SUNAT."
      actions={<Link href="/proveedores/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo proveedor</Button></Link>}
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Truck className="h-6 w-6" />}
          title="Sin proveedores"
          description="Crea proveedores para registrar OCs y compras."
          action={<Link href="/proveedores/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo proveedor</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>RUC</TableHead><TableHead>Razón Social</TableHead><TableHead>Dirección</TableHead>
              <TableHead>Contacto</TableHead><TableHead>Tipo</TableHead><TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((p) => (
                <TableRow key={p.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs">{p.numero_documento}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/proveedores/${p.id}`} className="hover:text-happy-600">{p.razon_social}</Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-slate-600">{p.direccion}</TableCell>
                  <TableCell className="text-sm">{p.telefono ?? p.email ?? '—'}</TableCell>
                  <TableCell>{p.es_importacion ? <Badge>Importación</Badge> : <Badge variant="secondary">Nacional</Badge>}</TableCell>
                  <TableCell>{p.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/proveedores/${p.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
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
