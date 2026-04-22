import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Search } from 'lucide-react';

export const metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  let q = sb.from('clientes').select('id, tipo_documento, numero_documento, razon_social, nombres, apellido_paterno, email, telefono, tipo_cliente, activo').order('updated_at', { ascending: false }).limit(200);
  if (sp.q) q = q.or(`razon_social.ilike.%${sp.q}%,nombres.ilike.%${sp.q}%,numero_documento.ilike.%${sp.q}%`);
  const { data } = await q;

  return (
    <PageShell
      title="Clientes"
      description="Clientes B2C y B2B. Autocompleta datos con SUNAT/RENIEC."
      actions={
        <Link href="/clientes/nuevo"><Button><Plus className="h-4 w-4" /> Nuevo cliente</Button></Link>
      }
    >
      <form className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar por nombre, RUC, DNI…" className="pl-9" />
        </div>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">Sin clientes registrados.</TableCell></TableRow>
              )}
              {data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs"><Badge variant="outline">{c.tipo_documento}</Badge> {c.numero_documento}</TableCell>
                  <TableCell className="font-medium">{c.razon_social ?? `${c.nombres ?? ''} ${c.apellido_paterno ?? ''}`}</TableCell>
                  <TableCell><Badge variant="secondary">{c.tipo_cliente.replace('_',' ')}</Badge></TableCell>
                  <TableCell className="text-sm">
                    {c.email && <div>{c.email}</div>}
                    {c.telefono && <div className="text-xs text-slate-500">{c.telefono}</div>}
                  </TableCell>
                  <TableCell>{c.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
