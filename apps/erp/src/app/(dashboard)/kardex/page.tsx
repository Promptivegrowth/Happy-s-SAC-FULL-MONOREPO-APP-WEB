import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { formatDateTime, formatNumber } from '@happy/lib';

export const metadata = { title: 'Kardex' };
export const dynamic = 'force-dynamic';

export default async function KardexPage() {
  const sb = await createClient();
  const { data } = await sb.from('kardex_movimientos')
    .select('id, fecha, tipo, cantidad, observacion, almacenes(nombre), productos_variantes(sku, productos(nombre)), materiales(codigo, nombre)')
    .order('fecha', { ascending: false })
    .limit(200);

  return (
    <PageShell
      title="Kardex (movimientos)"
      description="Historial cronológico de entradas y salidas en todos los almacenes."
    >
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Almacén</TableHead>
              <TableHead>Item</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Notas</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data ?? []).map((m) => {
                const isEntrada = m.tipo.startsWith('ENTRADA_');
                const a = (m as unknown as { almacenes?: { nombre: string } }).almacenes;
                const v = (m as unknown as { productos_variantes?: { sku: string; productos?: { nombre: string } } }).productos_variantes;
                const mat = (m as unknown as { materiales?: { codigo: string; nombre: string } }).materiales;
                const item = v ? `${v.productos?.nombre ?? ''} · ${v.sku}` : mat ? `${mat.codigo} ${mat.nombre}` : '—';
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-slate-500">{formatDateTime(m.fecha)}</TableCell>
                    <TableCell>
                      <Badge variant={isEntrada ? 'success' : 'destructive'} className="text-[10px]">
                        {m.tipo.replace('ENTRADA_','+ ').replace('SALIDA_','− ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{a?.nombre}</TableCell>
                    <TableCell className="text-sm font-medium">{item}</TableCell>
                    <TableCell className={`text-right font-semibold ${isEntrada ? 'text-emerald-700' : 'text-red-600'}`}>
                      {isEntrada ? '+' : '−'}{formatNumber(Number(m.cantidad))}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-500">{m.observacion ?? ''}</TableCell>
                  </TableRow>
                );
              })}
              {(data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">Sin movimientos aún.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
