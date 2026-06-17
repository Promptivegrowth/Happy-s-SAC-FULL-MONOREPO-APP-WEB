'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@happy/ui/dialog';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@happy/ui/table';
import {
  FileText,
  Link as LinkIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  actualizarImportacion,
  cambiarEstadoImportacion,
  desvincularOCdeImportacion,
  eliminarImportacion,
  vincularOCaImportacion,
  type EstadoImportacion,
  type ImportacionDetalle,
  type OCDisponible,
  type OCVinculada,
} from '@/server/actions/importaciones';
import { EstadoBadge } from '../estado-badge';

type Props = {
  importacion: ImportacionDetalle;
  ocsVinculadas: OCVinculada[];
  ocsDisponibles: OCDisponible[];
  transiciones: EstadoImportacion[];
  editable: boolean;
};

export function ImportacionDetalleClient({
  importacion,
  ocsVinculadas,
  ocsDisponibles,
  transiciones,
  editable,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [vincularOpen, setVincularOpen] = useState(false);

  // Estados editables de los costos / fechas / observación
  const [flete, setFlete] = useState<string>(String(importacion.flete));
  const [seguro, setSeguro] = useState<string>(String(importacion.seguro));
  const [aduanas, setAduanas] = useState<string>(String(importacion.aduanas));
  const [otros, setOtros] = useState<string>(String(importacion.otros_costos));
  const [adelanto, setAdelanto] = useState<string>(String(importacion.adelanto));
  const [observacion, setObservacion] = useState<string>(importacion.observacion ?? '');
  const [fechaEmbarque, setFechaEmbarque] = useState<string>(importacion.fecha_embarque ?? '');
  const [fechaArriboEsperada, setFechaArriboEsperada] = useState<string>(
    importacion.fecha_arribo_esperada ?? '',
  );
  const [fechaArriboReal, setFechaArriboReal] = useState<string>(
    importacion.fecha_arribo_real ?? '',
  );
  const [tipoCambio, setTipoCambio] = useState<string>(
    importacion.tipo_cambio != null ? String(importacion.tipo_cambio) : '',
  );

  const totalAdicional = useMemo(
    () =>
      (Number(flete) || 0) +
      (Number(seguro) || 0) +
      (Number(aduanas) || 0) +
      (Number(otros) || 0),
    [flete, seguro, aduanas, otros],
  );

  const sinOCs = ocsVinculadas.length === 0;
  const puedeEliminar = importacion.estado === 'PREPARACION' && sinOCs;

  function guardarCostosYDatos() {
    if (!editable) return;
    const patch = {
      flete: Number(flete) || 0,
      seguro: Number(seguro) || 0,
      aduanas: Number(aduanas) || 0,
      otros_costos: Number(otros) || 0,
      adelanto: Number(adelanto) || 0,
      observacion: observacion.trim() || null,
      fecha_embarque: fechaEmbarque || null,
      fecha_arribo_esperada: fechaArriboEsperada || null,
      fecha_arribo_real: fechaArriboReal || null,
      tipo_cambio: tipoCambio ? Number(tipoCambio) : null,
    };
    start(async () => {
      const r = await actualizarImportacion(importacion.id, patch);
      if (r.ok) {
        toast.success('Cambios guardados');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo guardar');
      }
    });
  }

  function cambiarEstado(nuevo: EstadoImportacion) {
    if (
      !confirm(
        `¿Cambiar el estado de la importación a ${nuevo}?` +
          (nuevo === 'RECIBIDA'
            ? '\n\nSi no hay fecha de arribo real, se completará con la fecha de hoy.'
            : ''),
      )
    ) {
      return;
    }
    start(async () => {
      const r = await cambiarEstadoImportacion(importacion.id, nuevo);
      if (r.ok) {
        toast.success(`Estado actualizado a ${nuevo}`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo cambiar el estado');
      }
    });
  }

  function vincular(ocId: string) {
    start(async () => {
      const r = await vincularOCaImportacion(importacion.id, ocId);
      if (r.ok) {
        toast.success('OC vinculada');
        setVincularOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo vincular');
      }
    });
  }

  function desvincular(ocId: string, numero: string) {
    if (!confirm(`Desvincular la OC ${numero} de esta importación?`)) return;
    start(async () => {
      const r = await desvincularOCdeImportacion(ocId);
      if (r.ok) {
        toast.success('OC desvinculada');
        router.refresh();
      } else {
        toast.error(r.error ?? 'No se pudo desvincular');
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar la importación ${importacion.numero}? Esta acción no se puede deshacer.`)) {
      return;
    }
    start(async () => {
      const r = await eliminarImportacion(importacion.id);
      if (r.ok) {
        toast.success('Importación eliminada');
        router.push('/compras/importaciones');
      } else {
        toast.error(r.error ?? 'No se pudo eliminar');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats de cabecera */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Moneda</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{importacion.moneda}</p>
          <p className="text-[10px] text-slate-500">
            TC:{' '}
            {importacion.tipo_cambio != null ? importacion.tipo_cambio.toFixed(4) : '—'}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Costos extra</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {totalAdicional.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[10px] text-slate-500">flete + seguro + aduanas + otros</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Adelanto</p>
          <p className="font-display text-2xl font-semibold text-amber-700">
            {(Number(adelanto) || 0).toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">OCs vinculadas</p>
          <p className="font-display text-2xl font-semibold text-corp-900">{ocsVinculadas.length}</p>
        </Card>
      </div>

      {/* Datos del embarque */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-corp-900">Datos del embarque</h2>
          {!editable && (
            <Badge variant="secondary" className="text-[10px]">
              Solo lectura · {importacion.estado}
            </Badge>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Tipo de cambio
            </label>
            <Input
              type="number"
              step="0.0001"
              min="0"
              value={tipoCambio}
              onChange={(e) => setTipoCambio(e.target.value)}
              disabled={!editable || pending || importacion.moneda === 'PEN'}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Fecha de embarque
            </label>
            <Input
              type="date"
              value={fechaEmbarque}
              onChange={(e) => setFechaEmbarque(e.target.value)}
              disabled={!editable || pending}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Arribo esperado
            </label>
            <Input
              type="date"
              value={fechaArriboEsperada}
              onChange={(e) => setFechaArriboEsperada(e.target.value)}
              disabled={!editable || pending}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Arribo real
            </label>
            <Input
              type="date"
              value={fechaArriboReal}
              onChange={(e) => setFechaArriboReal(e.target.value)}
              disabled={!editable || pending}
            />
          </div>
        </div>
      </Card>

      {/* Costos adicionales */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-corp-900">Costos adicionales</h2>
          <span className="font-display text-xl font-semibold text-corp-900">
            Total:{' '}
            {totalAdicional.toLocaleString('es-PE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            <span className="text-xs text-slate-500">{importacion.moneda}</span>
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Flete
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={flete}
              onChange={(e) => setFlete(e.target.value)}
              disabled={!editable || pending}
              className="text-right"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Seguro
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={seguro}
              onChange={(e) => setSeguro(e.target.value)}
              disabled={!editable || pending}
              className="text-right"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Aduanas
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={aduanas}
              onChange={(e) => setAduanas(e.target.value)}
              disabled={!editable || pending}
              className="text-right"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
              Otros
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={otros}
              onChange={(e) => setOtros(e.target.value)}
              disabled={!editable || pending}
              className="text-right"
            />
          </div>
        </div>
      </Card>

      {/* Adelantos */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-semibold text-corp-900">Adelantos</h2>
        <div className="max-w-xs">
          <label className="block text-xs font-medium uppercase tracking-wide text-corp-700">
            Monto adelantado
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={adelanto}
            onChange={(e) => setAdelanto(e.target.value)}
            disabled={!editable || pending}
            className="mt-1 text-right"
          />
          <p className="mt-1 text-xs text-slate-500">
            Acumulado de pagos previos al embarque, en {importacion.moneda}.
          </p>
        </div>
      </Card>

      {/* Observación */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-semibold text-corp-900">Observación</h2>
        <Textarea
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
          disabled={!editable || pending}
          rows={3}
          placeholder="Notas internas, agente de aduanas, naviera, BL, etc."
        />
      </Card>

      {editable && (
        <div className="flex justify-end">
          <Button onClick={guardarCostosYDatos} disabled={pending} variant="premium">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>
      )}

      {/* OCs vinculadas */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-corp-900">OCs vinculadas</h2>
            <p className="text-xs text-slate-500">
              Órdenes de compra agrupadas en este embarque.
            </p>
          </div>
          {editable && ocsDisponibles.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVincularOpen(true)}
              disabled={pending}
            >
              <Plus className="h-4 w-4" /> Vincular OC
            </Button>
          )}
        </div>

        {ocsVinculadas.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-slate-50 p-8 text-center">
            <FileText className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-600">Sin OCs vinculadas</p>
            <p className="mt-1 text-xs text-slate-500">
              {editable
                ? 'Usa "Vincular OC" para agregar órdenes de compra a este embarque.'
                : 'Esta importación no tiene OCs vinculadas.'}
            </p>
          </div>
        ) : (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° OC</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ocsVinculadas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/oc/${o.id}`} className="hover:text-happy-600 hover:underline">
                        {o.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-600">
                      {new Date(o.fecha + 'T00:00:00').toLocaleDateString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: '2-digit',
                      })}
                    </TableCell>
                    <TableCell
                      className="max-w-[220px] truncate text-sm"
                      title={o.proveedor_razon_social}
                    >
                      {o.proveedor_razon_social}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">
                        {o.estado}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold text-corp-900">
                      {o.total.toLocaleString('es-PE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-[10px] text-slate-400">{o.moneda}</span>
                    </TableCell>
                    <TableCell>
                      {editable && importacion.estado !== 'RECIBIDA' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => desvincular(o.id, o.numero)}
                          disabled={pending}
                        >
                          <Unlink className="h-3 w-3" /> Desvincular
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Cambio de estado */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-base font-semibold text-corp-900">
          Cambio de estado
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">Estado actual:</span>
          <EstadoBadge estado={importacion.estado} />
          {transiciones.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-slate-500">→</span>
              {transiciones.map((t) => (
                <Button
                  key={t}
                  variant={t === 'CANCELADA' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => cambiarEstado(t)}
                  disabled={pending}
                >
                  {t}
                </Button>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-500">(estado final, no se puede cambiar)</span>
          )}
        </div>
      </Card>

      {/* Eliminar */}
      {puedeEliminar && (
        <Card className="border-rose-200 bg-rose-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-rose-800">
                Eliminar importación
              </h3>
              <p className="text-xs text-rose-700">
                Disponible solo en estado PREPARACIÓN y sin OCs vinculadas.
              </p>
            </div>
            <Button variant="destructive" size="sm" onClick={eliminar} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Eliminar
            </Button>
          </div>
        </Card>
      )}

      {/* Dialog: vincular OC */}
      <Dialog open={vincularOpen} onOpenChange={setVincularOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular OC a {importacion.numero}</DialogTitle>
            <DialogDescription>
              Selecciona una OC sin importación asignada (estado BORRADOR o APROBADA).
            </DialogDescription>
          </DialogHeader>
          {ocsDisponibles.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No hay OCs disponibles para vincular.
            </p>
          ) : (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ocsDisponibles.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-sm"
                        title={o.proveedor_razon_social}
                      >
                        {o.proveedor_razon_social}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {o.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {o.total.toLocaleString('es-PE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="text-[10px] text-slate-400">{o.moneda}</span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="premium"
                          size="sm"
                          onClick={() => vincular(o.id)}
                          disabled={pending}
                        >
                          <LinkIcon className="h-3 w-3" /> Vincular
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
