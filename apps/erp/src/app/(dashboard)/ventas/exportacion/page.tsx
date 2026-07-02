import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card, CardContent } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { EmptyState } from '@happy/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plane, Plus, AlertCircle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { formatDate } from '@happy/lib';

export const metadata = { title: 'Ventas de exportación' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireRol('gerente');
  const sb = await createClient();

  // Verificar si hay serie de exportación activa (bloquea creación si no)
  const { data: serieExp } = await sb
    .from('series_comprobantes')
    .select('serie, activa')
    .eq('tipo', 'FACTURA')
    .eq('canal', 'EXPORTACION')
    .eq('activa', true)
    .maybeSingle();

  // Listar ventas de exportación + drawback / SFE persistidos en ventas
  const { data: ventas } = await sb
    .from('v_ventas_exportacion')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(200);

  // Cargar drawback/SFE persistidos (no están en la vista, están en ventas)
  const ventaIds = (ventas ?? []).map((v) => (v as { id: string }).id);
  const drawbackPorVenta = new Map<string, { drawback: number; sfe: number }>();
  if (ventaIds.length > 0) {
    const { data: extras } = await sb
      .from('ventas')
      .select('id, drawback_estimado_pen, saldo_favor_exportador_pen')
      .in('id', ventaIds);
    for (const r of (extras ?? []) as { id: string; drawback_estimado_pen: number | null; saldo_favor_exportador_pen: number | null }[]) {
      drawbackPorVenta.set(r.id, {
        drawback: Number(r.drawback_estimado_pen ?? 0),
        sfe: Number(r.saldo_favor_exportador_pen ?? 0),
      });
    }
  }

  const totalUSD = (ventas ?? [])
    .filter((v) => (v as { moneda: string }).moneda === 'USD')
    .reduce((s, v) => s + Number((v as { total: number }).total), 0);
  const totalPEN = (ventas ?? []).reduce((s, v) => s + Number((v as { total_pen: number }).total_pen), 0);
  const totalDrawback = Array.from(drawbackPorVenta.values()).reduce((s, x) => s + x.drawback, 0);
  const totalSFE = Array.from(drawbackPorVenta.values()).reduce((s, x) => s + x.sfe, 0);

  return (
    <PageShell
      title="Ventas de exportación"
      description="Ventas al exterior según Art. 33 Ley IGV (Perú) — IGV 0%."
      actions={
        serieExp ? (
          <Button asChild variant="premium">
            <Link href="/ventas/exportacion/nueva">
              <Plus className="mr-1 h-4 w-4" /> Nueva venta de exportación
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <AlertCircle className="mr-1 h-4 w-4" /> Sin serie SUNAT
          </Button>
        )
      }
    >
      {!serieExp && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm text-amber-900">
              <p className="font-semibold">Módulo bloqueado — falta configurar serie SUNAT.</p>
              <p>
                Antes de emitir facturas de exportación necesitás la serie oficial asignada por SUNAT
                (típicamente empieza con <code className="rounded bg-white px-1 font-mono text-xs">F</code>).
                Solicitala en tu mesa de partes SOL y actívala en{' '}
                <Link href="/configuracion/series" className="underline">
                  Configuración → Series de comprobantes
                </Link>.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Total exportaciones</p>
          <p className="mt-1 font-display text-xl font-semibold text-emerald-700">
            S/ {totalPEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-slate-400">Equivalente en soles</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Facturado USD</p>
          <p className="mt-1 font-display text-xl font-semibold text-corp-900">
            $ {totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500"># Facturas</p>
          <p className="mt-1 font-display text-xl font-semibold text-corp-900">{ventas?.length ?? 0}</p>
        </Card>
        <Card className="p-4 border-happy-200 bg-happy-50/40">
          <p className="text-xs text-happy-700">Drawback estimado</p>
          <p className="mt-1 font-display text-xl font-semibold text-happy-900">
            S/ {totalDrawback.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-happy-700">Solicitar a SUNAT</p>
        </Card>
        <Card className="p-4 border-indigo-200 bg-indigo-50/40">
          <p className="text-xs text-indigo-700">SFE (Art. 34)</p>
          <p className="mt-1 font-display text-xl font-semibold text-indigo-900">
            S/ {totalSFE.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[10px] text-indigo-700">Saldo a favor exportador</p>
        </Card>
      </div>

      {(ventas ?? []).length === 0 ? (
        <EmptyState
          icon={<Plane className="h-6 w-6" />}
          title="Sin exportaciones registradas"
          description={
            serieExp
              ? 'Cuando registres tu primera venta de exportación aparecerá acá.'
              : 'Configurá primero la serie SUNAT para habilitar el módulo.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>N° Venta</TableHead>
                  <TableHead>País destino</TableHead>
                  <TableHead>INCOTERM</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Total origen</TableHead>
                  <TableHead className="text-right">T. Cambio</TableHead>
                  <TableHead className="text-right">Total S/</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(ventas ?? []).map((v) => {
                  const row = v as {
                    id: string;
                    numero: string;
                    fecha: string;
                    pais_destino: string;
                    incoterm: string | null;
                    moneda: string;
                    total: number;
                    tipo_cambio: number;
                    total_pen: number;
                    estado: string;
                  };
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">{formatDate(row.fecha)}</TableCell>
                      <TableCell className="font-mono text-xs">{row.numero}</TableCell>
                      <TableCell>{row.pais_destino}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{row.incoterm ?? '—'}</Badge></TableCell>
                      <TableCell><Badge variant="secondary">{row.moneda}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {Number(row.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{Number(row.tipo_cambio).toFixed(4)}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-700">
                        S/ {Number(row.total_pen).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.estado === 'COMPLETADA' ? 'success' : 'warning'}>{row.estado}</Badge>
                      </TableCell>
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
