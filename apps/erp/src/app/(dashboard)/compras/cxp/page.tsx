import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDate, formatPEN } from '@happy/lib';
import { ExternalLink } from 'lucide-react';
import { ESTADO_LABEL, ESTADO_TONO, type EstadoOC } from '@/server/actions/oc-helpers';
import { RegistrarPagoBtn } from './registrar-pago-btn';

export const metadata = { title: 'Cuentas por Pagar' };
export const dynamic = 'force-dynamic';

const TONE_CLS: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
  amber: 'bg-amber-100 text-amber-800 border-amber-300',
  sky: 'bg-sky-100 text-sky-800 border-sky-300',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  violet: 'bg-violet-100 text-violet-800 border-violet-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
};

type CxpRow = {
  oc_id: string;
  numero: string;
  proveedor_id: string;
  proveedor: string;
  fecha: string;
  fecha_entrega_esperada: string | null;
  total: number;
  pagado: number;
  saldo_pendiente: number;
  estado: EstadoOC;
};

export default async function CxpPage() {
  const sb = await createClient();
  const { data } = await sb
    .from('v_cuentas_pagar')
    .select('*')
    .order('fecha_entrega_esperada', { ascending: true });
  const rows = (data ?? []) as unknown as CxpRow[];

  const totalDebido = rows.reduce((s, r) => s + Number(r.saldo_pendiente), 0);
  const pagado = rows.reduce((s, r) => s + Number(r.pagado), 0);
  const conSaldo = rows.filter((r) => Number(r.saldo_pendiente) > 0.01).length;

  return (
    <PageShell
      title="Cuentas por Pagar"
      description="Saldos pendientes con proveedores. Cada pago descuenta del saldo y, al llegar a 0, la OC pasa a PAGADA."
    >
      {/* Cards de resumen */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-slate-500">Saldo total pendiente</div>
            <div className="mt-1 text-2xl font-semibold text-rose-700">{formatPEN(totalDebido)}</div>
            <div className="text-xs text-slate-500">{conSaldo} OC{conSaldo === 1 ? '' : 's'} con saldo</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-slate-500">Pagado acumulado</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">{formatPEN(pagado)}</div>
            <div className="text-xs text-slate-500">sobre todas las OCs visibles</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-slate-500">Total facturado</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{formatPEN(totalDebido + pagado)}</div>
            <div className="text-xs text-slate-500">{rows.length} OC{rows.length === 1 ? '' : 's'}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OC</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">
                    Sin saldos pendientes.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const saldo = Number(r.saldo_pendiente);
                const tono = ESTADO_TONO[r.estado] ?? 'slate';
                const tieneSaldo = saldo > 0.01;
                const cancelable = r.estado !== 'CANCELADA' && r.estado !== 'BORRADOR';
                return (
                  <TableRow key={r.oc_id}>
                    <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                    <TableCell className="font-medium">{r.proveedor}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.fecha)}</TableCell>
                    <TableCell className="text-sm">{r.fecha_entrega_esperada ? formatDate(r.fecha_entrega_esperada) : '—'}</TableCell>
                    <TableCell className="text-right">{formatPEN(Number(r.total))}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatPEN(Number(r.pagado))}</TableCell>
                    <TableCell className={`text-right font-semibold ${tieneSaldo ? 'text-rose-700' : 'text-slate-400'}`}>
                      {formatPEN(saldo)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLS[tono]}`}>
                        {ESTADO_LABEL[r.estado] ?? r.estado}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tieneSaldo && cancelable && (
                          <RegistrarPagoBtn ocId={r.oc_id} ocNumero={r.numero} saldo={saldo} proveedor={r.proveedor} />
                        )}
                        <Link href={`/oc/${r.oc_id}`} className="inline-flex items-center text-xs text-slate-500 hover:text-corp-900">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
