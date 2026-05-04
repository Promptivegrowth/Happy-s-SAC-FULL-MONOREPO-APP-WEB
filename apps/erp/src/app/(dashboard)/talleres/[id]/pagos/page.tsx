import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate, formatPEN } from '@happy/lib';
import { ArrowLeft, Wallet } from 'lucide-react';
import { NuevoPagoButton } from './nuevo-pago-client';
import { EliminarPagoButton } from './eliminar-pago-client';

export const dynamic = 'force-dynamic';

type Pago = {
  id: string;
  fecha: string;
  monto: number;
  medio_pago: string;
  banco_destino: string | null;
  numero_operacion: string | null;
  comprobante_url: string | null;
  concepto: string | null;
  observacion: string | null;
  os_id: string | null;
  ordenes_servicio: { numero: string } | null;
};

const MEDIO_COLOR: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
  TRANSFERENCIA: 'default',
  YAPE: 'success',
  PLIN: 'success',
  EFECTIVO: 'warning',
  CHEQUE: 'secondary',
  DEPOSITO: 'default',
  OTRO: 'secondary',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await createClient();

  const { data: taller } = await sb
    .from('talleres')
    .select('id, codigo, nombre, banco, numero_cuenta')
    .eq('id', id)
    .maybeSingle();
  if (!taller) notFound();

  // OSs del taller para el selector del modal
  const { data: oss } = await sb
    .from('ordenes_servicio')
    .select('id, numero, fecha_emision, monto_total, estado')
    .eq('taller_id', id)
    .order('fecha_emision', { ascending: false })
    .limit(50);

  // Pagos del taller
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sbAny = sb as unknown as { from: (t: string) => any };
  const { data: pagosData } = await sbAny
    .from('pagos_talleres')
    .select('id, fecha, monto, medio_pago, banco_destino, numero_operacion, comprobante_url, concepto, observacion, os_id, ordenes_servicio(numero)')
    .eq('taller_id', id)
    .order('fecha', { ascending: false });
  const pagos = (pagosData ?? []) as Pago[];

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const ultimoPago = pagos[0];

  return (
    <PageShell
      title={`Pagos al taller: ${taller.nombre}`}
      description={`Histórico de pagos al taller ${taller.codigo}${
        taller.banco ? ` · cuenta destino ${taller.banco} ${taller.numero_cuenta ?? ''}` : ''
      }`}
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/talleres/${id}`}>
            <Button variant="outline" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Volver al taller
            </Button>
          </Link>
          <NuevoPagoButton
            tallerId={id}
            tallerNombre={taller.nombre}
            bancoDefault={taller.banco ?? ''}
            ordenesServicio={(oss ?? []).map((o) => ({
              id: o.id as string,
              numero: o.numero as string,
              monto_total: Number(o.monto_total ?? 0),
              estado: o.estado as string,
            }))}
          />
        </div>
      }
    >
      {/* Cards de resumen */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total pagado (histórico)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(totalPagado)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Cantidad de pagos</p>
          <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{pagos.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Último pago</p>
          <p className="mt-1 font-display text-lg font-semibold text-corp-900">
            {ultimoPago ? `${formatDate(ultimoPago.fecha)} · ${formatPEN(Number(ultimoPago.monto))}` : '—'}
          </p>
        </Card>
      </div>

      {pagos.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Sin pagos registrados"
          description="Cuando le pagues al taller, registralo acá para llevar el control histórico."
          action={
            <NuevoPagoButton
              tallerId={id}
              tallerNombre={taller.nombre}
              bancoDefault={taller.banco ?? ''}
              ordenesServicio={(oss ?? []).map((o) => ({
                id: o.id as string,
                numero: o.numero as string,
                monto_total: Number(o.monto_total ?? 0),
                estado: o.estado as string,
              }))}
            />
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Banco destino</TableHead>
                  <TableHead>Nº operación</TableHead>
                  <TableHead>Concepto / OS</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{formatDate(p.fecha)}</TableCell>
                    <TableCell className="text-right font-semibold text-emerald-700">{formatPEN(Number(p.monto))}</TableCell>
                    <TableCell>
                      <Badge variant={MEDIO_COLOR[p.medio_pago] ?? 'secondary'} className="text-[10px]">
                        {p.medio_pago.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{p.banco_destino ?? '—'}</TableCell>
                    <TableCell className="font-mono text-[10px] text-slate-500">{p.numero_operacion ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {p.ordenes_servicio?.numero ? (
                        <Link href={`/servicios/${p.os_id}`} className="font-mono text-happy-600 hover:underline">
                          {p.ordenes_servicio.numero}
                        </Link>
                      ) : (
                        <span className="text-slate-600">{p.concepto ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.comprobante_url ? (
                        <a
                          href={p.comprobante_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-happy-600 hover:underline"
                        >
                          Ver
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <EliminarPagoButton pagoId={p.id} tallerId={id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
