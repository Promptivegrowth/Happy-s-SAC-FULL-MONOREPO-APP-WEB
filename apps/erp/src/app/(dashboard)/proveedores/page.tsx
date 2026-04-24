import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { SearchAutocomplete } from '@/components/search-autocomplete';
import { FilterChip } from '@/components/filter-chip';
import { TableSkeleton } from '@/components/skeletons';
import { Plus, Truck, Pencil, Globe } from 'lucide-react';

export const metadata = { title: 'Proveedores' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; tipo?: string; estado?: string };

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const { data: indexData } = await sb
    .from('proveedores')
    .select('id, numero_documento, razon_social')
    .eq('activo', true)
    .order('razon_social')
    .limit(1000);
  const indexItems = (indexData ?? []).map((p) => ({
    id: p.id,
    label: p.razon_social,
    sublabel: `RUC ${p.numero_documento}`,
    href: `/proveedores/${p.id}`,
  }));

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.tipo) sp2.set('tipo', sp.tipo);
    if (sp.estado) sp2.set('estado', sp.estado);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  const tableKey = `${sp.q ?? ''}|${sp.tipo ?? ''}|${sp.estado ?? ''}`;

  return (
    <PageShell
      title="Proveedores"
      description="Lista de proveedores nacionales y de importación. Autocompleta con SUNAT."
      actions={
        <Link href="/proveedores/nuevo">
          <Button variant="premium">
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchAutocomplete items={indexItems} placeholder="Buscar por razón social o RUC…" />
        <FilterChip
          href={chipUrl({ estado: sp.estado === 'inactivo' ? '' : 'inactivo' })}
          active={sp.estado === 'inactivo'}
          variant="destructive"
        >
          Inactivos
        </FilterChip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Tipo:</span>
        <FilterChip href={chipUrl({ tipo: '' })} active={!sp.tipo}>
          Todos
        </FilterChip>
        <FilterChip href={chipUrl({ tipo: 'nacional' })} active={sp.tipo === 'nacional'}>
          Nacional
        </FilterChip>
        <FilterChip href={chipUrl({ tipo: 'importacion' })} active={sp.tipo === 'importacion'}>
          <Globe className="h-3 w-3" /> Importación
        </FilterChip>
      </div>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={7} />}>
        <ProveedoresTable {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function ProveedoresTable({ q, tipo, estado }: SP) {
  const sb = await createClient();
  let query = sb
    .from('proveedores')
    .select('id, numero_documento, razon_social, direccion, telefono, email, es_importacion, activo')
    .order('razon_social')
    .limit(300);
  if (q) {
    query = query.or(`razon_social.ilike.%${q}%,numero_documento.ilike.%${q}%`);
  }
  if (tipo === 'importacion') query = query.eq('es_importacion', true);
  if (tipo === 'nacional') query = query.eq('es_importacion', false);
  if (estado === 'activo') query = query.eq('activo', true);
  if (estado === 'inactivo') query = query.eq('activo', false);
  const { data } = await query;

  if ((data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Truck className="h-6 w-6" />}
        title="Sin proveedores"
        description={q ? `Sin coincidencias para "${q}".` : 'Crea proveedores para registrar OCs y compras.'}
        action={
          <Link href="/proveedores/nuevo">
            <Button variant="premium">
              <Plus className="h-4 w-4" /> Nuevo proveedor
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RUC</TableHead>
              <TableHead>Razón Social</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((p) => (
              <TableRow key={p.id} className="hover:bg-happy-50/50">
                <TableCell className="font-mono text-xs">{p.numero_documento}</TableCell>
                <TableCell className="font-medium">
                  <Link href={`/proveedores/${p.id}`} className="hover:text-happy-600">
                    {p.razon_social}
                  </Link>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-slate-600">{p.direccion}</TableCell>
                <TableCell className="text-sm">{p.telefono ?? p.email ?? '—'}</TableCell>
                <TableCell>
                  {p.es_importacion ? <Badge>Importación</Badge> : <Badge variant="secondary">Nacional</Badge>}
                </TableCell>
                <TableCell>
                  {p.activo ? (
                    <Badge variant="success">Activo</Badge>
                  ) : (
                    <Badge variant="secondary">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/proveedores/${p.id}`}>
                    <Button variant="ghost" size="sm">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
