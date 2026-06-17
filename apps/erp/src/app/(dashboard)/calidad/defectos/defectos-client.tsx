'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@happy/ui/badge';
import { Button } from '@happy/ui/button';
import { Card, CardContent } from '@happy/ui/card';
import { FormRow, FormGrid, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Plus, Pencil, Power, PowerOff, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearDefecto,
  actualizarDefecto,
  desactivarDefecto,
  reactivarDefecto,
  type AccionDefecto,
  type DefectoRow,
  type SeveridadDefecto,
} from '@/server/actions/calidad';
import { CALIDAD_ACCIONES, CALIDAD_SEVERIDADES } from '@/server/actions/calidad-helpers';

const COLOR_SEVERIDAD: Record<string, 'secondary' | 'warning' | 'destructive' | 'default'> = {
  BAJA: 'secondary',
  MEDIA: 'warning',
  ALTA: 'destructive',
  CRITICA: 'destructive',
};

type EdicionState = {
  codigo: string;
  nombre: string;
  descripcion: string;
  severidad: SeveridadDefecto;
  accion_default: AccionDefecto | '';
};

export function DefectosClient({ defectosIniciales }: { defectosIniciales: DefectoRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<EdicionState>({
    codigo: '',
    nombre: '',
    descripcion: '',
    severidad: 'MEDIA',
    accion_default: '',
  });

  function resetForm() {
    setForm({ codigo: '', nombre: '', descripcion: '', severidad: 'MEDIA', accion_default: '' });
  }

  function abrirCrear() {
    setEditandoId(null);
    resetForm();
    setCreando(true);
  }

  function abrirEditar(d: DefectoRow) {
    setCreando(false);
    setEditandoId(d.id);
    setForm({
      codigo: d.codigo,
      nombre: d.nombre,
      descripcion: d.descripcion ?? '',
      severidad: d.severidad ?? 'MEDIA',
      accion_default: d.accion_default ?? '',
    });
  }

  function cancelar() {
    setCreando(false);
    setEditandoId(null);
    resetForm();
  }

  function guardar() {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      return toast.error('Código y nombre son requeridos');
    }
    start(async () => {
      const payload = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion,
        severidad: form.severidad,
        accion_default: (form.accion_default || '') as AccionDefecto | '',
      };
      const r = creando
        ? await crearDefecto(payload)
        : editandoId
          ? await actualizarDefecto(editandoId, payload)
          : null;
      if (!r) return;
      if (r.ok) {
        toast.success(creando ? 'Defecto creado' : 'Defecto actualizado');
        cancelar();
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error al guardar');
      }
    });
  }

  function toggleActivo(d: DefectoRow) {
    if (
      d.activo &&
      !confirm(`Desactivar el defecto "${d.nombre}"? No aparecerá en nuevos controles.`)
    ) {
      return;
    }
    start(async () => {
      const r = d.activo ? await desactivarDefecto(d.id) : await reactivarDefecto(d.id);
      if (r.ok) {
        toast.success(d.activo ? 'Defecto desactivado' : 'Defecto reactivado');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  return (
    <div className="space-y-6">
      {(creando || editandoId) && (
        <FormSection
          title={creando ? 'Nuevo defecto' : 'Editar defecto'}
          description={
            creando
              ? 'Define un nuevo tipo de defecto detectable.'
              : 'Modifica los datos del defecto seleccionado.'
          }
        >
          <FormGrid cols={3}>
            <FormRow label="Código" required>
              <Input
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                placeholder="Ej: COST-001"
                disabled={pending}
              />
            </FormRow>
            <FormRow label="Nombre" required className="sm:col-span-2">
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Costura suelta"
                disabled={pending}
              />
            </FormRow>
            <FormRow label="Severidad" required>
              <select
                value={form.severidad}
                onChange={(e) => setForm({ ...form, severidad: e.target.value as SeveridadDefecto })}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                disabled={pending}
              >
                {CALIDAD_SEVERIDADES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Acción por defecto">
              <select
                value={form.accion_default}
                onChange={(e) =>
                  setForm({ ...form, accion_default: e.target.value as AccionDefecto | '' })
                }
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                disabled={pending}
              >
                <option value="">— ninguna —</option>
                {CALIDAD_ACCIONES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Descripción">
              <Input
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Detalle opcional"
                disabled={pending}
              />
            </FormRow>
          </FormGrid>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelar} disabled={pending}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button type="button" variant="premium" size="sm" onClick={guardar} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {creando ? 'Crear' : 'Guardar cambios'}
            </Button>
          </div>
        </FormSection>
      )}

      {!creando && !editandoId && (
        <div className="flex justify-end">
          <Button variant="premium" size="sm" onClick={abrirCrear}>
            <Plus className="h-4 w-4" /> Nuevo defecto
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Severidad</TableHead>
                <TableHead>Acción default</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {defectosIniciales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    No hay defectos. Crea el primero arriba.
                  </TableCell>
                </TableRow>
              ) : (
                defectosIniciales.map((d) => (
                  <TableRow key={d.id} className={d.activo ? '' : 'opacity-60'}>
                    <TableCell className="font-mono text-xs">{d.codigo}</TableCell>
                    <TableCell className="text-sm font-medium text-corp-900">{d.nombre}</TableCell>
                    <TableCell>
                      {d.severidad ? (
                        <Badge
                          variant={COLOR_SEVERIDAD[d.severidad] ?? 'default'}
                          className="text-[10px]"
                        >
                          {d.severidad}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {d.accion_default ?? '—'}
                    </TableCell>
                    <TableCell
                      className="max-w-[280px] truncate text-xs text-slate-500"
                      title={d.descripcion ?? ''}
                    >
                      {d.descripcion ?? '—'}
                    </TableCell>
                    <TableCell>
                      {d.activo ? (
                        <Badge variant="success" className="text-[10px]">
                          ACTIVO
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          INACTIVO
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirEditar(d)}
                          disabled={pending}
                          aria-label="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActivo(d)}
                          disabled={pending}
                          aria-label={d.activo ? 'Desactivar' : 'Reactivar'}
                        >
                          {d.activo ? (
                            <PowerOff className="h-4 w-4 text-rose-600" />
                          ) : (
                            <Power className="h-4 w-4 text-emerald-600" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
