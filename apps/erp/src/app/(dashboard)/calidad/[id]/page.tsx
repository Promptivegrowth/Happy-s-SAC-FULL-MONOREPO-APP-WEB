import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ArrowLeft, FileText, User, Scale, AlertTriangle } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { obtenerControl } from '@/server/actions/calidad';
import { getSession } from '@/server/session';
import { EliminarControlButton } from './eliminar-client';

export const metadata = { title: 'Detalle de control' };
export const dynamic = 'force-dynamic';

const COLOR_SEVERIDAD: Record<string, 'secondary' | 'warning' | 'destructive' | 'default'> = {
  BAJA: 'secondary',
  MEDIA: 'warning',
  ALTA: 'destructive',
  CRITICA: 'destructive',
};

const COLOR_ACCION: Record<string, 'secondary' | 'warning' | 'destructive' | 'success' | 'default'> = {
  REPROCESO: 'warning',
  SEGUNDA: 'secondary',
  MERMA: 'destructive',
  DEVOLVER_TALLER: 'destructive',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [res, sesion] = await Promise.all([obtenerControl(id), getSession()]);

  if (!res.ok || !res.data) {
    if (res.error?.toLowerCase().includes('no encontrado')) notFound();
    return (
      <PageShell title="Control" description="Error al cargar el control.">
        <Card className="border-danger/40 p-4">
          <p className="text-sm text-danger">{res.error ?? 'No se pudo cargar'}</p>
        </Card>
      </PageShell>
    );
  }

  const { control, detalle } = res.data;
  const fechaTxt = new Date(control.fecha).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const tasa =
    control.cantidad_revisada > 0
      ? (control.cantidad_ok / control.cantidad_revisada) * 100
      : 0;
  const tasaColor =
    tasa >= 95
      ? 'text-emerald-700'
      : tasa >= 85
        ? 'text-amber-700'
        : 'text-rose-700';

  const puedeEliminar =
    sesion.roles.includes('gerente') || sesion.roles.includes('jefe_produccion');

  return (
    <PageShell
      title={`Control ${control.numero}`}
      description={
        <span className="flex flex-wrap items-center gap-2 text-sm">
          {control.ot_numero && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <FileText className="h-3 w-3" /> OT {control.ot_numero}
            </Badge>
          )}
          {control.os_numero && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              OS {control.os_numero}
            </Badge>
          )}
          {control.producto_nombre && (
            <span className="text-slate-600">
              · {control.producto_codigo ? `${control.producto_codigo} ` : ''}
              {control.producto_nombre}
            </span>
          )}
        </span>
      }
      actions={
        <div className="flex gap-2">
          <Link href="/calidad">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Button>
          </Link>
          {puedeEliminar && (
            <EliminarControlButton id={control.id} numero={control.numero} />
          )}
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <Scale className="h-3 w-3" /> Revisado
          </p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {control.cantidad_revisada.toLocaleString('es-PE')}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">OK</p>
          <p className="font-display text-2xl font-semibold text-emerald-700">
            {control.cantidad_ok.toLocaleString('es-PE')}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Falla</p>
          <p className="font-display text-2xl font-semibold text-rose-700">
            {control.cantidad_falla.toLocaleString('es-PE')}
          </p>
          <p className="text-[10px] text-slate-500">
            Rep {control.cantidad_reproceso} · 2ª {control.cantidad_segunda} · Merma{' '}
            {control.cantidad_merma}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">% Calidad</p>
          <p className={`font-display text-2xl font-semibold ${tasaColor}`}>
            {tasa.toFixed(1)}%
          </p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Fecha</p>
          <p className="font-mono text-sm font-semibold text-corp-900">{fechaTxt}</p>
        </Card>
        <Card className="p-3">
          <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-slate-500">
            <User className="h-3 w-3" /> Revisor
          </p>
          <p className="text-sm font-semibold text-corp-900">{control.revisor_nombre ?? '—'}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Responsable taller</p>
          <p className="text-sm font-semibold text-corp-900">
            {control.responsable_taller_nombre ?? '—'}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Responsable operario</p>
          <p className="text-sm font-semibold text-corp-900">
            {control.responsable_operario_nombre ?? '—'}
          </p>
        </Card>
      </div>

      {(control.descuento_aplicado > 0 || control.observacion || control.ingreso_pt_numero) && (
        <Card className="bg-slate-50 p-3">
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            {control.descuento_aplicado > 0 && (
              <div>
                <span className="font-medium text-slate-500">Descuento aplicado: </span>
                <span className="font-mono text-corp-900">
                  S/ {control.descuento_aplicado.toFixed(2)}
                </span>
              </div>
            )}
            {control.ingreso_pt_numero && (
              <div>
                <span className="font-medium text-slate-500">Ingreso PT: </span>
                <span className="font-mono text-corp-900">{control.ingreso_pt_numero}</span>
              </div>
            )}
            {control.observacion && (
              <div className="sm:col-span-3">
                <span className="font-medium text-slate-500">Observación: </span>
                <span className="text-slate-700">{control.observacion}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Defecto</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Observación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalle.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle className="h-6 w-6 text-emerald-500" />
                      Sin defectos registrados. Todo lo revisado quedó OK.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                detalle.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="text-sm font-medium text-corp-900">{l.defecto_nombre}</div>
                      {l.defecto_codigo && (
                        <div className="font-mono text-[10px] text-slate-400">{l.defecto_codigo}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {l.defecto_severidad ? (
                        <Badge
                          variant={COLOR_SEVERIDAD[l.defecto_severidad] ?? 'default'}
                          className="text-[10px]"
                        >
                          {l.defecto_severidad}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-rose-700">
                      {l.cantidad.toLocaleString('es-PE')}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {l.talla ?? '—'}
                    </TableCell>
                    <TableCell>
                      {l.accion ? (
                        <Badge variant={COLOR_ACCION[l.accion] ?? 'default'} className="text-[10px]">
                          {l.accion}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="max-w-[260px] truncate text-xs text-slate-500"
                      title={l.observacion ?? ''}
                    >
                      {l.observacion ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
