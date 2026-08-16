'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { ChevronDown, ChevronRight, Layers, Wrench, Clock, ExternalLink } from 'lucide-react';
import { formatPEN, formatDate, formatTallaChip } from '@happy/lib';
import type { HistorialReceta } from '@/server/actions/recetas';

/**
 * Vista de solo-lectura del historial de versiones de una receta (materiales y
 * procesos). Cada versión es una tarjeta colapsable: al abrirla se ve el detalle
 * de esa versión tal como quedó registrada.
 */
export function HistorialClient({
  historial,
  recetaActualId,
}: {
  historial: HistorialReceta;
  /** id de la receta desde la que se entró (para resaltar la versión actual). */
  recetaActualId: string;
}) {
  return (
    <div className="space-y-8">
      {/* MATERIALES */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-corp-700" />
          <h2 className="font-display text-lg font-semibold text-corp-900">Materiales (BOM)</h2>
          <Badge variant="secondary" className="text-[10px]">{historial.materiales.length} versión(es)</Badge>
        </div>
        {historial.materiales.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">Sin versiones de materiales.</Card>
        ) : (
          historial.materiales.map((v) => (
            <VersionMateriales key={v.recetaId} v={v} esActual={v.recetaId === recetaActualId} />
          ))
        )}
      </section>

      {/* PROCESOS */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-corp-700" />
          <h2 className="font-display text-lg font-semibold text-corp-900">Procesos / Operaciones</h2>
          <Badge variant="secondary" className="text-[10px]">{historial.procesos.length} versión(es)</Badge>
        </div>
        {historial.procesos.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">Sin versiones de procesos.</Card>
        ) : (
          historial.procesos.map((v) => <VersionProcesos key={v.version} v={v} />)
        )}
      </section>
    </div>
  );
}

function VersionMateriales({
  v,
  esActual,
}: {
  v: HistorialReceta['materiales'][number];
  esActual: boolean;
}) {
  const [abierto, setAbierto] = useState(esActual);

  return (
    <Card className={`overflow-hidden ${v.activa ? 'border-emerald-200' : ''}`}>
      <button
        type="button"
        onClick={() => setAbierto((s) => !s)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"
      >
        {abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        <span className="font-display text-lg font-semibold text-corp-900">{v.version}</span>
        {v.activa ? (
          <Badge variant="success" className="text-[10px]">Activa</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Histórica</Badge>
        )}
        {esActual && <Badge variant="outline" className="text-[10px]">Estás viendo esta</Badge>}
        <span className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          <span>{v.totalLineas} líneas</span>
          <span className="font-semibold text-emerald-700">{formatPEN(v.costoTotal)}</span>
          <span>{v.createdAt ? formatDate(v.createdAt) : '—'}</span>
        </span>
      </button>

      {abierto && (
        <div className="border-t">
          {v.notas && <p className="bg-slate-50 px-4 py-2 text-xs text-slate-500">📝 {v.notas}</p>}
          <div className="flex items-center justify-end gap-2 border-b bg-slate-50/60 px-4 py-2">
            <Link
              href={`/recetas/${v.recetaId}`}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-corp-700 transition hover:border-corp-400"
            >
              <ExternalLink className="h-3 w-3" /> Abrir esta versión
            </Link>
          </div>
          {v.lineas.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">Esta versión no tiene líneas.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Talla</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead>Va al taller</TableHead>
                    <TableHead>Va al serv. botón</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {v.lineas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant="outline" className="text-[10px]">{formatTallaChip(l.talla)}</Badge></TableCell>
                      <TableCell>
                        <div className="text-sm font-medium text-corp-900">{l.materialNombre}</div>
                        <div className="font-mono text-[10px] text-slate-500">{l.materialCodigo}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{l.categoria}</Badge></TableCell>
                      <TableCell className="text-right font-mono text-sm">{l.cantidad}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPEN(l.costo)}</TableCell>
                      <TableCell>{l.saleAServicio ? <Badge className="bg-happy-500 text-[10px]">Sí</Badge> : <span className="text-xs text-slate-400">No</span>}</TableCell>
                      <TableCell>{l.saleAOjalBoton ? <Badge className="bg-happy-500 text-[10px]">Sí</Badge> : <span className="text-xs text-slate-400">No</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function VersionProcesos({ v }: { v: HistorialReceta['procesos'][number] }) {
  const [abierto, setAbierto] = useState(v.activo);

  return (
    <Card className={`overflow-hidden ${v.activo ? 'border-emerald-200' : ''}`}>
      <button
        type="button"
        onClick={() => setAbierto((s) => !s)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"
      >
        {abierto ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
        <span className="font-display text-lg font-semibold text-corp-900">{v.version}</span>
        {v.activo ? (
          <Badge variant="success" className="text-[10px]">Activa</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Histórica</Badge>
        )}
        <span className="ml-auto flex items-center gap-4 text-xs text-slate-500">
          <span>{v.totalOperaciones} operaciones</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{v.tiempoTotalMin} min</span>
        </span>
      </button>

      {abierto && (
        <div className="border-t">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead>Proceso</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Talla</TableHead>
                  <TableHead className="text-right">Tiempo est. (min)</TableHead>
                  <TableHead>Tercerizado</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.operaciones.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-right font-mono text-xs text-slate-400">{o.orden}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{o.proceso.replace('_', ' ')}</Badge></TableCell>
                    <TableCell className="text-sm">{o.area ?? '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">{o.talla ? formatTallaChip(o.talla) : 'Todas'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{o.tiempoEstandarMin}</TableCell>
                    <TableCell>{o.esTercerizado ? <Badge variant="warning" className="text-[10px]">Sí</Badge> : <span className="text-xs text-slate-400">No</span>}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-slate-500">{o.observacion ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}
