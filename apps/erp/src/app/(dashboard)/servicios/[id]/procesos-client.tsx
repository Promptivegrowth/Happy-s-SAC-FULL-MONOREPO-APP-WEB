'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Play, StopCircle, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { iniciarTicket, finalizarTicket, eliminarTicket } from '@/server/actions/tickets-operacion';

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

export type Operario = { id: string; codigo: string; nombre: string };
export type Area = { id: string; nombre: string };

export type Ticket = {
  id: string;
  proceso: string;
  inicio: string | null;
  fin: string | null;
  duracion_min: number | null;
  cantidad: number | null;
  observacion: string | null;
  operario: { id: string; nombres: string; apellido_paterno: string | null } | null;
  area: { id: string; nombre: string } | null;
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtDur(min: number | null): string {
  if (min === null || min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

export function TicketsOperacionOS({
  osId,
  otId,
  procesoOS,
  cantidadOS,
  tickets,
  operarios,
  areas,
}: {
  osId: string;
  otId: string | null;
  procesoOS: string;
  cantidadOS: number;
  tickets: Ticket[];
  operarios: Operario[];
  areas: Area[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [proceso, setProceso] = useState<string>(procesoOS);
  const [operarioId, setOperarioId] = useState<string>('');
  const [areaId, setAreaId] = useState<string>('');
  const [cantidad, setCantidad] = useState<string>(String(cantidadOS || ''));
  const [observacion, setObservacion] = useState<string>('');

  function reset() {
    setProceso(procesoOS);
    setOperarioId('');
    setAreaId('');
    setCantidad(String(cantidadOS || ''));
    setObservacion('');
  }

  function iniciar() {
    start(async () => {
      const r = await iniciarTicket({
        os_id: osId,
        ot_id: otId ?? '',
        proceso: proceso as (typeof PROCESOS)[number],
        operario_id: operarioId,
        area_id: areaId,
        cantidad: Number(cantidad) || 0,
        observacion,
      });
      if (r.ok) {
        toast.success('Proceso iniciado');
        reset();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  function finalizar(id: string) {
    start(async () => {
      const r = await finalizarTicket(id);
      if (r.ok) {
        toast.success('Proceso finalizado');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar este registro de proceso?')) return;
    start(async () => {
      const r = await eliminarTicket(id);
      if (r.ok) {
        toast.success('Eliminado');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Registrá quién hizo cada etapa, cuándo empezó y terminó. Sirve para costear y trazar el avance.
        </p>
        {!open && (
          <Button variant="premium" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Iniciar proceso
          </Button>
        )}
      </div>

      {open && (
        <Card className="border-happy-300 bg-happy-50/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-display text-sm font-semibold text-corp-900">Iniciar proceso</h4>
            <Button variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }} disabled={pending}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <FormGrid cols={2}>
            <FormRow label="Proceso" required>
              <select
                value={proceso}
                onChange={(e) => setProceso(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PROCESOS.map((p) => (
                  <option key={p} value={p}>{p.replace('_', ' ')}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Operario" hint="Quién está ejecutando este proceso">
              <select
                value={operarioId}
                onChange={(e) => setOperarioId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sin asignar —</option>
                {operarios.map((o) => (
                  <option key={o.id} value={o.id}>{o.nombre || o.codigo}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Área" hint="Opcional, para tarifa por minuto">
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— Sin área —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Cantidad" hint="Unidades trabajadas en esta sesión">
              <Input
                type="number"
                min={0}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder={String(cantidadOS)}
              />
            </FormRow>
          </FormGrid>
          <div className="mt-3">
            <FormRow label="Observación">
              <Input
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Nota opcional"
              />
            </FormRow>
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={pending}>Cancelar</Button>
            <Button variant="premium" onClick={iniciar} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Iniciar
            </Button>
          </div>
        </Card>
      )}

      {tickets.length === 0 ? (
        <p className="px-2 py-4 text-sm text-slate-400">
          Sin procesos registrados todavía.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proceso</TableHead>
              <TableHead>Operario</TableHead>
              <TableHead>Inicio</TableHead>
              <TableHead>Fin</TableHead>
              <TableHead className="text-right">Duración</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => {
              const enCurso = t.fin === null && t.inicio !== null;
              const opNombre = t.operario
                ? `${t.operario.nombres} ${t.operario.apellido_paterno ?? ''}`.trim()
                : '—';
              return (
                <TableRow key={t.id} className={enCurso ? 'bg-amber-50/40' : ''}>
                  <TableCell>
                    <Badge variant={enCurso ? 'warning' : 'default'} className="text-[10px]">
                      {t.proceso.replace('_', ' ')}
                    </Badge>
                    {t.area?.nombre && (
                      <span className="ml-1.5 text-[10px] text-slate-500">· {t.area.nombre}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{opNombre}</TableCell>
                  <TableCell className="text-xs text-slate-600">{fmtDateTime(t.inicio)}</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {enCurso ? <span className="font-medium text-amber-700">en curso</span> : fmtDateTime(t.fin)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{fmtDur(t.duracion_min)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{t.cantidad ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {enCurso && (
                        <Button variant="corp" size="sm" onClick={() => finalizar(t.id)} disabled={pending}>
                          <StopCircle className="h-3.5 w-3.5" /> Finalizar
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => eliminar(t.id)} disabled={pending}>
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
