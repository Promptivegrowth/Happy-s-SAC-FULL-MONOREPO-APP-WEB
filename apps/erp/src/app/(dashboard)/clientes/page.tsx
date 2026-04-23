import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, Search, Users, Pencil } from 'lucide-react';

export const metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const sb = await createClient();
  let q = sb.from('clientes')
    .select('id, tipo_documento, numero_documento, razon_social, nombres, apellido_paterno, email, telefono, tipo_cliente, activo')
    .order('updated_at', { ascending: false }).limit(200);
  if (sp.q) q = q.or(`razon_social.ilike.%${sp.q}%,nombres.ilike.%${sp.q}%,numero_documento.ilike.%${sp.q}%`);
  const { data } = await q;

  return (
    <PageShell
      title="Clientes"
      description="Clientes B2C y B2B. Autocompleta datos con SUNAT/RENIEC."
      actions={
        <Link href="/clientes/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo cliente</Button></Link>
      }
    >
      <form className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar por nombre, RUC, DNI…" className="pl-9" />
        </div>
      </form>

      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Sin clientes registrados"
          description="Empieza creando un cliente B2C o B2B. Puedes autocompletar con SUNAT o RENIEC."
          action={<Link href="/clientes/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo cliente</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((c) => (
                <TableRow key={c.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs"><Badge variant="outline">{c.tipo_documento}</Badge> {c.numero_documento}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/clientes/${c.id}`} className="hover:text-happy-600">
                      {c.razon_social ?? `${c.nombres ?? ''} ${c.apellido_paterno ?? ''}`}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{c.tipo_cliente.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-sm">
                    {c.email && <div>{c.email}</div>}
                    {c.telefono && <div className="text-xs text-slate-500">{c.telefono}</div>}
                  </TableCell>
                  <TableCell>{c.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/clientes/${c.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
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
