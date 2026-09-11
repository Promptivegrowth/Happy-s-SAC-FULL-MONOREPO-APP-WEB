import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { FilterChip } from '@/components/filter-chip';
import { Plus, Hammer, Pencil, Search } from 'lucide-react';

export const metadata = { title: 'Talleres' };
export const dynamic = 'force-dynamic';

type SP = { vista?: string; q?: string };

export default async function TalleresPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();
  let query = sb
    .from('talleres')
    .select('id, codigo, nombre, direccion, telefono, especialidades, calificacion, activo')
    .order('nombre')
    .limit(300);

  // Default: solo activos. 'inactivos' muestra solo desactivados. 'todos' muestra ambos.
  if (sp.vista === 'inactivos') query = query.eq('activo', false);
  else if (sp.vista !== 'todos') query = query.eq('activo', true);

  // Búsqueda por nombre o código (server-side ilike, índice gin trgm en nombre).
  const q = sp.q?.trim();
  if (q) query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);

  const { data } = await query;

  // Cuántos controles de calidad respaldan la calificación de cada taller. La
  // calificación se calcula sola (trigger, mig 88); mostrar el respaldo evita
  // que parezca un número arbitrario.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: ccRaw } = await sbAny
    .from('controles_calidad')
    .select('responsable_taller_id, cantidad_revisada, os:os_id(taller_id)')
    .limit(20000);
  const controlesPorTaller = new Map<string, { controles: number; revisadas: number }>();
  for (const c of (ccRaw ?? []) as Array<{ responsable_taller_id: string | null; cantidad_revisada: number | null; os: { taller_id: string | null } | null }>) {
    const tid = c.responsable_taller_id ?? c.os?.taller_id ?? null;
    if (!tid) continue;
    const prev = controlesPorTaller.get(tid) ?? { controles: 0, revisadas: 0 };
    prev.controles += 1;
    prev.revisadas += Number(c.cantidad_revisada ?? 0);
    controlesPorTaller.set(tid, prev);
  }

  const talleres = (data ?? []) as Array<{
    id: string;
    codigo: string;
    nombre: string;
    direccion: string | null;
    telefono: string | null;
    especialidades: string[] | null;
    calificacion: number | null;
    activo: boolean;
  }>;

  return (
    <PageShell
      title="Talleres externos"
      description="Talleres de servicio (confección, bordado, estampado, acabados)."
      actions={<Link href="/talleres/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo taller</Button></Link>}
    >
      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" action="/talleres" className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          {sp.vista && <input type="hidden" name="vista" value={sp.vista} />}
          <Input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar por nombre o código…" className="pl-9" />
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="self-center text-xs font-medium text-slate-500">Vista:</span>
          <FilterChip
            href={sp.q ? `/talleres?q=${encodeURIComponent(sp.q)}` : '/talleres'}
            active={!sp.vista}
            variant="default"
          >
            Activos
          </FilterChip>
          <FilterChip
            href={`/talleres?vista=inactivos${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}
            active={sp.vista === 'inactivos'}
            variant="secondary"
          >
            Inactivos
          </FilterChip>
          <FilterChip
            href={`/talleres?vista=todos${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}
            active={sp.vista === 'todos'}
          >
            Todos
          </FilterChip>
        </div>
      </div>

      {talleres.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-6 w-6" />}
          title={
            q
              ? `Sin resultados para "${q}"`
              : sp.vista === 'inactivos'
                ? 'Sin talleres inactivos'
                : 'Sin talleres registrados'
          }
          description={
            q
              ? 'Probá ajustar la búsqueda o limpiar el filtro.'
              : sp.vista === 'inactivos'
                ? 'Todos los talleres están activos.'
                : 'Crea talleres para asignarlos a las órdenes de servicio.'
          }
          action={
            q ? (
              <Link href="/talleres"><Button variant="outline">Limpiar búsqueda</Button></Link>
            ) : (
              <Link href="/talleres/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo taller</Button></Link>
            )
          }
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Dirección</TableHead>
              <TableHead>Teléfono</TableHead><TableHead>Especialidades</TableHead><TableHead>Calif.</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {talleres.map((t) => (
                <TableRow key={t.id} className={`hover:bg-happy-50/50 ${!t.activo ? 'opacity-60' : ''}`}>
                  <TableCell className="font-mono text-xs">{t.codigo}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/talleres/${t.id}`} className="hover:text-happy-600">{t.nombre}</Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-slate-600">{t.direccion}</TableCell>
                  <TableCell className="text-sm">{t.telefono ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(t.especialidades ?? []).slice(0, 4).map((e: string) => <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const info = controlesPorTaller.get(t.id);
                      const calif = Number(t.calificacion ?? 5);
                      const tono = calif >= 4.5 ? 'success' : calif >= 3.5 ? 'secondary' : 'destructive';
                      return (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={tono as 'success' | 'secondary' | 'destructive'}>⭐ {calif.toFixed(1)}</Badge>
                          <span className="text-[10px] text-slate-400">
                            {info
                              ? `${info.controles} control${info.controles === 1 ? '' : 'es'} · ${info.revisadas} rev.`
                              : 'sin evaluar'}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {t.activo ? (
                      <Badge variant="success" className="text-[10px]">Activo</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/talleres/${t.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
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
