'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { FormRow, FormGrid, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearControl,
  type AccionDefecto,
  type DefectoRow,
  type OTLookup,
  type OSLookup,
  type ProductoLookup,
  type TallerLookup,
  type OperarioLookup,
  type TallaPrenda,
} from '@/server/actions/calidad';
import { CALIDAD_ACCIONES, CALIDAD_TALLAS } from '@/server/actions/calidad-helpers';

type ModoOrigen = 'OT' | 'OS' | 'PRODUCTO';

type LineaEditable = {
  uid: string;
  defecto_id: string;
  cantidad: string;
  talla: string;
  accion: AccionDefecto;
  observacion: string;
};

function nuevoUid() {
  return Math.random().toString(36).slice(2, 10);
}

export function NuevoControlForm({
  defectos,
  ots,
  oss,
  productos,
  talleres,
  operarios,
}: {
  defectos: DefectoRow[];
  ots: OTLookup[];
  oss: OSLookup[];
  productos: ProductoLookup[];
  talleres: TallerLookup[];
  operarios: OperarioLookup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [modo, setModo] = useState<ModoOrigen>('OT');
  const [otId, setOtId] = useState('');
  const [osId, setOsId] = useState('');
  const [productoId, setProductoId] = useState('');
  const [cantidadRevisada, setCantidadRevisada] = useState('');
  const [tallerId, setTallerId] = useState('');
  const [operarioId, setOperarioId] = useState('');
  const [descuento, setDescuento] = useState('');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);

  // Productor derivado del origen elegido (informativo).
  const productoInferido = useMemo(() => {
    if (modo === 'OT' && otId) {
      const o = ots.find((x) => x.id === otId);
      if (o?.producto_nombre) return `${o.producto_codigo ?? ''} ${o.producto_nombre}`.trim();
    }
    if (modo === 'OS' && osId) {
      const o = oss.find((x) => x.id === osId);
      if (o?.producto_nombre) return `${o.producto_codigo ?? ''} ${o.producto_nombre}`.trim();
    }
    if (modo === 'PRODUCTO' && productoId) {
      const p = productos.find((x) => x.id === productoId);
      if (p) return `${p.codigo} ${p.nombre}`;
    }
    return null;
  }, [modo, otId, osId, productoId, ots, oss, productos]);

  const totalFalla = useMemo(
    () => lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0),
    [lineas],
  );
  const cantRev = Number(cantidadRevisada) || 0;
  const cantOk = Math.max(0, cantRev - totalFalla);

  function agregarLinea() {
    const def = defectos[0];
    if (!def) {
      toast.error('No hay defectos en el catálogo');
      return;
    }
    setLineas((prev) => [
      ...prev,
      {
        uid: nuevoUid(),
        defecto_id: def.id,
        cantidad: '1',
        talla: '',
        accion: def.accion_default ?? 'REPROCESO',
        observacion: '',
      },
    ]);
  }

  function actualizarLinea(uid: string, patch: Partial<LineaEditable>) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.uid !== uid) return l;
        // Si cambia el defecto, sugerir la acción por defecto.
        if (patch.defecto_id && patch.defecto_id !== l.defecto_id) {
          const def = defectos.find((d) => d.id === patch.defecto_id);
          return {
            ...l,
            ...patch,
            accion: def?.accion_default ?? l.accion,
          };
        }
        return { ...l, ...patch };
      }),
    );
  }

  function quitarLinea(uid: string) {
    setLineas((prev) => prev.filter((l) => l.uid !== uid));
  }

  function enviar() {
    // Validaciones locales.
    if (modo === 'OT' && !otId) return toast.error('Selecciona una OT');
    if (modo === 'OS' && !osId) return toast.error('Selecciona una OS');
    if (modo === 'PRODUCTO' && !productoId) return toast.error('Selecciona un producto');
    if (!cantRev || cantRev <= 0) return toast.error('Cantidad revisada debe ser > 0');
    if (totalFalla > cantRev) {
      return toast.error(`Total fallas (${totalFalla}) supera lo revisado (${cantRev})`);
    }
    for (const l of lineas) {
      const c = Number(l.cantidad);
      if (!c || c <= 0) return toast.error('Cada línea de defecto requiere cantidad > 0');
      if (!l.defecto_id) return toast.error('Cada línea requiere un defecto');
    }

    // OS conserva ot_id implícito desde la BD; al construir el payload solo
    // mandamos el campo seleccionado para no provocar mismatch.
    const payload = {
      ot_id: modo === 'OT' ? otId : '',
      os_id: modo === 'OS' ? osId : '',
      producto_id:
        modo === 'PRODUCTO'
          ? productoId
          : modo === 'OT'
            ? (ots.find((o) => o.id === otId)?.producto_id ?? '')
            : (oss.find((o) => o.id === osId)?.producto_id ?? ''),
      ingreso_pt_id: '',
      cantidad_revisada: cantRev,
      responsable_taller_id: tallerId || '',
      responsable_operario_id: operarioId || '',
      descuento_aplicado: descuento ? Number(descuento) : undefined,
      observacion,
      detalle: lineas.map((l) => ({
        defecto_id: l.defecto_id,
        cantidad: Number(l.cantidad),
        talla: (l.talla || '') as TallaPrenda | '',
        accion: l.accion,
        observacion: l.observacion,
      })),
    };

    start(async () => {
      const r = await crearControl(payload);
      if (r.ok && r.data) {
        toast.success(`Control ${r.data.numero} registrado`);
        router.push(`/calidad/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'Error al registrar el control');
      }
    });
  }

  return (
    <div className="space-y-6">
      <FormSection title="Origen de la inspección" description="Indica de dónde proviene lo que se está revisando.">
        <FormGrid cols={3}>
          <FormRow label="Tipo de origen" required>
            <select
              value={modo}
              onChange={(e) => {
                const m = e.target.value as ModoOrigen;
                setModo(m);
                setOtId('');
                setOsId('');
                setProductoId('');
              }}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="OT">Orden de Trabajo (OT)</option>
              <option value="OS">Orden de Servicio (OS)</option>
              <option value="PRODUCTO">Producto directo</option>
            </select>
          </FormRow>

          {modo === 'OT' && (
            <FormRow label="OT" required className="sm:col-span-2">
              <select
                value={otId}
                onChange={(e) => setOtId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                disabled={pending}
              >
                <option value="">— Selecciona OT —</option>
                {ots.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.numero} · {o.estado} · {o.producto_nombre ?? 'sin producto'}
                  </option>
                ))}
              </select>
            </FormRow>
          )}

          {modo === 'OS' && (
            <FormRow label="OS" required className="sm:col-span-2">
              <select
                value={osId}
                onChange={(e) => setOsId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                disabled={pending}
              >
                <option value="">— Selecciona OS —</option>
                {oss.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.numero} · {o.estado}
                    {o.ot_numero ? ` · OT ${o.ot_numero}` : ''} ·{' '}
                    {o.producto_nombre ?? 'sin producto'}
                  </option>
                ))}
              </select>
            </FormRow>
          )}

          {modo === 'PRODUCTO' && (
            <FormRow label="Producto" required className="sm:col-span-2">
              <select
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                disabled={pending}
              >
                <option value="">— Selecciona producto —</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} — {p.nombre}
                  </option>
                ))}
              </select>
            </FormRow>
          )}
        </FormGrid>

        {productoInferido && (
          <Card className="bg-slate-50 p-3 text-xs text-slate-600">
            <span className="font-medium text-slate-500">Producto:</span> {productoInferido}
          </Card>
        )}
      </FormSection>

      <FormSection title="Cantidades" description="Total revisado y resumen automático del resultado.">
        <FormGrid cols={4}>
          <FormRow label="Cantidad revisada" required>
            <Input
              type="number"
              min="1"
              step="1"
              value={cantidadRevisada}
              onChange={(e) => setCantidadRevisada(e.target.value)}
              disabled={pending}
              placeholder="Ej: 100"
            />
          </FormRow>
          <Card className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Total fallas</p>
            <p className="font-display text-2xl font-semibold text-rose-700">{totalFalla}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Cantidad OK</p>
            <p className="font-display text-2xl font-semibold text-emerald-700">{cantOk}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">% Calidad</p>
            <p className="font-display text-2xl font-semibold text-corp-900">
              {cantRev > 0 ? ((cantOk / cantRev) * 100).toFixed(1) : '0.0'}%
            </p>
          </Card>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Defectos detectados"
        description="Agrega una fila por cada tipo de defecto. Si no hay fallas, deja la lista vacía."
      >
        <div className="space-y-3">
          {lineas.length === 0 ? (
            <p className="text-sm text-slate-500">Sin defectos. Todo lo revisado se considerará OK.</p>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Defecto</TableHead>
                    <TableHead className="w-24 text-right">Cantidad</TableHead>
                    <TableHead className="w-28">Talla</TableHead>
                    <TableHead className="w-40">Acción</TableHead>
                    <TableHead>Observación</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map((l) => (
                    <TableRow key={l.uid}>
                      <TableCell>
                        <select
                          value={l.defecto_id}
                          onChange={(e) =>
                            actualizarLinea(l.uid, { defecto_id: e.target.value })
                          }
                          className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                          disabled={pending}
                        >
                          {defectos.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.codigo} — {d.nombre} ({d.severidad ?? '—'})
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={l.cantidad}
                          onChange={(e) =>
                            actualizarLinea(l.uid, { cantidad: e.target.value })
                          }
                          disabled={pending}
                          className="h-8 text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          value={l.talla}
                          onChange={(e) =>
                            actualizarLinea(l.uid, { talla: e.target.value })
                          }
                          className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                          disabled={pending}
                        >
                          <option value="">— sin talla —</option>
                          {CALIDAD_TALLAS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <select
                          value={l.accion}
                          onChange={(e) =>
                            actualizarLinea(l.uid, {
                              accion: e.target.value as AccionDefecto,
                            })
                          }
                          className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                          disabled={pending}
                        >
                          {CALIDAD_ACCIONES.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="text"
                          value={l.observacion}
                          onChange={(e) =>
                            actualizarLinea(l.uid, { observacion: e.target.value })
                          }
                          placeholder="Detalle (opcional)"
                          disabled={pending}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => quitarLinea(l.uid)}
                          disabled={pending}
                          aria-label="Quitar fila"
                        >
                          <Trash2 className="h-4 w-4 text-rose-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={agregarLinea}
              disabled={pending || defectos.length === 0}
            >
              <Plus className="h-4 w-4" /> Agregar defecto
            </Button>
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Responsable y descuento"
        description="A quién se le atribuye la falla (taller u operario) y, si aplica, el descuento al pago."
      >
        <FormGrid cols={3}>
          <FormRow label="Taller responsable">
            <select
              value={tallerId}
              onChange={(e) => setTallerId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="">— ninguno —</option>
              {talleres.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Operario responsable">
            <select
              value={operarioId}
              onChange={(e) => setOperarioId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="">— ninguno —</option>
              {operarios.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigo ? `${o.codigo} — ` : ''}
                  {o.nombre}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Descuento aplicado (S/)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              placeholder="0.00"
              disabled={pending}
            />
          </FormRow>
        </FormGrid>
        <FormRow label="Observación general">
          <Input
            type="text"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Notas del control (opcional)"
            disabled={pending}
          />
        </FormRow>
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-white p-4 shadow-soft">
        <Button onClick={enviar} disabled={pending} variant="premium">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Registrar control
        </Button>
      </div>
    </div>
  );
}

// Re-export para que ESLint/TS no quiten import si TallaPrenda no se usa directamente.
export type { TallaPrenda };
