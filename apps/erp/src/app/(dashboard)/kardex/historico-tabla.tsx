import Link from 'next/link';
import { Badge } from '@happy/ui/badge';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowDownCircle, ArrowUpCircle, ArrowRightLeft, Warehouse, History as HistoryIcon } from 'lucide-react';
import { EmptyState } from '@happy/ui/empty-state';
import type { KardexMov } from '@/server/actions/kardex';

/**
 * Tabla cronológica con saldo acumulado.
 * Compartida entre /kardex/variante/[id] y /kardex/material/[id].
 */
export function HistoricoTabla({
  movimientos,
  stockActual,
  unidadEtiqueta,
}: {
  movimientos: (KardexMov & { saldo: number })[];
  stockActual: number;
  unidadEtiqueta?: string;
}) {
  if (movimientos.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon className="h-6 w-6" />}
        title="Sin movimientos"
        description="Este ítem todavía no tiene movimientos de inventario registrados."
      />
    );
  }

  // El último movimiento tiene el saldo final. Útil para validar que coincide
  // con stock_actual (si no, hay desincronización del trigger).
  const saldoFinal = movimientos[movimientos.length - 1]!.saldo;
  const desalineado = Math.abs(saldoFinal - stockActual) > 0.001;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Stock actual</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {stockActual.toLocaleString('es-PE', { maximumFractionDigits: 4 })}{' '}
            <span className="text-sm font-normal text-slate-400">{unidadEtiqueta ?? ''}</span>
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Movimientos</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{movimientos.length}</p>
        </Card>
        <Card className={`p-3 ${desalineado ? 'border-amber-300 bg-amber-50/50' : ''}`}>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Saldo calculado</p>
          <p className={`font-display text-2xl font-semibold ${desalineado ? 'text-amber-700' : 'text-corp-900'}`}>
            {saldoFinal.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
          </p>
          {desalineado && (
            <p className="text-[10px] text-amber-700">⚠ no coincide con stock_actual (Δ {(saldoFinal - stockActual).toFixed(4)})</p>
          )}
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead className="text-right">Entrada</TableHead>
                <TableHead className="text-right">Salida</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Costo unit.</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((m) => {
                const esEntrada = m.tipo.startsWith('ENTRADA_');
                const esSalida = m.tipo.startsWith('SALIDA_');
                const fechaTxt = new Date(m.fecha).toLocaleString('es-PE', {
                  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                });
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-[11px] text-slate-600">{fechaTxt}</TableCell>
                    <TableCell>
                      <Badge
                        variant={esEntrada ? 'success' : esSalida ? 'destructive' : 'secondary'}
                        className="gap-1 text-[10px]"
                      >
                        {esEntrada && <ArrowDownCircle className="h-3 w-3" />}
                        {esSalida && <ArrowUpCircle className="h-3 w-3" />}
                        {m.tipo.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        <Warehouse className="h-3 w-3 text-slate-400" />
                        {m.almacen?.codigo ?? '—'}
                        {m.almacen_contraparte && (
                          <>
                            <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                            <span className="text-slate-500">{m.almacen_contraparte.codigo}</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-emerald-700">
                      {esEntrada ? `+${m.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}` : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-rose-700">
                      {esSalida ? `−${m.cantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}` : ''}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      {m.saldo.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-500">
                      {m.costo_unitario != null ? `S/ ${m.costo_unitario.toFixed(4)}` : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.referencia_tipo ? (
                        <Badge variant="outline" className="text-[10px]">{m.referencia_tipo}</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-slate-500" title={m.observacion ?? ''}>
                      {m.observacion ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Link href="/kardex" className="text-sm text-happy-600 hover:underline">
        ← Volver al kardex general
      </Link>
    </div>
  );
}
