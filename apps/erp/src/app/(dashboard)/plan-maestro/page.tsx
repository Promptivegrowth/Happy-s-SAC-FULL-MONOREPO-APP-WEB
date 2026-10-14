import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { Plus, ClipboardList, Eye } from 'lucide-react';
import { formatDate } from '@happy/lib';

export const metadata = { title: 'Plan Maestro' };
export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'default' | 'destructive'> = {
  BORRADOR: 'secondary',
  APROBADO: 'default',
  EN_EJECUCION: 'warning',
  COMPLETADO: 'success',
  CANCELADO: 'destructive',
};

export default async function Page() {
  const sb = await createClient();
  const { data } = await sb.from('plan_maestro')
    .select('id, codigo, semana, anio, fecha_inicio, fecha_fin, estado, created_at, plan_maestro_lineas(id)')
    .order('created_at', { ascending: false }).limit(50);

  /*
   * Fechas REALES junto a las planificadas (pedido de Javier, 13/10/2026): el
   * PM-2026-S42-003 se creó y se produjo el sábado 10/10, pero la lista solo
   * mostraba lo planificado (12/10 al 30/10) y parecía que no cuadraba. Se ve
   * cuándo se creó, cuándo empezó y terminó su producción, y el avance de sus OT.
   */
  const planIds = (data ?? []).map((p) => p.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: otsRaw } = planIds.length
    ? await sbAny.from('ot').select('plan_id, estado, fecha_apertura, fecha_cierre').in('plan_id', planIds)
    : { data: [] };
  const otsDe = new Map<string, { estado: string; fecha_apertura: string | null; fecha_cierre: string | null }[]>();
  for (const o of (otsRaw ?? []) as { plan_id: string; estado: string; fecha_apertura: string | null; fecha_cierre: string | null }[]) {
    const l = otsDe.get(o.plan_id) ?? [];
    l.push(o);
    otsDe.set(o.plan_id, l);
  }
  const fechaCorta = (d: string | null | undefined) => (d ? formatDate(d) : '—');

  return (
    <PageShell
      title="Plan Maestro"
      description="Lista semanal de productos a cortar/confeccionar. Genera explosión de materiales y OTs."
      actions={
        <Link href="/plan-maestro/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo plan</Button></Link>
      }
    >
      {(data ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Sin planes maestros"
          description="Crea un plan semanal y genera automáticamente las OTs y la explosión de materiales."
          action={<Link href="/plan-maestro/nuevo"><Button variant="premium"><Plus className="h-4 w-4" /> Nuevo plan</Button></Link>}
        />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Semana</TableHead>
              <TableHead>Planificado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead title="Desde la apertura de la primera OT hasta el cierre de la última">Producción real</TableHead>
              <TableHead className="text-right">Líneas</TableHead>
              <TableHead className="text-right" title="OT completadas de las activas (sin contar las canceladas)">OT</TableHead>
              <TableHead>Estado</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data?.map((p) => {
                const ln = (p as unknown as { plan_maestro_lineas?: { id: string }[] }).plan_maestro_lineas ?? [];
                return (
                  <TableRow key={p.id} className="hover:bg-happy-50/50">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/plan-maestro/${p.id}`} className="hover:text-happy-600">{p.codigo}</Link>
                    </TableCell>
                    <TableCell>S{p.semana ?? '-'}/{p.anio ?? '-'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fechaCorta(p.fecha_inicio)} – {fechaCorta(p.fecha_fin)}</TableCell>
                    <TableCell className="text-sm">{fechaCorta(p.created_at)}</TableCell>
                    <TableCell className="text-sm">{(() => {
                      const ots = (otsDe.get(p.id) ?? []).filter((o) => o.estado !== 'CANCELADA');
                      if (ots.length === 0) return <span className="text-slate-400">Sin OT</span>;
                      const ini = ots.map((o) => o.fecha_apertura).filter(Boolean).sort()[0];
                      const todasCerradas = ots.every((o) => o.estado === 'COMPLETADA');
                      const fin = todasCerradas ? ots.map((o) => o.fecha_cierre).filter(Boolean).sort().at(-1) : null;
                      return <>{fechaCorta(ini)} – {fin ? fechaCorta(fin) : <span className="text-amber-700">en curso</span>}</>;
                    })()}</TableCell>
                    <TableCell className="text-right font-mono">{ln.length}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{(() => {
                      const ots = (otsDe.get(p.id) ?? []).filter((o) => o.estado !== 'CANCELADA');
                      return ots.length ? `${ots.filter((o) => o.estado === 'COMPLETADA').length}/${ots.length}` : '—';
                    })()}</TableCell>
                    <TableCell><Badge variant={COLOR[p.estado ?? 'BORRADOR'] ?? 'secondary'}>{(p.estado ?? 'BORRADOR').replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/plan-maestro/${p.id}`}><Button variant="ghost" size="sm"><Eye className="h-3.5 w-3.5" /></Button></Link>
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
