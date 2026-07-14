import { Card, CardContent } from '@happy/ui/card';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Badge } from '@happy/ui/badge';
import { Landmark } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { ExportButtons } from '@/components/reportes/export-buttons';
import { formatDate, formatPEN } from '@happy/lib';
import { reportePagosPorCuenta } from '@/server/actions/reporte-pagos-cuenta';
import { hoy, inicioDeMes } from '@/server/actions/reportes-helpers';

export const metadata = { title: 'Pagos por cuenta / método' };
export const dynamic = 'force-dynamic';

type SP = { desde?: string; hasta?: string };

const METODO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo', YAPE: 'Yape', PLIN: 'Plin',
  TARJETA_DEBITO: 'Tarjeta débito', TARJETA_CREDITO: 'Tarjeta crédito',
  TRANSFERENCIA: 'Transferencia', DEPOSITO: 'Depósito',
  CREDITO: 'Crédito / saldo', WHATSAPP_PENDIENTE: 'WhatsApp pendiente',
};

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const desde = sp.desde || inicioDeMes();
  const hasta = sp.hasta || hoy();

  const { filas, totalPeriodo, totalPorMetodo, totalPorBanco } = await reportePagosPorCuenta(desde, hasta);

  const exportPayload = {
    titulo: 'Pagos por cuenta / método',
    subtitulo: `Del ${formatDate(desde)} al ${formatDate(hasta)}`,
    filtros: [`Desde ${formatDate(desde)} hasta ${formatDate(hasta)}`],
    cols: [
      { header: 'Banco', key: 'banco', width: 16 },
      { header: 'Cuenta destino', key: 'cuenta', width: 28 },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'N° pagos', key: 'cantidad', width: 10 },
      { header: 'Monto', key: 'monto', formato: 'moneda' as const, width: 16 },
    ],
    rows: filas.map((f) => ({ ...f, banco: f.banco ?? '—', metodo: METODO_LABEL[f.metodo] ?? f.metodo })),
    totales: { monto: totalPeriodo },
  };

  return (
    <PageShell
      title="Pagos por cuenta / método"
      description={`Del ${formatDate(desde)} al ${formatDate(hasta)} · conciliación financiera: a qué cuenta entró cada sol cobrado`}
      actions={<ExportButtons payload={exportPayload} />}
    >
      {/* Filtros */}
      <form className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-200 p-3" method="get">
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Desde</label>
          <input type="date" name="desde" defaultValue={desde} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-slate-500">Hasta</label>
          <input type="date" name="hasta" defaultValue={hasta} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 rounded-md bg-happy-500 px-4 text-sm font-semibold text-white hover:bg-happy-600">
          Aplicar
        </button>
      </form>

      {/* Totales por banco — lo que el cliente concilia contra sus estados de cuenta */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total cobrado en el período</p>
          <p className="mt-1 font-display text-2xl font-semibold text-emerald-600">{formatPEN(totalPeriodo)}</p>
        </Card>
        {totalPorBanco.map((b) => (
          <Card key={b.banco} className="p-4">
            <p className="text-xs text-slate-500">{b.banco}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-corp-900">{formatPEN(b.monto)}</p>
            <p className="text-[10px] text-slate-400">{b.cantidad} pago{b.cantidad === 1 ? '' : 's'}</p>
          </Card>
        ))}
      </div>

      {/* Totales por método — Yape separado de Plin, etc. */}
      {totalPorMetodo.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {totalPorMetodo.map((m) => (
            <Card key={m.metodo} className="p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{METODO_LABEL[m.metodo] ?? m.metodo}</p>
              <p className="font-display text-lg font-semibold text-corp-900">{formatPEN(m.monto)}</p>
              <p className="text-[10px] text-slate-400">{m.cantidad} pago{m.cantidad === 1 ? '' : 's'}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Detalle por cuenta */}
      {filas.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="Sin pagos en el período"
          description="No hay pagos registrados entre esas fechas."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Cuenta destino</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">N° pagos</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">% del total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {f.banco ? (
                        <Badge variant="secondary">{f.banco}</Badge>
                      ) : f.metodo === 'EFECTIVO' ? (
                        <Badge variant="success">Caja</Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{f.cuenta}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{METODO_LABEL[f.metodo] ?? f.metodo}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{f.cantidad}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{formatPEN(f.monto)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">
                      {totalPeriodo > 0 ? ((f.monto / totalPeriodo) * 100).toFixed(1) : '0.0'}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="mb-1 font-display font-semibold text-corp-900">Cómo leerlo</p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong>Banco</strong>: para conciliar contra el estado de cuenta (Yape entra a BCP, Plin y depósitos entran a INTERBANK — según sus cuentas del catálogo).</li>
          <li><strong>Cuenta destino</strong>: el botón exacto que el cajero eligió al cobrar.</li>
          <li><strong>Método</strong>: cómo pagó el cliente (Yape separado de Plin y de transferencia).</li>
          <li><strong>(sin cuenta)</strong>: pagos registrados sin botón de cuenta (ej. ventas antiguas o botones genéricos ya retirados).</li>
        </ul>
      </div>
    </PageShell>
  );
}
