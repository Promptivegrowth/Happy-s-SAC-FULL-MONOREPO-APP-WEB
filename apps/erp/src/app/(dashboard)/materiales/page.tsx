import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { formatPEN } from '@happy/lib';
import { PageShell } from '@/components/page-shell';
import { SearchAutocomplete } from '@/components/search-autocomplete';
import { FilterChip } from '@/components/filter-chip';
import { TableSkeleton } from '@/components/skeletons';
import { Plus, Boxes, Pencil } from 'lucide-react';

export const metadata = { title: 'Materiales' };
export const dynamic = 'force-dynamic';

const CATEGORIAS = [
  { code: 'TELA', label: 'Telas' },
  { code: 'AVIO', label: 'Avíos' },
  { code: 'INSUMO', label: 'Insumos' },
  { code: 'EMPAQUE', label: 'Empaque' },
] as const;

type SP = { q?: string; cat?: string; estado?: string };

export default async function MaterialesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  const { data: indexData } = await sb
    .from('materiales')
    .select('id, codigo, nombre, categoria')
    .eq('activo', true)
    .order('nombre')
    .limit(1000);
  const indexItems = (indexData ?? []).map((m) => ({
    id: m.id,
    label: m.nombre,
    sublabel: `${m.codigo} · ${m.categoria}`,
    href: `/materiales/${m.id}`,
  }));

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.cat) sp2.set('cat', sp.cat);
    if (sp.estado) sp2.set('estado', sp.estado);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  const tableKey = `${sp.q ?? ''}|${sp.cat ?? ''}|${sp.estado ?? ''}`;

  return (
    <PageShell
      title="Materiales"
      description="Telas, avíos e insumos. Editables desde aquí; aparecen en las recetas (BOM)."
      actions={
        <Link href="/materiales/nuevo">
          <Button variant="premium">
            <Plus className="h-4 w-4" /> Nuevo material
          </Button>
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchAutocomplete items={indexItems} placeholder="Buscar material por nombre o código…" />
        <FilterChip
          href={chipUrl({ estado: sp.estado === 'inactivo' ? '' : 'inactivo' })}
          active={sp.estado === 'inactivo'}
          variant="destructive"
        >
          Inactivos
        </FilterChip>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Categoría:</span>
        <FilterChip href={chipUrl({ cat: '' })} active={!sp.cat}>
          Todas
        </FilterChip>
        {CATEGORIAS.map((c) => (
          <FilterChip key={c.code} href={chipUrl({ cat: c.code })} active={sp.cat === c.code}>
            {c.label}
          </FilterChip>
        ))}
      </div>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={7} />}>
        <MaterialesTable {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function MaterialesTable({ q, cat, estado }: SP) {
  const sb = await createClient();
  let query = sb
    .from('materiales')
    .select('id, codigo, nombre, categoria, precio_unitario, activo, unidades_medida!unidad_compra_id(codigo)')
    .order('categoria')
    .order('nombre')
    .limit(500);
  if (q) query = query.ilike('nombre', `%${q}%`);
  if (cat) query = query.eq('categoria', cat as 'TELA' | 'AVIO' | 'INSUMO' | 'EMPAQUE');
  if (estado === 'activo') query = query.eq('activo', true);
  if (estado === 'inactivo') query = query.eq('activo', false);
  const { data } = await query;

  if ((data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Boxes className="h-6 w-6" />}
        title="Sin materiales"
        description={q ? `Sin coincidencias para "${q}".` : 'No hay materiales con los filtros seleccionados.'}
        action={
          <Link href="/materiales/nuevo">
            <Button variant="premium">
              <Plus className="h-4 w-4" /> Crear material
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
              <TableHead>Código</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((m) => {
              const u = (m as unknown as { unidades_medida?: { codigo: string } | null }).unidades_medida;
              return (
                <TableRow key={m.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-mono text-xs">{m.codigo}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/materiales/${m.id}`} className="hover:text-happy-600">
                      {m.nombre}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{m.categoria}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{u?.codigo ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPEN(Number(m.precio_unitario ?? 0))}
                  </TableCell>
                  <TableCell>
                    {m.activo ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/materiales/${m.id}`}>
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
