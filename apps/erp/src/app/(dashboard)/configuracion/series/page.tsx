import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { PageShell } from '@/components/page-shell';
import { requireRol } from '@/server/session';
import { listarSeriesComprobantes } from '@/server/actions/series-comprobantes';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { SeriesEditor } from './series-editor';

export const metadata = { title: 'Series de comprobantes' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireRol('gerente');
  const series = await listarSeriesComprobantes();

  // Split para poder resaltar la serie de exportación (pendiente asignar por SUNAT)
  const exportPendiente = series.filter(
    (s) => s.canal === 'EXPORTACION' && (!s.activa || s.serie === 'FEXP'),
  );
  const nacionales = series.filter((s) => s.canal !== 'EXPORTACION');
  const exportActivas = series.filter((s) => s.canal === 'EXPORTACION' && s.activa && s.serie !== 'FEXP');

  return (
    <PageShell
      title="Series de comprobantes"
      description="Configuración de series y correlativos SUNAT para boletas, facturas y facturas de exportación."
    >
      {exportPendiente.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 p-4">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-amber-900">
                Falta activar serie de Factura de Exportación
              </p>
              <p className="text-amber-800">
                Cuando SUNAT te asigne la serie oficial (típicamente <code className="rounded bg-white px-1 font-mono text-xs">FE01</code> o similar),
                editá la fila <code className="rounded bg-white px-1 font-mono text-xs">FEXP</code> abajo,
                reemplazá la serie por la real y marcala como <strong>activa</strong>.
                Hasta ese momento el módulo de ventas de exportación estará bloqueado.
              </p>
              <p className="text-xs text-amber-700">
                Referencia SUNAT: Art. 33 Ley IGV (Ley 30056), Res. de Superintendencia 097-2012/SUNAT (facturación electrónica de exportación).
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Series de exportación */}
      <Card>
        <div className="flex items-center justify-between border-b bg-slate-50 p-3">
          <div>
            <h3 className="text-sm font-semibold text-corp-900">Ventas de exportación</h3>
            <p className="text-xs text-slate-500">
              Factura de exportación (Art. 33 Ley IGV) — IGV 0%. Ecuador, Chile, Venezuela.
            </p>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Serie</TableHead>
              <TableHead>Correlativo actual</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Observación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...exportPendiente, ...exportActivas].length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">
                  No hay series de exportación configuradas.
                </TableCell>
              </TableRow>
            )}
            {[...exportPendiente, ...exportActivas].map((s) => (
              <TableRow key={s.id} className={s.serie === 'FEXP' ? 'bg-amber-50/60' : ''}>
                <TableCell><Badge variant="secondary">{s.tipo}</Badge></TableCell>
                <TableCell className="font-mono text-sm font-semibold">{s.serie}</TableCell>
                <TableCell className="font-mono text-xs">{s.ultimo_correlativo}</TableCell>
                <TableCell>
                  {s.activa ? (
                    <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Activa</Badge>
                  ) : (
                    <Badge variant="warning" className="gap-1"><AlertCircle className="h-3 w-3" /> Pendiente SUNAT</Badge>
                  )}
                </TableCell>
                <TableCell className="max-w-xs text-xs text-slate-600">{s.observacion ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <SeriesEditor serie={s} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Series nacionales */}
      <Card>
        <div className="flex items-center justify-between border-b bg-slate-50 p-3">
          <div>
            <h3 className="text-sm font-semibold text-corp-900">Ventas nacionales</h3>
            <p className="text-xs text-slate-500">Boletas y facturas para operaciones dentro del país.</p>
          </div>
          <SeriesEditor serie={null} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Serie</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Correlativo actual</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nacionales.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">
                  Aún no hay series nacionales configuradas.
                </TableCell>
              </TableRow>
            )}
            {nacionales.map((s) => (
              <TableRow key={s.id}>
                <TableCell><Badge variant="secondary">{s.tipo}</Badge></TableCell>
                <TableCell className="font-mono text-sm font-semibold">{s.serie}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{s.canal ?? 'TODOS'}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{s.ultimo_correlativo}</TableCell>
                <TableCell>
                  {s.activa ? (
                    <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Activa</Badge>
                  ) : (
                    <Badge variant="warning">Inactiva</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right"><SeriesEditor serie={s} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </PageShell>
  );
}
