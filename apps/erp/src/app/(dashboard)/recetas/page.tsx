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
import { FileText, Pencil } from 'lucide-react';
import { NuevaRecetaButton } from './nueva-receta-client';

export const metadata = { title: 'Recetas (BOM)' };
export const dynamic = 'force-dynamic';

type SP = { q?: string; estado?: string };

export default async function RecetasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  // Cargamos en paralelo: index para autocomplete + lista de productos para el modal "Nueva receta".
  const [{ data: indexData }, { data: productosAll }, { data: recetasActivas }] = await Promise.all([
    sb
      .from('recetas')
      .select('id, productos(id, codigo, nombre)')
      .eq('activa', true)
      .order('updated_at', { ascending: false })
      .limit(1000),
    sb
      .from('productos')
      .select('id, codigo, nombre')
      .eq('activo', true)
      .order('nombre')
      .limit(2000),
    sb.from('recetas').select('producto_id').eq('activa', true),
  ]);
  const indexItems = (indexData ?? [])
    .map((r) => {
      const p = (r as unknown as { productos?: { id: string; codigo: string; nombre: string } | null }).productos;
      if (!p) return null;
      return {
        id: r.id,
        label: p.nombre,
        sublabel: `${p.codigo} · receta`,
        href: `/recetas/${r.id}`,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const conReceta = new Set((recetasActivas ?? []).map((r) => r.producto_id as string));
  const productosParaModal = (productosAll ?? []).map((p) => ({
    id: p.id as string,
    codigo: p.codigo as string,
    nombre: p.nombre as string,
    tieneReceta: conReceta.has(p.id as string),
  }));

  function chipUrl(params: Record<string, string | undefined>) {
    const sp2 = new URLSearchParams();
    if (sp.q) sp2.set('q', sp.q);
    if (sp.estado) sp2.set('estado', sp.estado);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === '') sp2.delete(k);
      else sp2.set(k, v);
    }
    const s = sp2.toString();
    return s ? `?${s}` : '?';
  }

  const tableKey = `${sp.q ?? ''}|${sp.estado ?? ''}`;

  return (
    <PageShell
      title="Recetas (BOM)"
      description="Listas de materiales por producto y talla. Versionadas. Editables."
      actions={<NuevaRecetaButton productos={productosParaModal} />}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchAutocomplete items={indexItems} placeholder="Buscar receta por producto o código…" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Estado:</span>
        <FilterChip href={chipUrl({ estado: '' })} active={!sp.estado}>
          Todas
        </FilterChip>
        <FilterChip href={chipUrl({ estado: 'activa' })} active={sp.estado === 'activa'} variant="success">
          Activas
        </FilterChip>
        <FilterChip
          href={chipUrl({ estado: 'historica' })}
          active={sp.estado === 'historica'}
          variant="secondary"
        >
          Históricas
        </FilterChip>
      </div>

      <Suspense key={tableKey} fallback={<TableSkeleton rows={10} cols={7} />}>
        <RecetasTable {...sp} />
      </Suspense>
    </PageShell>
  );
}

async function RecetasTable({ q, estado }: SP) {
  const sb = await createClient();
  let query = sb
    .from('recetas')
    .select(
      'id, version, activa, fecha_vigencia_desde, productos!inner(id, codigo, nombre), recetas_lineas(id)',
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  if (q) {
    // Buscar por nombre o código de producto via filtro en la relación.
    query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`, { foreignTable: 'productos' });
  }
  if (estado === 'activa') query = query.eq('activa', true);
  if (estado === 'historica') query = query.eq('activa', false);

  const { data } = await query;

  if ((data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-6 w-6" />}
        title="Sin recetas"
        description={
          q
            ? `Sin coincidencias para "${q}".`
            : 'Aún no hay recetas. Usá el botón "Nueva receta" arriba a la derecha para crear la primera.'
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
              <TableHead>Producto</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Versión</TableHead>
              <TableHead className="text-right">Líneas BOM</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((r) => {
              const p = (r as unknown as { productos?: { id: string; nombre: string; codigo: string } }).productos;
              const ln = (r as unknown as { recetas_lineas?: { id: string }[] }).recetas_lineas ?? [];
              return (
                <TableRow key={r.id} className="hover:bg-happy-50/50">
                  <TableCell className="font-medium">
                    <Link href={`/recetas/${r.id}`} className="hover:text-happy-600">
                      {p?.nombre}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p?.codigo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.version}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{ln.length}</TableCell>
                  <TableCell className="text-sm">{r.fecha_vigencia_desde}</TableCell>
                  <TableCell>
                    {r.activa ? (
                      <Badge variant="success">Activa</Badge>
                    ) : (
                      <Badge variant="secondary">Histórica</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/recetas/${r.id}`}>
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
