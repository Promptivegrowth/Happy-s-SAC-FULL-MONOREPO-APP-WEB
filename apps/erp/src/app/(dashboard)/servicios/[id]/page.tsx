import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { OsTransitions } from './client';
import { formatDate, formatPEN } from '@happy/lib';

export const dynamic = 'force-dynamic';

const COLOR: Record<string, 'success' | 'warning' | 'secondary' | 'default' | 'destructive'> = {
  EMITIDA: 'default',
  DESPACHADA: 'warning',
  EN_PROCESO: 'warning',
  RECEPCIONADA: 'success',
  CERRADA: 'success',
  ANULADA: 'destructive',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();
  const { data: os } = await sb.from('ordenes_servicio')
    .select('*, talleres(id, nombre, telefono, contacto_nombre), ot(numero, id), ot_corte(numero, id)')
    .eq('id', id).single();
  if (!os) notFound();

  const t = (os as unknown as { talleres?: { id: string; nombre: string; telefono: string | null; contacto_nombre: string | null } | null }).talleres;
  const ot = (os as unknown as { ot?: { numero: string; id: string } | null }).ot;
  const corte = (os as unknown as { ot_corte?: { numero: string; id: string } | null }).ot_corte;

  return (
    <PageShell
      title={`OS ${os.numero}`}
      description={
        <>
          Taller {t?.nombre} · Proceso {os.proceso}
          {ot && <> · OT <Link href={`/ot/${ot.id}`} className="text-happy-600 hover:underline">{ot.numero}</Link></>}
        </>
      }
      actions={<OsTransitions osId={id} estado={os.estado ?? 'EMITIDA'} />}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Estado" value={<Badge variant={COLOR[os.estado ?? 'EMITIDA'] ?? 'secondary'}>{(os.estado ?? 'EMITIDA').replace('_', ' ')}</Badge>} />
        <Stat label="Emisión" value={formatDate(os.fecha_emision)} />
        <Stat label="Entrega esperada" value={formatDate(os.fecha_entrega_esperada)} />
        <Stat label="Total" value={formatPEN(Number(os.monto_total ?? 0))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Pago al taller</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <Row label="Monto base" value={formatPEN(Number(os.monto_base ?? 0))} />
                <Row label="Adicional movilidad" value={formatPEN(Number(os.adicional_movilidad ?? 0))} />
                <Row label="Adicional campaña" value={formatPEN(Number(os.adicional_campana ?? 0))} />
                <Row label="Total" value={<span className="font-display text-lg font-semibold text-happy-600">{formatPEN(Number(os.monto_total ?? 0))}</span>} />
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Notas y consideraciones</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {os.observaciones && <Field label="Observaciones" value={os.observaciones} />}
            {os.cuidados && <Field label="Cuidados" value={os.cuidados} />}
            {os.consideraciones && <Field label="Consideraciones" value={os.consideraciones} />}
            {!os.observaciones && !os.cuidados && !os.consideraciones && <p className="text-slate-400">Sin notas adicionales.</p>}
          </CardContent>
        </Card>
      </div>

      {corte && (
        <Card>
          <CardHeader><CardTitle className="text-base">Corte vinculado</CardTitle></CardHeader>
          <CardContent>
            <Link href={`/corte/${corte.id}`} className="font-mono text-sm text-happy-600 hover:underline">{corte.numero}</Link>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 font-display text-2xl font-semibold text-corp-900">{value}</div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="text-sm text-slate-600">{label}</TableCell>
      <TableCell className="text-right font-medium">{value}</TableCell>
    </TableRow>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-corp-700">{label}</p>
      <p className="text-slate-700">{value}</p>
    </div>
  );
}
