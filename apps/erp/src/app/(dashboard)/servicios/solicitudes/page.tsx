import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { ArrowLeft, Inbox } from 'lucide-react';
import { esGerente } from '@/server/actions/_helpers';
import { formatDateTime } from '@happy/lib';
import { AprobarRechazarSolicitud } from './client';

export const metadata = { title: 'Solicitudes de aprobación' };
export const dynamic = 'force-dynamic';

type Sol = {
  id: string; estado: string; created_at: string; resuelto_en: string | null;
  proceso: string | null; monto_base: number | null;
  movilidad_por_unidad: number | null; campana_por_unidad: number | null; es_campana: boolean | null;
  motivo_solicitud: string | null; motivo_rechazo: string | null;
  solicitante_id: string | null; ot_id: string | null; taller_id: string | null;
  os_generada_id: string | null;
};

const COLOR: Record<string, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  PENDIENTE: 'warning', APROBADA: 'success', RECHAZADA: 'destructive', ANULADA: 'secondary',
};

export default async function Page() {
  const sb = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const gerente = await esGerente();

  const { data: solsRaw } = await sbAny
    .from('solicitudes_os')
    .select('id, estado, created_at, resuelto_en, proceso, monto_base, movilidad_por_unidad, campana_por_unidad, es_campana, motivo_solicitud, motivo_rechazo, solicitante_id, ot_id, taller_id, os_generada_id')
    .order('created_at', { ascending: false })
    .limit(200);
  const sols = (solsRaw ?? []) as Sol[];

  // Resolver nombres (solicitante, OT, taller) por lote.
  const userIds = [...new Set(sols.map((s) => s.solicitante_id).filter(Boolean))] as string[];
  const otIds = [...new Set(sols.map((s) => s.ot_id).filter(Boolean))] as string[];
  const tallerIds = [...new Set(sols.map((s) => s.taller_id).filter(Boolean))] as string[];
  const [{ data: perfiles }, { data: ots }, { data: talleres }] = await Promise.all([
    userIds.length ? sbAny.from('perfiles').select('id, nombre_completo').in('id', userIds) : Promise.resolve({ data: [] }),
    otIds.length ? sb.from('ot').select('id, numero').in('id', otIds) : Promise.resolve({ data: [] }),
    tallerIds.length ? sb.from('talleres').select('id, nombre').in('id', tallerIds) : Promise.resolve({ data: [] }),
  ]);
  const nombreDe = new Map(((perfiles ?? []) as { id: string; nombre_completo: string }[]).map((p) => [p.id, p.nombre_completo]));
  const otDe = new Map(((ots ?? []) as { id: string; numero: string }[]).map((o) => [o.id, o.numero]));
  const tallerDe = new Map(((talleres ?? []) as { id: string; nombre: string }[]).map((t) => [t.id, t.nombre]));

  const pendientes = sols.filter((s) => s.estado === 'PENDIENTE');

  return (
    <PageShell
      title="Solicitudes de aprobación de OS"
      description={gerente
        ? 'Revisá y aprobá o rechazá las solicitudes de órdenes de servicio con campaña/movilidad especial.'
        : 'Estado de las solicitudes de OS enviadas a gerencia.'}
      actions={
        <Link href="/servicios">
          <Button variant="outline" className="gap-1"><ArrowLeft className="h-4 w-4" /> Volver</Button>
        </Link>
      }
    >
      {gerente && pendientes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Tienes <strong>{pendientes.length}</strong> solicitud(es) pendiente(s) de aprobación.
        </div>
      )}

      {sols.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="Sin solicitudes" description="No hay solicitudes de aprobación registradas." />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>OT / Taller</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Estado</TableHead>
                  {gerente && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sols.map((s) => {
                  const detalle = s.es_campana
                    ? `Campaña S/ ${Number(s.campana_por_unidad ?? 0).toFixed(2)}/u`
                    : `Movilidad S/ ${Number(s.movilidad_por_unidad ?? 0).toFixed(2)}/u`;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs text-slate-500">{formatDateTime(s.created_at)}</TableCell>
                      <TableCell className="text-sm">{s.solicitante_id ? nombreDe.get(s.solicitante_id) ?? '—' : '—'}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-mono">{s.ot_id ? otDe.get(s.ot_id) ?? '—' : '—'}</div>
                        <div className="text-slate-500">{s.taller_id ? tallerDe.get(s.taller_id) ?? '—' : '—'}</div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-corp-900">{detalle}</TableCell>
                      <TableCell className="max-w-xs text-xs text-slate-500">
                        {s.estado === 'RECHAZADA' && s.motivo_rechazo
                          ? <span className="text-danger">✕ {s.motivo_rechazo}</span>
                          : (s.motivo_solicitud ?? '—')}
                      </TableCell>
                      <TableCell>
                        <Badge variant={COLOR[s.estado] ?? 'secondary'} className="text-[10px]">{s.estado}</Badge>
                        {s.estado === 'APROBADA' && s.os_generada_id && (
                          <Link href={`/servicios/${s.os_generada_id}`} className="ml-1 text-[10px] text-happy-600 hover:underline">ver OS</Link>
                        )}
                      </TableCell>
                      {gerente && (
                        <TableCell className="text-right">
                          {s.estado === 'PENDIENTE'
                            ? <AprobarRechazarSolicitud
                                solicitudId={s.id}
                                esCampana={Boolean(s.es_campana)}
                                campanaUnit={Number(s.campana_por_unidad ?? 0)}
                                movilidadUnit={Number(s.movilidad_por_unidad ?? 0)}
                              />
                            : <span className="text-[10px] text-slate-400">{s.resuelto_en ? formatDateTime(s.resuelto_en) : ''}</span>}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
