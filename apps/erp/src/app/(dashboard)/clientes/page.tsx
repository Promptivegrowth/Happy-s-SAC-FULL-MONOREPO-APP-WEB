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
import { Plus, Users, Pencil } from 'lucide-react';

export const metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

const TIPOS_CLIENTE = [
  { code: 'PUBLICO_FINAL', label: 'Público' },
  { code: 'MAYORISTA_A', label: 'Mayorista A' },
  { code: 'MAYORISTA_B', label: 'Mayorista B' },
  { code: 'MAYORISTA_C', label: 'Mayorista C' },
  { code: 'INDUSTRIAL', label: 'Industrial' },
] as const;

type SP = { q?: string; tipo?: string; estado?: string };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const { data: indexData } = await sb
    .from('clientes')
    .select('id, numero_documento, razon_social, nombres, apellido_paterno, tipo_documento')
    .eq('activo', true)
    .order('updated_at', { ascending: false })
    .limit(1000);
  const indexItems = (indexData ?? []).map((c) => {
    const nombreCompleto = c.razon_social ?? `${c.nombres ?? ''} ${c.apellido_paterno ?? ''}`.trim();
    const nombre = nombreCompleto || '(sin nombre)';
    return {
      id: c.id,
      label: nombre,
      sublabel: `${c.tipo_documento} ${c.numero_documento}`,
      href: `/clientes/${c.id}`,
    };
  });

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
      title="Clientes"
      description="Clientes B2C y B2B. Autocompleta datos con SUNAT/RENIEC."
      actions={
        <Link href="/clientes/nuevo">
          <Button variant="premium">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchAutocomplete items={indexItems} placeholder="Buscar por nombre, RUC, DNI…" />
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
        {TIPOS_CLIENTE.map((t) => (
          <FilterChip key={t.code} href={chipUrl({ tipo: t.code })} active={sp.tipo === t.code}>
            {t.label}
          </FilterChip>
        ))}
      </div>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={6} />}>
        <ClientesTable {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function ClientesTable({ q, tipo, estado }: SP) {
  const sb = await createClient();
  let query = sb
    .from('clientes')
    .select(
      'id, tipo_documento, numero_documento, razon_social, nombres, apellido_paterno, email, telefono, tipo_cliente, activo',
    )
    .order('updated_at', { ascending: false })
    .limit(200);
  if (q) {
    query = query.or(
      `razon_social.ilike.%${q}%,nombres.ilike.%${q}%,numero_documento.ilike.%${q}%`,
    );
  }
  if (tipo) {
    query = query.eq('tipo_cliente', tipo as 'PUBLICO_FINAL' | 'MAYORISTA_A' | 'MAYORISTA_B' | 'MAYORISTA_C' | 'INDUSTRIAL');
  }
  if (estado === 'activo') query = query.eq('activo', true);
  if (estado === 'inactivo') query = query.eq('activo', false);
  const { data } = await query;

  if ((data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-6 w-6" />}
        title="Sin clientes"
        description={q ? `Sin coincidencias para "${q}".` : 'No hay clientes con los filtros seleccionados.'}
        action={
          <Link href="/clientes/nuevo">
            <Button variant="premium">
              <Plus className="h-4 w-4" /> Nuevo cliente
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
                <TableCell className="font-mono text-xs">
                  <Badge variant="outline">{c.tipo_documento}</Badge> {c.numero_documento}
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/clientes/${c.id}`} className="hover:text-happy-600">
                    {c.razon_social ?? `${c.nombres ?? ''} ${c.apellido_paterno ?? ''}`}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{c.tipo_cliente.replace('_', ' ')}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {c.email && <div>{c.email}</div>}
                  {c.telefono && <div className="text-xs text-slate-500">{c.telefono}</div>}
                </TableCell>
                <TableCell>
                  {c.activo ? (
                    <Badge variant="success">Activo</Badge>
                  ) : (
                    <Badge variant="secondary">Inactivo</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/clientes/${c.id}`}>
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
