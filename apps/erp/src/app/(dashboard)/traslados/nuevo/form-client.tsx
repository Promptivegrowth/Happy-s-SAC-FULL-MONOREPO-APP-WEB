'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { FormRow, FormGrid, FormSection } from '@happy/ui/form-row';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, Save, Plus, Trash2, AlertTriangle, Search, ScanLine, Zap, Upload, X, Truck } from 'lucide-react';
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

  // Cuántos campos del bloque "Vehículo y conductor" tienen dato — para el
  // badge del summary y para abrir el bloque automáticamente si ya se cargó
  // algo (así el colapso no oculta datos por accidente).
  const vehiculoCamposLlenos = [
    vehiculoPlaca, vehiculoMarca, choferNombre, choferDni, choferLicencia,
    vehiculoTarjeta, transportistaRuc, transportistaRazon, cantidadBultos, pesoTotal,
  ].filter((v) => v.trim() !== '').length;
  // Abierto/cerrado con estado propio (no controlado por el prop `open`, que
  // pelearía con el toggle nativo del <details>). Arranca cerrado; se abre
  // solo si aparecen datos cargados (ej. modalidad PÚBLICO exige RUC).
  const [vehiculoOpen, setVehiculoOpen] = useState(false);
  useEffect(() => {
    if (vehiculoCamposLlenos > 0) setVehiculoOpen(true);
  }, [vehiculoCamposLlenos]);

  // Stock disponible en el almacén origen (por variante / material id).
  const [stockVar, setStockVar] = useState<Record<string, number>>({});
  const [stockMat, setStockMat] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);

  // Carga de stock cuando cambia el origen o las líneas (entidades únicas).
  // Los ids se derivan de una KEY string estable (ordenada) — sin esto, cada
  // keystroke en cantidad/observación creaba arrays nuevos y el useEffect
  // refetcheaba el stock en cada tecla (fix 2026-07-12).
  const varKey = Array.from(new Set(lineas.filter((l) => l.variante_id).map((l) => l.variante_id))).sort().join(',');
  const matKey = Array.from(new Set(lineas.filter((l) => l.material_id).map((l) => l.material_id))).sort().join(',');
  const varianteIds = useMemo(() => (varKey ? varKey.split(',') : []), [varKey]);
  const materialIds = useMemo(() => (matKey ? matKey.split(',') : []), [matKey]);

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
      toast.error('Pegue al menos un código');
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

  // Modal multi-talla (2026-07-12) — ver botón "Agregar varios".
  const [multiTallaOpen, setMultiTallaOpen] = useState(false);

  /** Agrega en lote las variantes elegidas en el modal multi-talla.
   *  Reusa agregarOSumar para que si la variante ya estaba en una línea,
   *  se sume la cantidad en vez de duplicar. */
  function agregarLoteVariantes(seleccion: { variante: VarianteItem; cantidad: number }[]) {
    let agregadas = 0;
    for (const s of seleccion) {
      if (s.cantidad <= 0) continue;
      agregarOSumar({ tipo: 'VARIANTE', v: s.variante }, s.cantidad);
      agregadas++;
    }
    if (agregadas > 0) {
      toast.success(`${agregadas} talla(s) agregadas al traslado`);
    }
  }

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
    <div className="space-y-4">
      {/* Almacenes + datos del traslado FUSIONADOS en un bloque compacto
          (pedido del cliente 21/07/2026): hace 20+ traslados diarios y quería
          llegar antes al scanner / carga de productos. Origen y destino en una
          fila; motivo y observación pasan de textarea de 3 líneas a input de
          una línea (siguen siendo opcionales). */}
      <FormSection
        title="Almacenes y datos del traslado"
        description="Origen = de dónde sale el stock. Destino = a dónde llega. Motivo y observación son opcionales."
        className="p-5"
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
          <FormRow label="Motivo (opcional)">
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Reabastecimiento tienda, devolución a central, etc."
              disabled={pending}
            />
          </FormRow>
          <FormRow label="Observación (opcional)">
            <Input
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Notas adicionales"
              disabled={pending}
            />
          </FormRow>
        </FormGrid>
      </FormSection>

      {/* Vehículo y conductor — se pre-imprimen en la guía de remisión.
          Todos son opcionales — si están vacíos, la guía deja líneas para
          completar a mano (mismo comportamiento que el sistema anterior).
          COLAPSABLE (pedido del cliente 21/07/2026): hace 20+ traslados
          diarios La Quinta↔Huallaga y casi nunca llena estos datos, así que
          arranca cerrado para no ocupar pantalla. Se abre solo si ya tiene
          algún dato cargado, para no ocultar información. */}
      <details
        className="group rounded-xl border bg-white shadow-soft"
        open={vehiculoOpen}
        onToggle={(e) => setVehiculoOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer select-none items-center gap-2 p-5 hover:bg-slate-50/60">
          <Truck className="h-5 w-5 shrink-0 text-corp-500" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold text-corp-900">
              Vehículo y conductor (opcional)
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Se pre-imprimen en la guía de remisión. Si los deja vacíos, la guía trae líneas para llenar a mano.
            </p>
          </div>
          {vehiculoCamposLlenos > 0 && (
            <span className="shrink-0 rounded-full bg-happy-100 px-2.5 py-0.5 text-xs font-semibold text-happy-700">
              {vehiculoCamposLlenos} dato{vehiculoCamposLlenos === 1 ? '' : 's'}
            </span>
          )}
          <span className="shrink-0 text-xs font-medium text-slate-400 group-open:hidden">Mostrar ▾</span>
          <span className="hidden shrink-0 text-xs font-medium text-slate-400 group-open:inline">Ocultar ▴</span>
        </summary>
        <div className="space-y-4 px-5 pb-5">
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
        </div>
      </details>

      {/* ─── CARGA MASIVA (pegar lista) — COLAPSABLE ────────────────────────
          Colapsada por default para que todo el formulario entre en una sola
          pantalla sin scroll (pedido del cliente 21/07/2026). La lectora de
          código de barras ya está SIEMPRE visible arriba de "Líneas" (campo
          compacto), así que acá solo queda el pegado masivo para listas
          grandes. */}
      <details className="rounded-xl border border-slate-200 bg-white/50">
        <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-corp-900 hover:bg-slate-50">
          <ScanLine className="mr-1.5 inline h-4 w-4 text-sky-600" />
          Carga masiva (opcional) — pegar lista completa
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
              Apunte el cursor al campo de abajo y dispare el lector. Cada escaneo agrega 1 unidad (o suma a la línea existente).
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
        title="Productos a trasladar"
        description={
          origenId
            ? 'Escanee con la lectora, o agregue líneas a mano. El stock disponible se toma del almacén origen.'
            : 'Seleccione el almacén origen para ver stock disponible al agregar productos.'
        }
        className="p-5"
      >
        <div className="space-y-3">
          {/* Lectora de código de barras SIEMPRE visible (pedido del cliente
              21/07/2026): dispare el lector USB acá y cada escaneo agrega el
              producto (o suma 1 a la línea existente). Sin ocupar espacio de
              más — el pegado masivo de listas grandes queda en "Carga masiva"
              arriba, colapsado. */}
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
            <Input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); procesarScan(); } }}
              placeholder="Escanee el código de barras aquí (o escriba el código y presione Enter)…"
              className="pl-9"
              disabled={pending}
            />
          </div>
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

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addLinea} disabled={pending}>
              <Plus className="h-4 w-4" /> Agregar línea
            </Button>
            {/* Multi-talla (2026-07-12): cliente traslada el mismo producto en
                varias tallas a diario — buscar el producto una vez, marcar
                cantidades por talla, y agregar todas las líneas juntas.
                Réplica del flujo "Agregar varios" de su sistema anterior. */}
            <Button
              type="button"
              variant="premium"
              size="sm"
              onClick={() => {
                if (!origenId) {
                  toast.error('Elija primero el almacén origen (para ver stock por talla)');
                  return;
                }
                setMultiTallaOpen(true);
              }}
              disabled={pending}
              title="Buscar un producto y agregar varias tallas de una sola vez"
            >
              <Zap className="h-4 w-4" /> Agregar varios (multi-talla)
            </Button>
          </div>
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
              ¿Desea imprimir la guía de remisión ahora? Ya quedó guardada en el sistema — puede imprimirla más tarde desde el detalle.
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

      {/* Modal multi-talla: buscar producto una vez → cantidades por talla */}
      {multiTallaOpen && (
        <MultiTallaModal
          variantes={variantes}
          origenId={origenId}
          onAgregar={agregarLoteVariantes}
          onClose={() => setMultiTallaOpen(false)}
        />
      )}
    </div>
  );
}

// ---------- Modal multi-talla (2026-07-12) ----------
// Cliente traslada a diario el mismo producto en varias tallas y el flujo
// anterior obligaba a buscar el producto una vez POR talla. Réplica del
// "Agregar varios" de su sistema antiguo:
//   1. Buscar producto por nombre (una sola vez)
//   2. Ver TODAS las tallas con su stock en el almacén origen
//   3. Tipear cantidad por talla (0 = no trasladar)
//   4. "Agregar" → crea todas las líneas juntas y limpia para repetir
//      con otro producto sin cerrar el modal.

function MultiTallaModal({
  variantes,
  origenId,
  onAgregar,
  onClose,
}: {
  variantes: VarianteItem[];
  origenId: string;
  onAgregar: (seleccion: { variante: VarianteItem; cantidad: number }[]) => void;
  onClose: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [productoNombre, setProductoNombre] = useState<string | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [stock, setStock] = useState<Record<string, number>>({});
  const [stockCargando, setStockCargando] = useState(false);

  // Agrupar variantes por producto_nombre — la data ya está en memoria.
  const productos = useMemo(() => {
    const m = new Map<string, VarianteItem[]>();
    for (const v of variantes) {
      const arr = m.get(v.producto_nombre) ?? [];
      arr.push(v);
      m.set(v.producto_nombre, arr);
    }
    return m;
  }, [variantes]);

  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const sugerencias = useMemo(() => {
    const q = norm(busqueda.trim());
    if (q.length < 2) return [];
    return Array.from(productos.keys())
      .filter((nombre) => norm(nombre).includes(q))
      .slice(0, 12);
  }, [busqueda, productos]);

  // Tallas del producto elegido, ordenadas numéricamente (T2 < T4 < … < T16).
  const tallasProducto = useMemo(() => {
    if (!productoNombre) return [];
    const arr = [...(productos.get(productoNombre) ?? [])];
    const ordenTallaLocal = (t: string) => {
      // /\d/ y no n > 0: la talla T0 (bebé) vale 0 y debe ordenar PRIMERA,
      // no caer al bucket 99 del final (fix 2026-07-12).
      if (/\d/.test(t)) return Number(t.replace(/\D/g, ''));
      if (t === 'TS') return 90;   // S adulto
      if (t === 'TAD') return 95;  // adulto
      return 99;
    };
    return arr.sort((a, b) => ordenTallaLocal(a.talla) - ordenTallaLocal(b.talla));
  }, [productoNombre, productos]);

  // Cargar stock del almacén origen para las tallas del producto elegido.
  useEffect(() => {
    if (!productoNombre || tallasProducto.length === 0) { setStock({}); return; }
    let cancelled = false;
    setStockCargando(true);
    consultarStockEnAlmacen(origenId, tallasProducto.map((v) => v.id), [])
      .then((r) => {
        if (cancelled) return;
        if (r.ok && r.data) setStock(r.data.variantes);
      })
      .finally(() => { if (!cancelled) setStockCargando(false); });
    return () => { cancelled = true; };
  }, [productoNombre, tallasProducto, origenId]);

  function elegirProducto(nombre: string) {
    setProductoNombre(nombre);
    setBusqueda('');
    setCantidades({});
  }

  function agregarYRepetir() {
    // Tallas con stock 0 en el origen NO se agregan (observación cliente
    // 2026-07-13). El input ya está deshabilitado para esas filas — este
    // filtro es la defensa extra por si quedó una cantidad tipeada antes
    // de que cargara el stock.
    const seleccion = tallasProducto
      .map((v) => ({ variante: v, cantidad: Number(cantidades[v.id] || 0) }))
      .filter((s) => s.cantidad > 0 && (stock[s.variante.id] ?? 0) > 0);
    const descartadasSinStock = tallasProducto.filter(
      (v) => Number(cantidades[v.id] || 0) > 0 && (stock[v.id] ?? 0) <= 0,
    );
    if (descartadasSinStock.length > 0) {
      toast.warning(`${descartadasSinStock.length} talla(s) sin stock en el origen — no se agregaron`);
    }
    if (seleccion.length === 0) {
      toast.error('Ingrese al menos una cantidad (en tallas con stock)');
      return;
    }
    // Aviso (no bloqueo) si alguna cantidad excede el stock — igual que las
    // líneas normales, la validación dura la hace el server al ejecutar.
    const excedidas = seleccion.filter((s) => s.cantidad > (stock[s.variante.id] ?? 0));
    if (excedidas.length > 0) {
      toast.warning(`${excedidas.length} talla(s) exceden el stock del origen — revise antes de ejecutar`);
    }
    onAgregar(seleccion);
    // Limpiar para el siguiente producto SIN cerrar el modal.
    setProductoNombre(null);
    setCantidades({});
    setStock({});
  }

  const totalSeleccionado = tallasProducto.reduce(
    (s, v) => s + (Number(cantidades[v.id] || 0) || 0),
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b p-4">
          <div>
            <h3 className="font-display text-lg font-semibold text-corp-900">Agregar varios — multi-talla</h3>
            <p className="text-xs text-slate-500">
              Busque el producto una vez, escriba las cantidades por talla y agregue todo junto. Repita con otro producto sin cerrar.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!productoNombre ? (
            <div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Escriba las primeras letras del producto… (ej: bomb)"
                  className="pl-9"
                  autoFocus
                />
              </div>
              {sugerencias.length > 0 && (
                <div className="mt-2 overflow-hidden rounded-md border">
                  {sugerencias.map((nombre) => {
                    const tallas = productos.get(nombre) ?? [];
                    return (
                      <button
                        key={nombre}
                        type="button"
                        onClick={() => elegirProducto(nombre)}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm transition hover:bg-happy-50 last:border-b-0"
                      >
                        <span className="font-medium text-corp-900">{nombre}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {tallas.length} talla{tallas.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {busqueda.trim().length >= 2 && sugerencias.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">Sin coincidencias.</p>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between rounded-md border border-happy-200 bg-happy-50/60 px-3 py-2">
                <span className="text-sm font-semibold text-corp-900">{productoNombre}</span>
                <Button variant="ghost" size="sm" onClick={() => { setProductoNombre(null); setCantidades({}); }}>
                  Cambiar producto
                </Button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="py-1.5">Talla</th>
                    <th className="py-1.5">SKU</th>
                    <th className="py-1.5 text-right">
                      Stock origen{stockCargando && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                    </th>
                    <th className="py-1.5 text-right">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {tallasProducto.map((v) => {
                    const st = stock[v.id] ?? 0;
                    const cant = Number(cantidades[v.id] || 0);
                    const excede = cant > st;
                    // Sin stock en el origen → NO se puede seleccionar
                    // (observación del cliente 2026-07-13). El input queda
                    // deshabilitado; también mientras carga el stock, para
                    // no dejar tipear antes de conocer el disponible.
                    const sinStock = !stockCargando && st <= 0;
                    return (
                      <tr key={v.id} className={`border-b last:border-b-0 ${sinStock ? 'opacity-60' : ''}`}>
                        <td className="py-1.5 font-display font-semibold">{v.talla.replace('T', '')}</td>
                        <td className="py-1.5 font-mono text-xs text-slate-500">{v.sku}</td>
                        <td className={`py-1.5 text-right font-mono text-xs ${st <= 0 ? 'text-rose-500' : 'text-slate-600'}`}>
                          {stockCargando ? '…' : st}
                        </td>
                        <td className="py-1.5 text-right">
                          {sinStock ? (
                            <span className="inline-block w-20 rounded border border-dashed border-rose-200 bg-rose-50/50 px-2 py-1.5 text-center text-[10px] font-semibold text-rose-500">
                              Sin stock
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={cantidades[v.id] ?? ''}
                              disabled={stockCargando}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d]/g, '');
                                setCantidades((prev) => ({ ...prev, [v.id]: raw }));
                              }}
                              placeholder="0"
                              className={`h-8 w-20 rounded border px-2 text-right font-mono text-xs focus:outline-none focus:ring-2 disabled:cursor-wait disabled:bg-slate-50 ${
                                excede
                                  ? 'border-rose-400 bg-rose-50 focus:ring-rose-100'
                                  : 'border-slate-300 bg-white focus:border-happy-400 focus:ring-happy-100'
                              }`}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-slate-50 p-4">
          <span className="text-xs text-slate-500">
            {productoNombre
              ? `${totalSeleccionado} unidad(es) seleccionadas`
              : 'Elija un producto para ver sus tallas'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Terminar</Button>
            <Button
              variant="premium"
              onClick={agregarYRepetir}
              disabled={!productoNombre || totalSeleccionado <= 0}
            >
              <Plus className="h-4 w-4" /> Agregar y seguir
            </Button>
          </div>
        </div>
      </div>
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
