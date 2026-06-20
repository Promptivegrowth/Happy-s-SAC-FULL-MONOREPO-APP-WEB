'use client';

import { useMemo, useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Loader2, Plus, Save, Trash2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearOC,
  buscarMaterialesParaOC,
  type ProveedorOpt,
  type AlmacenOpt,
  type UnidadOpt,
  type MaterialOpt,
} from '@/server/actions/oc';
import { TIPOS_OC, TIPO_LABEL, type TipoOC } from '@/server/actions/oc-helpers';

type LineaUI = {
  uiId: string;
  material_id: string | null;
  material_label: string;
  descripcion_libre: string;
  cantidad: number;
  unidad_id: string;
  unidad_codigo: string;
  precio_unitario: number;
  descuento_porcentaje: number;
  igv_aplicable: boolean;
};

const CONDICIONES = ['Contado', 'Crédito 15D', 'Crédito 30D', 'Crédito 45D', 'Crédito 60D', 'Crédito 90D'];

let nextId = 1;
const uid = () => `ln-${nextId++}`;

export function NuevaOCForm({
  proveedores,
  almacenes,
  unidades,
}: {
  proveedores: ProveedorOpt[];
  almacenes: AlmacenOpt[];
  unidades: UnidadOpt[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Cabecera
  const [proveedorId, setProveedorId] = useState('');
  const [tipo, setTipo] = useState<TipoOC>('NACIONAL');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [moneda, setMoneda] = useState<'PEN' | 'USD' | 'EUR'>('PEN');
  const [tipoCambio, setTipoCambio] = useState<string>('');
  const [condicion, setCondicion] = useState('Contado');
  const [adelanto, setAdelanto] = useState<string>('');
  const [observacion, setObservacion] = useState('');

  // Líneas
  const [lineas, setLineas] = useState<LineaUI[]>([]);

  // Buscador de materiales
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MaterialOpt[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      buscarMaterialesParaOC(q).then((r) => {
        setResults(r);
        setShowResults(true);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function agregarMaterial(m: MaterialOpt) {
    setLineas((prev) => [
      ...prev,
      {
        uiId: uid(),
        material_id: m.id,
        material_label: `${m.codigo} · ${m.nombre}`,
        descripcion_libre: '',
        cantidad: 1,
        unidad_id: m.unidad_id,
        unidad_codigo: m.unidad_codigo,
        precio_unitario: m.precio_referencial ?? 0,
        descuento_porcentaje: 0,
        igv_aplicable: true,
      },
    ]);
    setQ('');
    setResults([]);
    setShowResults(false);
  }

  function agregarLibre() {
    const unidad = unidades[0];
    if (!unidad) {
      toast.error('No hay unidades de medida configuradas');
      return;
    }
    setLineas((prev) => [
      ...prev,
      {
        uiId: uid(),
        material_id: null,
        material_label: '(libre)',
        descripcion_libre: '',
        cantidad: 1,
        unidad_id: unidad.id,
        unidad_codigo: unidad.codigo,
        precio_unitario: 0,
        descuento_porcentaje: 0,
        igv_aplicable: true,
      },
    ]);
  }

  function eliminar(uiId: string) {
    setLineas((prev) => prev.filter((l) => l.uiId !== uiId));
  }

  function patchLinea(uiId: string, patch: Partial<LineaUI>) {
    setLineas((prev) => prev.map((l) => (l.uiId === uiId ? { ...l, ...patch } : l)));
  }

  const totales = useMemo(() => {
    let sub = 0;
    let igv = 0;
    for (const l of lineas) {
      const bruto = l.cantidad * l.precio_unitario;
      const conDesc = bruto * (1 - (l.descuento_porcentaje ?? 0) / 100);
      sub += conDesc;
      if (l.igv_aplicable) igv += conDesc * 0.18;
    }
    return { sub, igv, total: sub + igv };
  }, [lineas]);

  function guardar() {
    if (!proveedorId) return toast.error('Seleccione proveedor');
    if (lineas.length === 0) return toast.error('Agregue al menos una línea');
    for (const l of lineas) {
      if (!l.material_id && !l.descripcion_libre.trim()) {
        return toast.error('Las líneas libres requieren descripción');
      }
      if (l.cantidad <= 0) return toast.error('Cantidad debe ser mayor a 0');
    }

    startTransition(async () => {
      const r = await crearOC({
        proveedor_id: proveedorId,
        tipo,
        fecha,
        fecha_entrega_esperada: fechaEntrega || null,
        almacen_destino: almacenId || null,
        moneda,
        tipo_cambio: moneda === 'PEN' ? null : tipoCambio ? Number(tipoCambio) : null,
        condicion_pago: condicion || null,
        adelanto: adelanto ? Number(adelanto) : null,
        observacion: observacion || null,
        lineas: lineas.map((l) => ({
          material_id: l.material_id,
          descripcion_libre: l.descripcion_libre || null,
          cantidad: l.cantidad,
          unidad_id: l.unidad_id,
          precio_unitario: l.precio_unitario,
          descuento_porcentaje: l.descuento_porcentaje,
          igv_aplicable: l.igv_aplicable,
        })),
      });
      if (!r.ok || !r.data) {
        toast.error(r.error ?? 'No se pudo crear');
        return;
      }
      toast.success(`OC ${r.data.numero} creada`);
      router.push(`/oc/${r.data.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Datos de la OC</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="Proveedor *">
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Seleccione —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razon_social} {p.ruc ? `(${p.ruc})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoOC)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {TIPOS_OC.map((t) => (
                <option key={t} value={t}>{TIPO_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Almacén destino">
            <select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— Sin asignar —</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Fecha OC">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Fecha entrega esperada">
            <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
          </Field>
          <Field label="Moneda">
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as 'PEN' | 'USD' | 'EUR')}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="PEN">PEN — Soles</option>
              <option value="USD">USD — Dólares</option>
              <option value="EUR">EUR — Euros</option>
            </select>
          </Field>
          {moneda !== 'PEN' && (
            <Field label="Tipo de cambio">
              <Input
                type="number"
                step="0.0001"
                value={tipoCambio}
                onChange={(e) => setTipoCambio(e.target.value)}
                placeholder="Ej: 3.75"
              />
            </Field>
          )}
          <Field label="Condición de pago">
            <select
              value={condicion}
              onChange={(e) => setCondicion(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {CONDICIONES.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </Field>
          <Field label="Adelanto pagado">
            <Input
              type="number"
              step="0.01"
              value={adelanto}
              onChange={(e) => setAdelanto(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <div className="md:col-span-3">
            <Field label="Observación">
              <Textarea
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                rows={2}
                placeholder="Notas internas, número de cotización del proveedor, etc."
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Líneas</CardTitle>
          <Button variant="secondary" size="sm" onClick={agregarLibre}>
            <Plus className="h-4 w-4" /> Línea libre
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buscador de materiales */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Buscar material por código o nombre…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setShowResults(true)}
              />
            </div>
            {showResults && results.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => agregarMaterial(m)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-orange-50"
                  >
                    <div className="font-medium text-slate-900">{m.codigo} · {m.nombre}</div>
                    <div className="text-xs text-slate-500">
                      Unidad: {m.unidad_codigo} · Ref: S/ {(m.precio_referencial ?? 0).toFixed(2)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabla de líneas */}
          {lineas.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Sin líneas. Busque materiales arriba o agregue una línea libre.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-2 py-2 text-left">Material / Descripción</th>
                    <th className="px-2 py-2 text-right">Cantidad</th>
                    <th className="px-2 py-2 text-left">Unidad</th>
                    <th className="px-2 py-2 text-right">P. unit.</th>
                    <th className="px-2 py-2 text-right">% Dcto</th>
                    <th className="px-2 py-2 text-center">IGV</th>
                    <th className="px-2 py-2 text-right">Subtotal</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const bruto = l.cantidad * l.precio_unitario;
                    const conDesc = bruto * (1 - l.descuento_porcentaje / 100);
                    return (
                      <tr key={l.uiId} className="border-b border-slate-100">
                        <td className="px-2 py-2">
                          {l.material_id ? (
                            <div className="text-xs">
                              <div className="font-medium text-slate-900">{l.material_label}</div>
                              <Input
                                value={l.descripcion_libre}
                                onChange={(e) => patchLinea(l.uiId, { descripcion_libre: e.target.value })}
                                placeholder="Observación opcional"
                                className="mt-1 h-7 text-xs"
                              />
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Input
                                value={l.descripcion_libre}
                                onChange={(e) => patchLinea(l.uiId, { descripcion_libre: e.target.value })}
                                placeholder="Descripción libre *"
                                className="h-7 text-xs"
                              />
                              <select
                                value={l.unidad_id}
                                onChange={(e) => {
                                  const u = unidades.find((x) => x.id === e.target.value);
                                  if (u) patchLinea(l.uiId, { unidad_id: u.id, unidad_codigo: u.codigo });
                                }}
                                className="h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"
                              >
                                {unidades.map((u) => (
                                  <option key={u.id} value={u.id}>{u.codigo} · {u.descripcion}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={l.cantidad}
                            onChange={(e) => patchLinea(l.uiId, { cantidad: Number(e.target.value) || 0 })}
                            className="h-7 w-24 text-right text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-600">{l.unidad_codigo}</td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={l.precio_unitario}
                            onChange={(e) => patchLinea(l.uiId, { precio_unitario: Number(e.target.value) || 0 })}
                            className="h-7 w-24 text-right text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            value={l.descuento_porcentaje}
                            onChange={(e) => patchLinea(l.uiId, { descuento_porcentaje: Number(e.target.value) || 0 })}
                            className="h-7 w-16 text-right text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={l.igv_aplicable}
                            onChange={(e) => patchLinea(l.uiId, { igv_aplicable: e.target.checked })}
                          />
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-medium text-slate-900">
                          {conDesc.toFixed(2)}
                        </td>
                        <td className="px-2 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => eliminar(l.uiId)}
                            className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totales */}
          {lineas.length > 0 && (
            <div className="ml-auto w-full max-w-xs space-y-1 rounded-md bg-slate-50 p-3 text-sm">
              <Total label="Subtotal" value={totales.sub} moneda={moneda} />
              <Total label="IGV 18%" value={totales.igv} moneda={moneda} />
              <Total label="Total" value={totales.total} moneda={moneda} bold />
              {adelanto && Number(adelanto) > 0 && (
                <>
                  <Total label="Adelanto" value={Number(adelanto)} moneda={moneda} muted />
                  <Total label="Saldo" value={totales.total - Number(adelanto)} moneda={moneda} bold />
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => router.push('/oc')}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
        <Button onClick={guardar} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Crear OC
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Total({
  label, value, moneda, bold, muted,
}: { label: string; value: number; moneda: string; bold?: boolean; muted?: boolean }) {
  const symbol = moneda === 'PEN' ? 'S/' : moneda === 'USD' ? 'US$' : '€';
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-slate-200 pt-1 font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="font-mono">{symbol} {value.toFixed(2)}</span>
    </div>
  );
}
