'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { FormRow, FormGrid, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Save, Plus, Trash2, AlertTriangle, Search, ScanLine, Zap, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  crearTraslado,
  consultarStockEnAlmacen,
  type VarianteItem,
  type MaterialItem,
} from '@/server/actions/traslados';

type Almacen = { id: string; codigo: string; nombre: string };

type LineaEditable = {
  uid: string; // id local
  tipo: 'VARIANTE' | 'MATERIAL';
  variante_id: string;
  material_id: string;
  // Display
  display: string;
  sub: string;
  cantidad: string;
  observacion: string;
};

let UID = 0;
function nextUid() {
  UID += 1;
  return `l${UID}`;
}

export function NuevoTrasladoForm({
  almacenes,
  variantes,
  materiales,
}: {
  almacenes: Almacen[];
  variantes: VarianteItem[];
  materiales: MaterialItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origenId, setOrigenId] = useState<string>('');
  const [destinoId, setDestinoId] = useState<string>('');
  const [motivo, setMotivo] = useState('');
  const [observacion, setObservacion] = useState('');
  const [lineas, setLineas] = useState<LineaEditable[]>([]);

  // Datos vehículo/conductor + bultos (mig 58) — todos opcionales.
  const [modalidad, setModalidad] = useState<'PRIVADO' | 'PUBLICO'>('PRIVADO');
  const [choferNombre, setChoferNombre] = useState('');
  const [choferDni, setChoferDni] = useState('');
  const [choferLicencia, setChoferLicencia] = useState('');
  const [vehiculoPlaca, setVehiculoPlaca] = useState('');
  const [vehiculoMarca, setVehiculoMarca] = useState('');
  const [vehiculoTarjeta, setVehiculoTarjeta] = useState('');
  const [transportistaRuc, setTransportistaRuc] = useState('');
  const [transportistaRazon, setTransportistaRazon] = useState('');
  const [cantidadBultos, setCantidadBultos] = useState('');
  const [tipoBulto, setTipoBulto] = useState('COSTALES');
  const [pesoTotal, setPesoTotal] = useState('');

  // Stock disponible en el almacén origen (por variante / material id).
  const [stockVar, setStockVar] = useState<Record<string, number>>({});
  const [stockMat, setStockMat] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);

  // Carga de stock cuando cambia el origen o las líneas (entidades únicas).
  const varianteIds = useMemo(
    () => Array.from(new Set(lineas.filter((l) => l.variante_id).map((l) => l.variante_id))),
    [lineas],
  );
  const materialIds = useMemo(
    () => Array.from(new Set(lineas.filter((l) => l.material_id).map((l) => l.material_id))),
    [lineas],
  );

  useEffect(() => {
    if (!origenId || (varianteIds.length === 0 && materialIds.length === 0)) {
      setStockVar({});
      setStockMat({});
      return;
    }
    let cancelled = false;
    setStockLoading(true);
    consultarStockEnAlmacen(origenId, varianteIds, materialIds)
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.data) {
          setStockVar(r.data.variantes);
          setStockMat(r.data.materiales);
        }
      })
      .finally(() => {
        if (!cancelled) setStockLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [origenId, varianteIds, materialIds]);

  const destinosDisponibles = useMemo(
    () => almacenes.filter((a) => a.id !== origenId),
    [almacenes, origenId],
  );

  function addLinea() {
    setLineas((prev) => [
      ...prev,
      {
        uid: nextUid(),
        tipo: 'VARIANTE',
        variante_id: '',
        material_id: '',
        display: '',
        sub: '',
        cantidad: '1',
        observacion: '',
      },
    ]);
  }

  // ─── CARGA RÁPIDA ──────────────────────────────────────────────────────
  // Permite pegar/escanear muchos códigos a la vez para evitar agregar
  // uno por uno cuando hay que mover decenas de productos.
  const [bulkText, setBulkText] = useState('');
  const [bulkQty, setBulkQty] = useState('1');
  const [scanInput, setScanInput] = useState('');
  const [bulkResultado, setBulkResultado] = useState<{ ok: number; noEncontrados: string[] } | null>(null);

  function buscarPorCodigo(codigo: string): { tipo: 'VARIANTE'; v: VarianteItem } | { tipo: 'MATERIAL'; m: MaterialItem } | null {
    const c = codigo.trim();
    if (!c) return null;
    const cUpper = c.toUpperCase();
    // Prioridad: SKU exacto > código de barras > código de material
    const v = variantes.find(
      (x) => x.sku.toUpperCase() === cUpper || (x.codigo_barras ?? '').toUpperCase() === cUpper,
    );
    if (v) return { tipo: 'VARIANTE', v };
    const m = materiales.find((x) => x.codigo.toUpperCase() === cUpper);
    if (m) return { tipo: 'MATERIAL', m };
    return null;
  }

  function agregarOSumar(found: NonNullable<ReturnType<typeof buscarPorCodigo>>, cantidadAgregar: number) {
    // Si ya existe línea con ese mismo ítem, SUMAR cantidad. Si no, crear línea nueva.
    const matchId = found.tipo === 'VARIANTE' ? found.v.id : found.m.id;
    const matchTipo = found.tipo;
    setLineas((prev) => {
      const idx = prev.findIndex(
        (l) =>
          l.tipo === matchTipo &&
          ((matchTipo === 'VARIANTE' && l.variante_id === matchId) ||
            (matchTipo === 'MATERIAL' && l.material_id === matchId)),
      );
      if (idx >= 0) {
        const copia = [...prev];
        const nuevaCant = (Number(copia[idx]!.cantidad) || 0) + cantidadAgregar;
        copia[idx] = { ...copia[idx]!, cantidad: String(nuevaCant) };
        return copia;
      }
      const nueva: LineaEditable =
        found.tipo === 'VARIANTE'
          ? {
              uid: nextUid(),
              tipo: 'VARIANTE',
              variante_id: found.v.id,
              material_id: '',
              display: `${found.v.sku} · ${found.v.producto_nombre}`,
              sub: `Talla ${found.v.talla.replace('T', '')}`,
              cantidad: String(cantidadAgregar),
              observacion: '',
            }
          : {
              uid: nextUid(),
              tipo: 'MATERIAL',
              variante_id: '',
              material_id: found.m.id,
              display: `${found.m.codigo} · ${found.m.nombre}`,
              sub: found.m.unidad ?? '—',
              cantidad: String(cantidadAgregar),
              observacion: '',
            };
      return [...prev, nueva];
    });
  }

  function procesarBulk() {
    const qty = Number(bulkQty);
    if (!qty || qty <= 0) {
      toast.error('Cantidad inválida');
      return;
    }
    const codigos = bulkText
      .split(/[\n,;\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (codigos.length === 0) {
      toast.error('Pegá al menos un código');
      return;
    }
    let ok = 0;
    const noEnc: string[] = [];
    for (const c of codigos) {
      const f = buscarPorCodigo(c);
      if (f) {
        agregarOSumar(f, qty);
        ok++;
      } else {
        noEnc.push(c);
      }
    }
    setBulkResultado({ ok, noEncontrados: noEnc });
    setBulkText('');
    if (ok > 0) toast.success(`${ok} ítem(s) agregados`);
    if (noEnc.length > 0) toast.warning(`${noEnc.length} código(s) no reconocidos`);
  }

  function procesarScan() {
    const codigo = scanInput.trim();
    if (!codigo) return;
    const f = buscarPorCodigo(codigo);
    if (f) {
      agregarOSumar(f, 1);
      setScanInput('');  // limpiar para siguiente escaneo
    } else {
      toast.error(`Código no encontrado: ${codigo}`);
      setScanInput('');
    }
  }

  function removeLinea(uid: string) {
    setLineas((prev) => prev.filter((l) => l.uid !== uid));
  }

  function updateLinea(uid: string, patch: Partial<LineaEditable>) {
    setLineas((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  }

  function setLineaVariante(uid: string, v: VarianteItem) {
    updateLinea(uid, {
      tipo: 'VARIANTE',
      variante_id: v.id,
      material_id: '',
      display: `${v.sku} · ${v.producto_nombre}`,
      sub: `Talla ${v.talla.replace('T', '')}`,
    });
  }

  function setLineaMaterial(uid: string, m: MaterialItem) {
    updateLinea(uid, {
      tipo: 'MATERIAL',
      variante_id: '',
      material_id: m.id,
      display: `${m.codigo} · ${m.nombre}`,
      sub: m.unidad ?? '—',
    });
  }

  // Modal post-guardado: ¿imprimir la guía?
  const [saved, setSaved] = useState<{ id: string; codigo: string } | null>(null);

  function enviar(ejecutarAhora: boolean) {
    if (!origenId) return toast.error('Selecciona almacén origen');
    if (!destinoId) return toast.error('Selecciona almacén destino');
    if (origenId === destinoId) return toast.error('Origen y destino deben ser distintos');
    if (lineas.length === 0) return toast.error('Agrega al menos una línea');

    for (const l of lineas) {
      if (!l.variante_id && !l.material_id) {
        return toast.error('Cada línea debe tener un producto o material');
      }
      const cant = Number(l.cantidad);
      if (!cant || cant <= 0) {
        return toast.error(`Cantidad inválida en línea "${l.display || '(vacía)'}"`);
      }
      if (l.tipo === 'VARIANTE' && !Number.isInteger(cant)) {
        return toast.error(`Los productos se trasladan en unidades enteras. Corregí "${l.display}" (cantidad ${cant})`);
      }
    }

    const payload = {
      almacen_origen: origenId,
      almacen_destino: destinoId,
      motivo,
      observacion,
      lineas: lineas.map((l) => ({
        variante_id: l.variante_id || undefined,
        material_id: l.material_id || undefined,
        cantidad: Number(l.cantidad),
        observacion: l.observacion,
      })),
      modalidad,
      chofer_nombre: choferNombre,
      chofer_dni: choferDni,
      chofer_licencia: choferLicencia,
      vehiculo_placa: vehiculoPlaca,
      vehiculo_marca: vehiculoMarca,
      vehiculo_tarjeta_circulacion: vehiculoTarjeta,
      transportista_ruc: transportistaRuc,
      transportista_razon_social: transportistaRazon,
      cantidad_bultos: cantidadBultos ? Number(cantidadBultos) : undefined,
      tipo_bulto: tipoBulto,
      peso_total_kg: pesoTotal ? Number(pesoTotal) : undefined,
      ejecutar_ahora: ejecutarAhora,
    };

    start(async () => {
      const r = await crearTraslado(payload);
      if (r.ok && r.data) {
        toast.success(
          ejecutarAhora
            ? `Traslado ${r.data.codigo} ejecutado — stock movido`
            : `Traslado ${r.data.codigo} creado en borrador`,
        );
        // Preguntar si quiere imprimir
        setSaved({ id: r.data.id, codigo: r.data.codigo });
      } else {
        toast.error(r.error ?? 'Error al crear traslado');
      }
    });
  }

  const totalCantidad = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  return (
    <div className="space-y-6">
      <FormSection
        title="Almacenes"
        description="Origen = de dónde sale el stock. Destino = a dónde llega."
      >
        <FormGrid cols={2}>
          <FormRow label="Almacén origen" required>
            <select
              value={origenId}
              onChange={(e) => {
                setOrigenId(e.target.value);
                if (e.target.value === destinoId) setDestinoId('');
              }}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="">— Selecciona origen —</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Almacén destino" required>
            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending || !origenId}
            >
              <option value="">
                {origenId ? '— Selecciona destino —' : 'Selecciona origen primero'}
              </option>
              {destinosDisponibles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} — {a.nombre}
                </option>
              ))}
            </select>
          </FormRow>
        </FormGrid>
      </FormSection>

      <FormSection title="Datos del traslado" description="Información opcional para trazabilidad.">
        <FormGrid cols={2}>
          <FormRow label="Motivo">
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Reabastecimiento tienda, devolución a central, etc."
              disabled={pending}
              rows={3}
            />
          </FormRow>
          <FormRow label="Observación">
            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Notas adicionales"
              disabled={pending}
              rows={3}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      {/* Vehículo y conductor — se pre-imprimen en la guía de remisión.
          Todos son opcionales — si están vacíos, la guía deja líneas para
          completar a mano (mismo comportamiento que el sistema anterior). */}
      <FormSection
        title="Vehículo y conductor (opcional)"
        description="Se pre-imprimen en la guía de remisión. Si los dejas vacíos, la guía trae líneas para llenar a mano."
      >
        <FormGrid cols={3}>
          <FormRow label="Modalidad">
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value as 'PRIVADO' | 'PUBLICO')}
              className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
              disabled={pending}
            >
              <option value="PRIVADO">PRIVADO (vehículo del remitente)</option>
              <option value="PUBLICO">PÚBLICO (transportista externo)</option>
            </select>
          </FormRow>
          <FormRow label="Placa vehículo">
            <Input value={vehiculoPlaca} onChange={(e) => setVehiculoPlaca(e.target.value.toUpperCase())} placeholder="ABC-123" disabled={pending} />
          </FormRow>
          <FormRow label="Marca vehículo">
            <Input value={vehiculoMarca} onChange={(e) => setVehiculoMarca(e.target.value)} placeholder="Chevrolet, Toyota…" disabled={pending} />
          </FormRow>
          <FormRow label="Chofer (nombre completo)">
            <Input value={choferNombre} onChange={(e) => setChoferNombre(e.target.value)} placeholder="Javier Mauricio Ramírez" disabled={pending} />
          </FormRow>
          <FormRow label="DNI chofer">
            <Input value={choferDni} onChange={(e) => setChoferDni(e.target.value.replace(/\D/g, ''))} maxLength={8} placeholder="12345678" disabled={pending} />
          </FormRow>
          <FormRow label="N° Licencia">
            <Input value={choferLicencia} onChange={(e) => setChoferLicencia(e.target.value)} placeholder="Q40541396" disabled={pending} />
          </FormRow>
          <FormRow label="N° Tarjeta circulación (MTC)">
            <Input value={vehiculoTarjeta} onChange={(e) => setVehiculoTarjeta(e.target.value)} disabled={pending} />
          </FormRow>
          {modalidad === 'PUBLICO' && (
            <>
              <FormRow label="RUC transportista" required>
                <Input value={transportistaRuc} onChange={(e) => setTransportistaRuc(e.target.value.replace(/\D/g, ''))} maxLength={11} placeholder="20601234567" disabled={pending} />
              </FormRow>
              <FormRow label="Razón social transportista" required>
                <Input value={transportistaRazon} onChange={(e) => setTransportistaRazon(e.target.value)} disabled={pending} />
              </FormRow>
            </>
          )}
        </FormGrid>

        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Bultos transportados</p>
          <FormGrid cols={3}>
            <FormRow label="Cantidad de bultos">
              <Input
                type="number"
                min="0"
                step="1"
                value={cantidadBultos}
                onChange={(e) => setCantidadBultos(e.target.value.replace(/[.,]/g, ''))}
                placeholder="5"
                disabled={pending}
              />
            </FormRow>
            <FormRow label="Tipo de bulto">
              <select
                value={tipoBulto}
                onChange={(e) => setTipoBulto(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
                disabled={pending}
              >
                <option value="COSTALES">Costales</option>
                <option value="CAJAS">Cajas</option>
                <option value="PAQUETES">Paquetes</option>
                <option value="BULTOS">Bultos</option>
                <option value="ROLLOS">Rollos</option>
                <option value="OTROS">Otros</option>
              </select>
            </FormRow>
            <FormRow label="Peso total (kg)" hint="Opcional — se imprime en la guía">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={pesoTotal}
                onChange={(e) => setPesoTotal(e.target.value)}
                placeholder="0.00"
                disabled={pending}
              />
            </FormRow>
          </FormGrid>
        </div>
      </FormSection>

      {/* ─── CARGA RÁPIDA (escaneo / pegado masivo) — COLAPSABLE ─────────────
          Cliente pidió reducir esta sección porque en el 90% de casos el
          usuario agrega 2-3 líneas manualmente. La carga rápida solo hace
          falta en traslados grandes (>10 SKUs), así queda escondida por
          default y el foco visual va a "Líneas" que es lo que se usa siempre. */}
      <details className="rounded-xl border border-slate-200 bg-white/50">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-corp-900 hover:bg-slate-50">
          <ScanLine className="mr-1.5 inline h-4 w-4 text-sky-600" />
          Carga rápida (opcional) — escanear o pegar lista
          <span className="ml-2 text-xs font-normal text-slate-500">para traslados grandes</span>
        </summary>
        <div className="border-t p-4">
        <div className="grid gap-3 md:grid-cols-2">
          {/* Modo 1: escaneo uno por uno */}
          <Card className="space-y-2 border-sky-200 bg-sky-50/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700">
              <ScanLine className="h-4 w-4" />
              Escanear con lector USB
            </div>
            <p className="text-[11px] text-slate-600">
              Apuntá el cursor al campo de abajo y disparen el lector. Cada escaneo agrega 1 unidad (o suma a la línea existente).
            </p>
            <div className="relative">
              <ScanLine className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-400" />
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); procesarScan(); } }}
                placeholder="Esperando escaneo…"
                className="pl-9"
                disabled={pending}
                autoFocus={false}
              />
            </div>
          </Card>

          {/* Modo 2: pegar lista */}
          <Card className="space-y-2 border-violet-200 bg-violet-50/30 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">
              <Upload className="h-4 w-4" />
              Pegar lista de códigos
            </div>
            <p className="text-[11px] text-slate-600">
              Uno por línea (o separados por coma). Cada código agregará la cantidad indicada.
            </p>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="PR0001&#10;AC0002&#10;DT0006-T10&#10;..."
              rows={4}
              disabled={pending}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-600">Cantidad por código:</label>
              <Input
                type="number"
                min="1"
                step="1"
                value={bulkQty}
                onChange={(e) => setBulkQty(e.target.value)}
                className="h-8 w-20 text-sm"
                disabled={pending}
              />
              <Button
                type="button"
                onClick={procesarBulk}
                size="sm"
                disabled={pending || !bulkText.trim()}
                className="ml-auto bg-violet-600 text-white hover:bg-violet-700"
              >
                <Zap className="h-3 w-3" /> Agregar todos
              </Button>
            </div>
            {bulkResultado && (
              <div className="rounded-md bg-white p-2 text-xs">
                <span className="font-medium text-emerald-700">✓ {bulkResultado.ok} agregados</span>
                {bulkResultado.noEncontrados.length > 0 && (
                  <div className="mt-1 text-rose-700">
                    ✗ No encontrados: <span className="font-mono">{bulkResultado.noEncontrados.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
        </div>
      </details>

      <FormSection
        title="Líneas"
        description={
          origenId
            ? 'Agrega líneas con producto (variante) o material. El stock disponible se carga del almacén origen.'
            : 'Selecciona almacén origen para ver stock disponible al agregar líneas.'
        }
      >
        <div className="space-y-3">
          {lineas.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aún no hay líneas. Haz clic en &quot;Agregar línea&quot;.
            </p>
          ) : (
            <Card className="overflow-x-auto overflow-y-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead className="min-w-[380px]">Ítem</TableHead>
                    <TableHead className="w-28 text-right">Stock origen</TableHead>
                    <TableHead className="w-24 text-right">Cantidad</TableHead>
                    <TableHead className="w-40">Observación</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map((l) => {
                    const stockDisp =
                      l.tipo === 'VARIANTE' && l.variante_id
                        ? (stockVar[l.variante_id] ?? 0)
                        : l.tipo === 'MATERIAL' && l.material_id
                          ? (stockMat[l.material_id] ?? 0)
                          : null;
                    const cant = Number(l.cantidad) || 0;
                    const insuficiente =
                      stockDisp != null && cant > stockDisp + 0.0001;
                    return (
                      <TableRow key={l.uid}>
                        <TableCell>
                          <select
                            value={l.tipo}
                            onChange={(e) => {
                              const tipo = e.target.value as 'VARIANTE' | 'MATERIAL';
                              updateLinea(l.uid, {
                                tipo,
                                variante_id: '',
                                material_id: '',
                                display: '',
                                sub: '',
                              });
                            }}
                            className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                            disabled={pending}
                          >
                            <option value="VARIANTE">Producto</option>
                            <option value="MATERIAL">Material</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          {l.tipo === 'VARIANTE' ? (
                            <ComboVariante
                              variantes={variantes}
                              valueId={l.variante_id}
                              display={l.display}
                              sub={l.sub}
                              disabled={pending}
                              onPick={(v) => setLineaVariante(l.uid, v)}
                              onClear={() =>
                                updateLinea(l.uid, {
                                  variante_id: '',
                                  display: '',
                                  sub: '',
                                })
                              }
                            />
                          ) : (
                            <ComboMaterial
                              materiales={materiales}
                              valueId={l.material_id}
                              display={l.display}
                              sub={l.sub}
                              disabled={pending}
                              onPick={(m) => setLineaMaterial(l.uid, m)}
                              onClear={() =>
                                updateLinea(l.uid, {
                                  material_id: '',
                                  display: '',
                                  sub: '',
                                })
                              }
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {stockDisp == null ? (
                            <span className="text-slate-400">—</span>
                          ) : stockLoading ? (
                            <Loader2 className="ml-auto h-3 w-3 animate-spin text-slate-400" />
                          ) : (
                            <span
                              className={
                                insuficiente
                                  ? 'font-semibold text-rose-600'
                                  : 'text-slate-700'
                              }
                            >
                              {stockDisp.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              // Variantes (productos) siempre enteros — no se
                              // trasladan medias unidades. Materiales pueden
                              // tener decimales (ej: 2.5 metros de tela).
                              step={l.tipo === 'VARIANTE' ? '1' : '0.0001'}
                              min={l.tipo === 'VARIANTE' ? '1' : '0'}
                              value={l.cantidad}
                              onChange={(e) => {
                                let v = e.target.value;
                                if (l.tipo === 'VARIANTE') {
                                  // Bloquear puntos/comas para forzar entero
                                  v = v.replace(/[.,]/g, '');
                                }
                                updateLinea(l.uid, { cantidad: v });
                              }}
                              onKeyDown={(e) => {
                                if (l.tipo === 'VARIANTE' && (e.key === '.' || e.key === ',')) {
                                  e.preventDefault();
                                }
                              }}
                              disabled={pending}
                              className={`h-8 text-right ${insuficiente ? 'border-rose-400' : ''}`}
                            />
                            {insuficiente && (
                              <AlertTriangle
                                className="h-4 w-4 flex-none text-rose-500"
                                aria-label="Excede stock disponible"
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={l.observacion}
                            onChange={(e) =>
                              updateLinea(l.uid, { observacion: e.target.value })
                            }
                            disabled={pending}
                            className="h-8"
                            placeholder="—"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLinea(l.uid)}
                            disabled={pending}
                            aria-label="Eliminar línea"
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          <Button type="button" variant="outline" size="sm" onClick={addLinea} disabled={pending}>
            <Plus className="h-4 w-4" /> Agregar línea
          </Button>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-soft">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Total cantidad</p>
          <p className="font-display text-2xl font-semibold text-corp-900">
            {totalCantidad.toLocaleString('es-PE', { maximumFractionDigits: 4 })}
          </p>
          <p className="text-[10px] text-slate-500">
            {lineas.length} línea(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => enviar(false)}
            disabled={pending || !origenId || !destinoId || lineas.length === 0}
            variant="outline"
            title="Solo guarda el traslado en BORRADOR. El stock no se mueve hasta que despachas manualmente."
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar borrador
          </Button>
          <Button
            onClick={() => enviar(true)}
            disabled={pending || !origenId || !destinoId || lineas.length === 0}
            variant="premium"
            title="Guarda y ejecuta el traslado en un paso: descuenta stock del origen y lo suma al destino."
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar y ejecutar traslado
          </Button>
        </div>
      </div>

      {/* Dialog: ¿imprimir la guía? — se abre al guardar exitosamente */}
      {saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 font-display text-lg font-semibold text-corp-900">
              Traslado {saved.codigo} guardado
            </h3>
            <p className="mb-6 text-sm text-slate-600">
              ¿Querés imprimir la guía de remisión ahora? Ya quedó guardada en el sistema — podés imprimirla más tarde desde el detalle.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  router.push(`/traslados/${saved.id}`);
                }}
              >
                No, solo guardar
              </Button>
              <Button
                variant="premium"
                onClick={() => {
                  // Redirigir al detalle con ?guia=1 → auto-descarga PDF
                  router.push(`/traslados/${saved.id}?guia=1`);
                }}
              >
                Sí, imprimir PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Combobox autocomplete ligero (inline) ----------

function ComboBase<T>({
  items,
  matchText,
  renderLabel,
  renderSub,
  valueId,
  display,
  sub,
  disabled,
  placeholder,
  onPick,
  onClear,
}: {
  items: T[];
  matchText: (it: T) => string;
  renderLabel: (it: T) => string;
  renderSub: (it: T) => string;
  valueId: string;
  display: string;
  sub: string;
  disabled?: boolean;
  placeholder: string;
  onPick: (it: T) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 12);
    const norm = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return items.filter((it) => norm(matchText(it)).includes(qn)).slice(0, 25);
  }, [items, query, matchText]);

  if (valueId) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-slate-50 px-2 py-1">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-corp-900">{display}</div>
          {sub && <div className="truncate text-[10px] text-slate-500">{sub}</div>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          onClick={onClear}
          disabled={disabled}
        >
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <Input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          disabled={disabled}
          className="h-8 pl-7"
          placeholder={placeholder}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-96 w-full min-w-[380px] overflow-auto rounded-md border bg-white shadow-xl">
          {filtered.map((it, idx) => (
            <button
              key={idx}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(it);
                setQuery('');
                setOpen(false);
              }}
              className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50"
            >
              <span className="font-medium text-corp-900">{renderLabel(it)}</span>
              <span className="text-[11px] text-slate-500">{renderSub(it)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComboVariante(props: {
  variantes: VarianteItem[];
  valueId: string;
  display: string;
  sub: string;
  disabled?: boolean;
  onPick: (v: VarianteItem) => void;
  onClear: () => void;
}) {
  return (
    <ComboBase<VarianteItem>
      items={props.variantes}
      matchText={(v) => `${v.sku} ${v.producto_nombre} ${v.talla}`}
      renderLabel={(v) => `${v.sku} · ${v.producto_nombre}`}
      renderSub={(v) => `Talla ${v.talla.replace('T', '')}`}
      valueId={props.valueId}
      display={props.display}
      sub={props.sub}
      disabled={props.disabled}
      placeholder="Buscar SKU, producto o talla…"
      onPick={props.onPick}
      onClear={props.onClear}
    />
  );
}

function ComboMaterial(props: {
  materiales: MaterialItem[];
  valueId: string;
  display: string;
  sub: string;
  disabled?: boolean;
  onPick: (m: MaterialItem) => void;
  onClear: () => void;
}) {
  return (
    <ComboBase<MaterialItem>
      items={props.materiales}
      matchText={(m) => `${m.codigo} ${m.nombre}`}
      renderLabel={(m) => `${m.codigo} · ${m.nombre}`}
      renderSub={(m) => m.unidad ?? '—'}
      valueId={props.valueId}
      display={props.display}
      sub={props.sub}
      disabled={props.disabled}
      placeholder="Buscar código o nombre de material…"
      onPick={props.onPick}
      onClear={props.onClear}
    />
  );
}
