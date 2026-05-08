import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { FilterChip } from '@/components/filter-chip';
import { Plus, Users, Pencil } from 'lucide-react';
import { EliminarOperarioButton } from './eliminar-operario-client';

export const metadata = { title: 'Operarios' };
export const dynamic = 'force-dynamic';

type SP = { vista?: string };

const TIPOS_LABEL: Record<string, string> = {
  OPERARIO: 'Operario',
  AYUDANTE: 'Ayudante',
  SUPERVISOR: 'Supervisor',
  JEFE_AREA: 'Jefe de área',
  ADMINISTRATIVO: 'Administrativo',
  SERVICIO: 'Servicio',
};

export default async function OperariosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sb = await createClient();

  let q = sb
    .from('operarios')
    .select('id, codigo, nombres, apellido_paterno, apellido_materno, dni, tipo_operario, tipo_contrato, jornada_personalizada, jornada_inicio, jornada_fin, activo, areas_produccion(nombre)')
    .order('nombres')
    .limit(500);

  if (sp.vista === 'inactivos') q = q.eq('activo', false);
  else if (sp.vista !== 'todos') q = q.eq('activo', true);

  const { data } = await q;
  const operarios = (data ?? []) as unknown as Array<{
    id: string;
    codigo: string;
    nombres: string;
    apellido_paterno: string | null;
    apellido_materno: string | null;
    dni: string | null;
    tipo_operario: string | null;
    tipo_contrato: string | null;
    jornada_personalizada: boolean;
    jornada_inicio: string | null;
    jornada_fin: string | null;
    activo: boolean;
    areas_produccion: { nombre: string } | null;
  }>;

  return (
    <PageShell
      title="Operarios"
      description="Personal de planta propia (corte, costura, acabados, etc.). Cargá el DNI y se autocompleta con RENIEC."
      actions={<Link href="/operarios/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo operario</Button></Link>}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="self-center text-xs font-medium text-slate-500">Vista:</span>
        <FilterChip href="/operarios" active={!sp.vista} variant="default">Activos</FilterChip>
        <FilterChip href="/operarios?vista=inactivos" active={sp.vista === 'inactivos'} variant="secondary">Inactivos</FilterChip>
        <FilterChip href="/operarios?vista=todos" active={sp.vista === 'todos'}>Todos</FilterChip>
      </div>

      {operarios.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={sp.vista === 'inactivos' ? 'Sin operarios inactivos' : 'Sin operarios registrados'}
          description={sp.vista === 'inactivos'
            ? 'Todos los operarios están activos.'
            : 'Cargá el primer operario con su DNI y el sistema autocompleta con RENIEC.'}
          action={<Link href="/operarios/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo operario</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>DNI</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Jornada</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {operarios.map((o) => {
                const nombre = [o.nombres, o.apellido_paterno, o.apellido_materno].filter(Boolean).join(' ');
                return (
                  <TableRow key={o.id} className={`hover:bg-happy-50/50 ${!o.activo ? 'opacity-60' : ''}`}>
                    <TableCell className="font-mono text-xs">{o.codigo}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/operarios/${o.id}`} className="hover:text-happy-600">{nombre}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{o.dni ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{TIPOS_LABEL[o.tipo_operario ?? 'OPERARIO']}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{o.areas_produccion?.nombre ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{o.tipo_contrato ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {o.jornada_personalizada
                        ? <span className="font-medium text-happy-700">{o.jornada_inicio?.slice(0,5)}–{o.jornada_fin?.slice(0,5)}</span>
                        : <span className="text-slate-400">Estándar</span>}
                    </TableCell>
                    <TableCell>
                      {o.activo
                        ? <Badge variant="success" className="text-[10px]">Activo</Badge>
                        : <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/operarios/${o.id}`}><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></Link>
                        {o.activo && <EliminarOperarioButton id={o.id} nombre={nombre} />}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </PageShell>
  );
}
