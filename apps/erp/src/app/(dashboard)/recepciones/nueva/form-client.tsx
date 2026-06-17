'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { FormRow, FormGrid, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { crearRecepcionDesdeOC, type OCParaRecepcionar } from '@/server/actions/recepciones';

type Almacen = { id: string; codigo: string; nombre: string };

type LineaEditable = {
  oc_linea_id: string;
  material_id: string;
  material_codigo: string | null;
  material_nombre: string;
  cantidad_pendiente: number;
  precio_unitario: number;
  // editables:
  cantidad_recibida: string;
  numero_lote: string;
  fecha_vencimiento: string;
  costo_unitario: string;
  observacion: string;
  incluir: boolean;
};

export function NuevaRecepcionForm({
  ocs,
  almacenes,
}: {
  ocs: OCParaRecepcionar[];
  almacenes: Almacen[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ocId, setOcId] = useState<string>('');
  const [almacenId, setAlmacenId] = useState<string>('');
  const [guia, setGuia] = useState('');
  const [factura, setFactura] = useState('');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);

  const ocSeleccionada = useMemo(() => ocs.find((o) => o.id === ocId) ?? null, [ocs, ocId]);

  function onSelectOC(nuevaOcId: string) {
    setOcId(nuevaOcId);
    const oc = ocs.find((o) => o.id === nuevaOcId);
    if (!oc) {
      setLineas([]);
      return;
    }
    // Precargar almacén destino de la OC si está disponible y existe en la lista.
    if (oc.almacen_destino_id && almacenes.some((a) => a.id === oc.almacen_destino_id)) {
      setAlmacenId(oc.almacen_destino_id);
    } else if (!almacenId && almacenes[0]) {
      setAlmacenId(almacenes[0].id);
    }
    setLineas(
      oc.lineas.map((l) => ({
        oc_linea_id: l.id,
        material_id: l.material_id ?? '',
        material_codigo: l.material_codigo,
        material_nombre: l.material_nombre,
        cantidad_pendiente: l.cantidad_pendiente,
        precio_unitario: l.precio_unitario,
        cantidad_recibida: String(l.cantidad_pendiente),
        numero_lote: '',
        fecha_vencimiento: '',
        costo_unitario: String(l.precio_unitario),
        observacion: '',
        incluir: true,
      })),
    );
  }

  function actualizarLinea(idx: number, patch: Partial<LineaEditable>) {
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  const totalEstimado = useMemo(
    () =>
      lineas
        .filter((l) => l.incluir)
        .reduce(
          (s, l) => s + (Number(l.cantidad_recibida) || 0) * (Number(l.costo_unitario) || 0),
          0,
        ),
    [lineas],
  );

  function enviar() {
    if (!ocId) return toast.error('Selecciona una OC');
    if (!almacenId) return toast.error('Selecciona un almacén');

    const lineasIncluidas = lineas.filter((l) => l.incluir);
    if (lineasIncluidas.length === 0) {
      return toast.error('Marca al menos una línea para recepcionar');
    }

    // Validación local de cantidades.
    for (const l of lineasIncluidas) {
      const cant = Number(l.cantidad_recibida);
      if (!cant || cant <= 0) {
        return toast.error(`Cantidad inválida en ${l.material_nombre}`);
      }
      if (cant > l.cantidad_pendiente + 0.0001) {
        return toast.error(
          `Cantidad (${cant}) excede lo pendiente (${l.cantidad_pendiente}) en ${l.material_nombre}`,
        );
      }
    }

    const payload = {
      oc_id: ocId,
      almacen_id: almacenId,
      guia_proveedor: guia,
      factura_proveedor: factura,
      observacion,
      lineas: lineasIncluidas.map((l) => ({
        oc_linea_id: l.oc_linea_id,
        material_id: l.material_id,
        cantidad_recibida: Number(l.cantidad_recibida),
        numero_lote: l.numero_lote,
        fecha_vencimiento: l.fecha_vencimiento,
        costo_unitario: l.costo_unitario ? Number(l.costo_unitario) : undefined,
        observacion: l.observacion,
      })),
    };

    start(async () => {
      const r = await crearRecepcionDesdeOC(payload);
      if (r.ok && r.data) {
        toast.success(`Recepción ${r.data.numero} registrada`);
        router.push(`/recepciones/${r.data.id}`);
      } else {
        toast.error(r.error ?? 'Error al registrar la recepción');
      }
    });
  }

  return (
    <div className="space-y-6">
      <FormSection title="OC y almacén" description="Selecciona la orden de compra a recepcionar.">
        <FormGrid cols={2}>
          <FormRow label="Orden de compra" required>
            <select
              value={ocId}
              onChange={(e) => onSelectOC(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="">— Elige una OC pendiente —</option>
              {ocs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero} · {o.proveedor} · {o.estado} · {o.lineas.length} líneas pendientes
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Almacén destino" required>
            <select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="">— Selecciona almacén —</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </FormRow>
        </FormGrid>

        {ocSeleccionada && (
          <Card className="bg-slate-50 p-3 text-xs text-slate-600">
            <div className="grid gap-1 sm:grid-cols-3">
              <div>
                <span className="font-medium text-slate-500">OC:</span>{' '}
                <span className="font-mono">{ocSeleccionada.numero}</span>
              </div>
              <div>
                <span className="font-medium text-slate-500">Proveedor:</span>{' '}
                {ocSeleccionada.proveedor}
              </div>
              <div>
                <span className="font-medium text-slate-500">Almacén OC:</span>{' '}
                {ocSeleccionada.almacen_destino_codigo
                  ? `${ocSeleccionada.almacen_destino_codigo} — ${ocSeleccionada.almacen_destino_nombre}`
                  : '—'}
              </div>
            </div>
          </Card>
        )}
      </FormSection>

      <FormSection
        title="Documentación del proveedor"
        description="Datos del documento físico que acompaña la mercadería."
      >
        <FormGrid cols={3}>
          <FormRow label="Guía del proveedor">
            <Input
              type="text"
              value={guia}
              onChange={(e) => setGuia(e.target.value)}
              placeholder="Ej: T001-12345"
              disabled={pending}
            />
          </FormRow>
          <FormRow label="Factura del proveedor">
            <Input
              type="text"
              value={factura}
              onChange={(e) => setFactura(e.target.value)}
              placeholder="Ej: F001-9876"
              disabled={pending}
            />
          </FormRow>
          <FormRow label="Observación">
            <Input
              type="text"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Notas adicionales"
              disabled={pending}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection
        title="Líneas a recepcionar"
        description={
          ocSeleccionada
            ? `Marca las líneas que entraron y ajusta cantidades. Máximo = cantidad pendiente por línea.`
            : 'Selecciona una OC arriba para cargar sus líneas.'
        }
      >
        {lineas.length === 0 ? (
          <p className="text-sm text-slate-500">Sin líneas. Selecciona una OC primero.</p>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead className="w-28 text-right">Cant. recibida</TableHead>
                  <TableHead className="w-28">Lote</TableHead>
                  <TableHead className="w-36">Vencimiento</TableHead>
                  <TableHead className="w-28 text-right">Costo unit.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l, idx) => (
                  <TableRow key={l.oc_linea_id} className={l.incluir ? '' : 'opacity-50'}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={l.incluir}
                        onChange={(e) => actualizarLinea(idx, { incluir: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300"
                        disabled={pending}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium text-corp-900">{l.material_nombre}</div>
                      {l.material_codigo && (
                        <div className="font-mono text-[10px] text-slate-400">{l.material_codigo}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-slate-600">
                      {l.cantidad_pendiente.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        max={l.cantidad_pendiente}
                        value={l.cantidad_recibida}
                        onChange={(e) =>
                          actualizarLinea(idx, { cantidad_recibida: e.target.value })
                        }
                        disabled={pending || !l.incluir}
                        className="h-8 text-right"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={l.numero_lote}
                        onChange={(e) => actualizarLinea(idx, { numero_lote: e.target.value })}
                        placeholder="—"
                        disabled={pending || !l.incluir}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={l.fecha_vencimiento}
                        onChange={(e) =>
                          actualizarLinea(idx, { fecha_vencimiento: e.target.value })
                        }
                        disabled={pending || !l.incluir}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={l.costo_unitario}
                        onChange={(e) => actualizarLinea(idx, { costo_unitario: e.target.value })}
                        disabled={pending || !l.incluir}
                        className="h-8 text-right"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </FormSection>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-soft">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Total estimado</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            S/ {totalEstimado.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <Button onClick={enviar} disabled={pending || !ocId || lineas.length === 0} variant="premium">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Recepcionar
        </Button>
      </div>
    </div>
  );
}
