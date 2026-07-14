'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Switch } from '@happy/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@happy/ui/tabs';
import { FormGrid, FormRow } from '@happy/ui/form-row';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Plus, Trash2, Loader2, Search, X, Copy, Scissors, Clock, ListOrdered, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { NuevaAreaInlineModal, type AreaCreada } from '@/components/forms/nueva-area-inline-modal';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { enumDeArea } from '@/lib/catalogo-procesos-por-area';
import {
  upsertReceta,
  upsertRecetaMulti,
  eliminarLinea,
  toggleSaleAServicio,
  duplicarReceta,
  duplicarLineasTalla,
  actualizarLineaReceta,
  agregarProceso,
  actualizarProceso,
  eliminarProceso,
  reordenarProcesos,
  duplicarProcesos,
  versionarRecetaMateriales,
  versionarProcesosProducto,
} from '@/server/actions/recetas';

const TALLAS = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

const PROCESOS = [
  'TRAZADO','TENDIDO','CORTE','HABILITADO','COSTURA','BORDADO','ESTAMPADO',
  'SUBLIMADO','PLISADO','ACABADO','PLANCHADO','OJAL_BOTON','CONTROL_CALIDAD',
  'EMBALAJE','DECORADO',
] as const;

/** Mapping de qué procesos pertenecen a cada área (por código de área).
 *  Cuando se elige un área en el form, el dropdown de proceso se filtra. */
const PROCESOS_POR_AREA: Record<string, readonly (typeof PROCESOS)[number][]> = {
  CORTE:     ['TRAZADO', 'TENDIDO', 'CORTE', 'HABILITADO'],
  COSTURA:   ['COSTURA'],
  DECORADO:  ['BORDADO', 'ESTAMPADO', 'SUBLIMADO', 'PLISADO', 'DECORADO'],
  BORDADO:   ['BORDADO'],
  ESTAMPADO: ['ESTAMPADO'],
  SUBLIMADO: ['SUBLIMADO'],
  PLISADO:   ['PLISADO'],
  ACABADO:   ['ACABADO', 'CONTROL_CALIDAD', 'EMBALAJE'],
  PLANCHADO: ['PLANCHADO'],
  // Solo procesos que efectivamente se tercerizan (confirmado con cliente).
  // ACABADO y PLANCHADO son internos — no aparecen acá.
  TALLER:    ['COSTURA', 'BORDADO', 'ESTAMPADO', 'SUBLIMADO', 'PLISADO', 'DECORADO', 'OJAL_BOTON'],
};
function procesosDeArea(areaCodigo: string | null): readonly (typeof PROCESOS)[number][] {
  if (!areaCodigo) return PROCESOS;
  return PROCESOS_POR_AREA[areaCodigo.toUpperCase()] ?? PROCESOS;
}

type Mat = { id: string; codigo: string; nombre: string; categoria: string; precio_unitario?: number | null; factor_conversion?: number | null; unidad_consumo_id?: string | null };
type Linea = {
  id: string;
  material_id: string;
  talla: string;
  cantidad: number;
  sale_a_servicio: boolean;
  cantidad_almacen: number | null;
  unidad_id: string | null;
  observacion: string | null;
  materiales?: { codigo: string; nombre: string; categoria: string; precio_unitario: number | null; factor_conversion?: number | null } | null;
};
type Unidad = { id: string; codigo: string; nombre: string };
type Producto = { id: string; codigo: string; nombre: string };
type Area = { id: string; codigo: string; nombre: string; valor_minuto: number | null };
type Proceso = {
  id: string;
  proceso: string;
  area_id: string | null;
  talla: string | null;
  orden: number;
  tiempo_estandar_min: number | null;
  es_tercerizado: boolean;
  observacion: string | null;
  // Descripción específica del paso dentro del proceso (ej: "DESEMBOLSADO DE
  // PAQUETES" dentro de ACABADO). Permite diferenciar múltiples filas con el
  // mismo enum de proceso en la misma área.
  descripcion_operativa: string | null;
  version?: string;
  areas_produccion?: { id: string; codigo: string; nombre: string; valor_minuto: number | null } | null;
};

/** Fila del catálogo maestro de pasos operativos (mig 61). Solo activos. */
type CatalogoPaso = { id: string; area_id: string; nombre: string; orden: number };

export function RecetaEditor({
  recetaId,
  productoId,
  materiales,
  unidades,
  lineas,
  productos = [],
  areas = [],
  procesos = [],
  catalogoPasos = [],
  tallasCongeladas = [],
  esHistorica = false,
  cantidadOts = 0,
  versionMateriales = 'v1.0',
  versionProcesos = 'v1.0',
}: {
  recetaId: string;
  productoId: string;
  materiales: Mat[];
  unidades: Unidad[];
  lineas: Linea[];
  productos?: Producto[];
  areas?: Area[];
  procesos?: Proceso[];
  /** Catálogo de pasos por área que alimenta el dropdown "Paso operativo".
   *  Se administra en /configuracion/catalogo-procesos. */
  catalogoPasos?: CatalogoPaso[];
  /** Tallas con OTs posteriores — bloqueadas individualmente. Las demás siguen
   *  editables aunque el producto tenga producción en otras tallas. */
  tallasCongeladas?: string[];
  /** Si true, es una versión histórica (activa=false). Bloquea TODO sin botones de versionar. */
  esHistorica?: boolean;
  cantidadOts?: number;
  versionMateriales?: string;
  versionProcesos?: string;
}) {
  const tallasCongSet = new Set(tallasCongeladas);
  const hayAlgunaCongelada = tallasCongSet.size > 0;
  return (
    <div className="space-y-3">
      {esHistorica ? (
        <HistoricaBanner versionMateriales={versionMateriales} versionProcesos={versionProcesos} />
      ) : hayAlgunaCongelada ? (
        <CongeladoBanner
          productoId={productoId}
          cantidadOts={cantidadOts}
          tallasCongeladas={tallasCongeladas}
          versionMateriales={versionMateriales}
          versionProcesos={versionProcesos}
        />
      ) : null}
      <Tabs defaultValue="materiales">
        <TabsList>
          <TabsTrigger value="materiales">
            Materiales (BOM) <Badge variant="secondary" className="ml-1.5 text-[9px]">{versionMateriales}</Badge>
          </TabsTrigger>
          <TabsTrigger value="procesos">
            Procesos / Operaciones <Badge variant="secondary" className="ml-1.5 text-[9px]">{procesos.length} · {versionProcesos}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="materiales">
          <BomEditor
            recetaId={recetaId}
            productoId={productoId}
            materiales={materiales}
            unidades={unidades}
            lineas={lineas}
            productos={productos}
            tallasCongeladas={tallasCongSet}
            esHistorica={esHistorica}
          />
        </TabsContent>

        <TabsContent value="procesos">
          <ProcesosEditor
            productoId={productoId}
            areas={areas}
            procesos={procesos}
            productos={productos}
            catalogoPasos={catalogoPasos}
            tallasCongeladas={tallasCongSet}
            esHistorica={esHistorica}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Banner para recetas HISTÓRICAS (activa=false). Solo lectura, sin botones de
 * versionar — esa receta ya fue reemplazada por una más nueva. Modificarla
 * alteraría los reportes históricos de las OTs que la consumieron.
 */
function HistoricaBanner({
  versionMateriales,
  versionProcesos,
}: {
  versionMateriales: string;
  versionProcesos: string;
}) {
  return (
    <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">📚</div>
        <div className="flex-1 text-sm">
          <p className="font-bold text-slate-700">
            Versión histórica · solo lectura
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Esta es una versión anterior de la receta (materiales {versionMateriales} · procesos {versionProcesos}).
            Las OTs históricas la consumieron, así que no se puede editar para preservar la trazabilidad
            de costos y movimientos pasados. Para hacer cambios, andá a la versión vigente del producto.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Banner que se muestra cuando la receta está congelada (ya hay OTs generadas).
 * Ofrece botones para crear una nueva versión de materiales y/o procesos
 * de forma independiente.
 */
function CongeladoBanner({
  productoId,
  cantidadOts,
  tallasCongeladas,
  versionMateriales,
  versionProcesos,
}: {
  productoId: string;
  cantidadOts: number;
  tallasCongeladas: string[];
  versionMateriales: string;
  versionProcesos: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function nuevaVerMateriales() {
    if (!confirm(`Vas a crear una nueva versión de la receta de MATERIALES (a partir de ${versionMateriales}). La actual queda congelada para histórico. ¿Continuar?`)) return;
    start(async () => {
      const r = await versionarRecetaMateriales(productoId);
      if (r.ok && r.data) {
        toast.success(`✨ Versión ${r.data.version} creada (${r.data.lineas} líneas copiadas)`);
        // Navegar al detalle de la nueva receta para que el usuario edite ahí.
        router.push(`/recetas/${r.data.recetaId}`);
      } else toast.error(r.error ?? 'Error');
    });
  }

  function nuevaVerProcesos() {
    if (!confirm(`Vas a crear una nueva versión de la receta de PROCESOS (a partir de ${versionProcesos}). La actual queda congelada para histórico. ¿Continuar?`)) return;
    start(async () => {
      const r = await versionarProcesosProducto(productoId);
      if (r.ok && r.data) {
        toast.success(`✨ Versión ${r.data.version} creada (${r.data.procesos} operaciones copiadas)`);
        router.refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  const tallasMostrar = tallasCongeladas
    .slice()
    .sort()
    .map((t) => t.replace('T', ''))
    .join(', ');
  return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">🔒</div>
        <div className="flex-1 space-y-2 text-sm">
          <p className="font-bold text-amber-900">
            Tallas congeladas · {tallasCongeladas.length} de 11 ({tallasMostrar})
          </p>
          <p className="text-xs text-amber-800">
            Estas tallas ya entraron a producción ({cantidadOts} línea{cantidadOts === 1 ? '' : 's'} de OT),
            así que sus líneas de receta no se pueden modificar para preservar trazabilidad de costos.
            <strong className="font-semibold"> Las demás tallas siguen totalmente editables</strong> — podés
            agregarles líneas o ajustarlas sin crear nueva versión. Para cambiar las tallas congeladas,
            creá una nueva versión (la actual queda como histórico).
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={nuevaVerMateriales} disabled={pending} className="border-amber-400">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Crear nueva versión de Materiales
            </Button>
            <Button variant="outline" size="sm" onClick={nuevaVerProcesos} disabled={pending} className="border-amber-400">
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
              Crear nueva versión de Procesos
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Materiales / BOM
// ============================================================================

function BomEditor({
  recetaId,
  productoId,
  materiales,
  unidades,
  lineas,
  productos,
  tallasCongeladas = new Set(),
  esHistorica = false,
}: {
  recetaId: string;
  productoId: string;
  materiales: Mat[];
  unidades: Unidad[];
  lineas: Linea[];
  productos: Producto[];
  /** Tallas individuales bloqueadas (OTs posteriores). Las demás siguen editables. */
  tallasCongeladas?: Set<string>;
  /** Si true, es histórica → todo bloqueado, sin botones de versionar. */
  esHistorica?: boolean;
}) {
  const todasCongeladas = esHistorica || tallasCongeladas.size >= TALLAS.length;
  // El editor "global" se considera bloqueado solo si TODAS las tallas están congeladas
  // (caso histórica) o si no hay tallas libres para agregar líneas nuevas.
  const congelada = todasCongeladas;
  const [filtroTalla, setFiltroTalla] = useState<string>('');
  const [openForm, setOpenForm] = useState(false);
  const [openDup, setOpenDup] = useState(false);
  const [openDupTalla, setOpenDupTalla] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Default OFF: la mayoría de avíos NO sale al taller (decoración interna,
  // botones, broches, etc.). El usuario lo activa cuando corresponda.
  const [saleAServicio, setSaleAServicio] = useState(false);
  // Tallas seleccionadas en el form de Nueva línea (multi-select).
  // Default: si hay filtro de talla activo, esa talla; sino vacío.
  const [tallasNueva, setTallasNueva] = useState<Set<string>>(() => new Set());
  // Material elegido en el form actual: necesitamos su unidad_consumo_id para
  // mostrarla (solo lectura) y enviarla al server. Sin esto, el dropdown de
  // unidad permitía elegir cualquier unidad, lo que generaba inconsistencias.
  const [materialNuevo, setMaterialNuevo] = useState<Mat | null>(null);
  // Lookup rápido de unidad por id para mostrar código y nombre.
  const unidadById = useMemo(() => new Map(unidades.map((u) => [u.id, u])), [unidades]);
  const unidadDelMaterial = materialNuevo?.unidad_consumo_id
    ? unidadById.get(materialNuevo.unidad_consumo_id) ?? null
    : null;

  const filtrado = lineas.filter((l) => !filtroTalla || l.talla === filtroTalla);

  function abrirFormNuevaLinea() {
    // Si hay filtro de talla activo, pre-seleccionar esa talla
    setTallasNueva(filtroTalla ? new Set([filtroTalla]) : new Set());
    setMaterialNuevo(null);
    setOpenForm(true);
  }
  function toggleTallaNueva(t: string) {
    setTallasNueva((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }
  function todasLasTallas() {
    // No incluir tallas congeladas: el server las rechazaría.
    setTallasNueva(new Set((TALLAS as readonly string[]).filter((t) => !tallasCongeladas.has(t))));
  }
  function ningunaTalla() {
    setTallasNueva(new Set());
  }

  function onSubmit(fd: FormData) {
    if (tallasNueva.size === 0) {
      toast.error('Seleccioná al menos una talla');
      return;
    }
    const materialId = String(fd.get('material_id') ?? '');
    const cantidad = Number(fd.get('cantidad') ?? 0);
    const cantidadAlmacen = Number(fd.get('cantidad_almacen') ?? 0);
    const unidadId = String(fd.get('unidad_id') ?? '');
    const observacion = String(fd.get('observacion') ?? '');
    if (!materialId) {
      toast.error('Seleccioná un material');
      return;
    }
    if (materialNuevo && !materialNuevo.unidad_consumo_id) {
      toast.error('Este material no tiene unidad de consumo configurada. Andá a /materiales y completala antes de usarlo en una receta.');
      return;
    }
    start(async () => {
      const r = await upsertRecetaMulti({
        receta_id: recetaId,
        material_id: materialId,
        tallas: Array.from(tallasNueva) as ('T0' | 'T2' | 'T4' | 'T6' | 'T8' | 'T10' | 'T12' | 'T14' | 'T16' | 'TS' | 'TAD')[],
        cantidad,
        sale_a_servicio: saleAServicio,
        cantidad_almacen: cantidadAlmacen,
        unidad_id: unidadId,
        observacion,
      });
      if (r.ok) {
        toast.success(`${r.data?.insertadas ?? 0} línea${(r.data?.insertadas ?? 0) === 1 ? '' : 's'} agregada${(r.data?.insertadas ?? 0) === 1 ? '' : 's'}`);
        setOpenForm(false);
        setSaleAServicio(false);
        setTallasNueva(new Set());
      } else toast.error(r.error);
    });
  }

  function onDelete(id: string) {
    if (!confirm('¿Eliminar esta línea de la receta?')) return;
    start(async () => {
      const r = await eliminarLinea(id);
      if (r.ok) toast.success('Línea eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  function onToggleSale(id: string, valor: boolean) {
    start(async () => {
      const r = await toggleSaleAServicio(id, valor);
      if (r.ok) toast.success(valor ? 'Marcado para taller' : 'Queda en almacén');
      else toast.error(r.error ?? 'Error');
    });
  }

  // Agrupar líneas por talla
  const porTalla = TALLAS.reduce<Record<string, Linea[]>>((acc, t) => {
    acc[t] = filtrado.filter((l) => l.talla === t);
    return acc;
  }, {} as Record<string, Linea[]>);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Filtrar talla:</span>
          <Badge
            variant={!filtroTalla ? 'default' : 'outline'}
            onClick={() => setFiltroTalla('')}
            className="cursor-pointer"
          >
            Todas
          </Badge>
          {TALLAS.map((t) => {
            const cantidad = lineas.filter((l) => l.talla === t).length;
            const sinReceta = cantidad === 0;
            return (
              <button
                key={t}
                type="button"
                onClick={() => !sinReceta && setFiltroTalla(t)}
                disabled={sinReceta}
                title={sinReceta ? 'Esta talla aún no tiene receta' : `${cantidad} línea${cantidad === 1 ? '' : 's'}`}
                className={`relative inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                  sinReceta
                    ? 'cursor-not-allowed border-dashed border-slate-300 bg-slate-100 text-slate-400 opacity-60 line-through'
                    : filtroTalla === t
                      ? 'border-transparent bg-happy-500 text-white shadow-sm'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-happy-400 hover:bg-happy-50'
                }`}
              >
                {t.replace('T', '')}
                {!sinReceta && (
                  <span className={`text-[9px] font-mono ${filtroTalla === t ? 'text-white/80' : 'text-slate-400'}`}>
                    ·{cantidad}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpenDup(true)}
              disabled={lineas.length === 0 || congelada}
              title={
                congelada
                  ? 'Receta congelada — usá "Crear nueva versión" del banner para editar'
                  : lineas.length === 0
                    ? 'Agregá al menos una línea para poder duplicar'
                    : 'Duplicar a otro producto'
              }
            >
              <Copy className="h-3.5 w-3.5" /> Duplicar a otro producto
            </Button>
            <Button
              variant="premium"
              size="sm"
              onClick={abrirFormNuevaLinea}
              disabled={congelada}
              title={congelada ? 'Receta congelada — usá "Crear nueva versión" del banner para editar' : 'Agregar línea'}
            >
              <Plus className="h-4 w-4" /> Agregar línea
            </Button>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Las tallas en gris/tachadas todavía no tienen líneas. Con el botón <strong>Duplicar talla</strong> en el header de cada talla podés copiar las líneas a otra talla y solo ajustar las cantidades.
        </p>
      </Card>

      {openForm && (
        <Card className="border-happy-300 bg-happy-50/40 p-4">
          <form action={onSubmit} className="space-y-4">
            <h3 className="font-display text-sm font-semibold">Nueva línea de receta</h3>

            <MaterialCombobox materiales={materiales} onMaterialChange={setMaterialNuevo} />

            {/* Multi-talla: checkboxes para agregar la misma línea a varias tallas a la vez */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  Tallas <span className="text-danger">*</span>
                  <span className="ml-1 font-normal text-slate-400">— marcá todas las que aplican</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={todasLasTallas}
                    className="text-[10px] text-happy-600 hover:underline"
                  >
                    Todas
                  </button>
                  <span className="text-[10px] text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={ningunaTalla}
                    className="text-[10px] text-slate-500 hover:underline"
                  >
                    Ninguna
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 rounded-md border border-dashed border-slate-200 p-2">
                {TALLAS.map((t) => {
                  const sel = tallasNueva.has(t);
                  const cong = tallasCongeladas.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => !cong && toggleTallaNueva(t)}
                      disabled={cong}
                      title={cong ? `Talla ${t.replace('T', '')} congelada — tiene OTs generadas` : undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        cong
                          ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-400 opacity-60 line-through'
                          : sel
                            ? 'border-happy-500 bg-happy-500 text-white shadow-sm'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-happy-400 hover:bg-happy-50'
                      }`}
                    >
                      {cong && '🔒 '}
                      {sel && !cong && '✓ '}
                      {t.replace('T', '')}
                    </button>
                  );
                })}
              </div>
              {tallasCongeladas.size > 0 && (
                <p className="mt-1 text-[10px] text-amber-700">
                  🔒 Las tallas con candado ya tienen OTs y no se pueden modificar — creá nueva versión si necesitás cambiarlas.
                </p>
              )}
              {tallasNueva.size > 0 && (
                <p className="mt-1 text-[10px] text-emerald-700">
                  Se creará 1 línea por cada talla ({tallasNueva.size} en total).
                </p>
              )}
            </div>

            <FormGrid cols={2}>
              <FormRow label="Cantidad por unidad" required>
                <Input name="cantidad" type="number" step="0.001" min="0" required placeholder="Ej. 1.5" />
              </FormRow>
              <FormRow
                label="Unidad"
                hint={!materialNuevo ? 'Se toma de la unidad de consumo del material' : undefined}
              >
                {/* La unidad NO se elige: viene de la unidad_consumo del material
                    seleccionado. Si el material no tiene unidad configurada,
                    avisamos al usuario y bloqueamos el envío hasta arreglarlo. */}
                <input type="hidden" name="unidad_id" value={unidadDelMaterial?.id ?? ''} />
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-slate-50 px-3 text-sm">
                  {!materialNuevo ? (
                    <span className="text-slate-400">Elegí un material primero</span>
                  ) : unidadDelMaterial ? (
                    <span className="text-corp-900">
                      <span className="font-medium">{unidadDelMaterial.codigo}</span>
                      <span className="ml-2 text-slate-500">· {unidadDelMaterial.nombre}</span>
                    </span>
                  ) : (
                    <span className="text-amber-700">
                      ⚠️ El material no tiene unidad de consumo configurada. Definila en{' '}
                      <a
                        href={`/materiales/${materialNuevo.id}`}
                        target="_blank"
                        className="font-medium underline hover:text-amber-900"
                      >
                        /materiales/{materialNuevo.codigo}
                      </a>
                    </span>
                  )}
                </div>
              </FormRow>
            </FormGrid>

            {/* Sale al taller — toggle visible (antes era un select escondido) */}
            <div className="flex items-start gap-3 rounded-lg border-2 border-dashed border-happy-300 bg-white p-3">
              <Switch
                checked={saleAServicio}
                onCheckedChange={(v) => setSaleAServicio(!!v)}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-corp-900">
                  {saleAServicio ? '✂️ Avío sale a costura' : '📦 Queda en almacén'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {saleAServicio
                    ? 'Este material se incluye en el paquete que se envía al taller junto al corte.'
                    : 'Este material se aplica internamente (decoración, control de calidad, etc.).'}
                </p>
              </div>
              {saleAServicio && (
                <FormRow label="Cant. queda en alm." className="w-36">
                  <Input name="cantidad_almacen" type="number" step="0.001" min="0" defaultValue={0} />
                </FormRow>
              )}
            </div>

            <FormRow label="Observación">
              <Input name="observacion" />
            </FormRow>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpenForm(false)} disabled={pending}>Cancelar</Button>
              <Button type="submit" variant="premium" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                Agregar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {filtroTalla ? (
        <RecetaTabla lineas={porTalla[filtroTalla] ?? []} onDelete={onDelete} onToggleSale={onToggleSale} pending={pending} congelada={esHistorica || tallasCongeladas.has(filtroTalla)} />
      ) : (
        TALLAS.filter((t) => porTalla[t]!.length > 0).map((t) => {
          const tallaCong = esHistorica || tallasCongeladas.has(t);
          return (
            <Card key={t} className="overflow-hidden">
              <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
                <h3 className="font-display text-sm font-semibold">
                  Talla {t.replace('T', '')}
                  {tallaCong && !esHistorica && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-800">
                      🔒 Congelada (OTs generadas)
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{porTalla[t]!.length} líneas</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenDupTalla(t)}
                    disabled={tallaCong}
                    title={tallaCong ? 'Esta talla está congelada' : 'Duplicar líneas a otra talla'}
                  >
                    <Copy className="h-3 w-3" /> Duplicar talla
                  </Button>
                </div>
              </div>
              <RecetaTabla lineas={porTalla[t]!} onDelete={onDelete} onToggleSale={onToggleSale} pending={pending} compact congelada={tallaCong} />
            </Card>
          );
        })
      )}

      {openDup && (
        <DuplicarRecetaModal
          recetaId={recetaId}
          productoActualId={productoId}
          productos={productos}
          tallasConLineas={Object.keys(porTalla).filter((t) => porTalla[t]!.length > 0)}
          onClose={() => setOpenDup(false)}
        />
      )}

      {openDupTalla && (
        <DuplicarTallaModal
          recetaId={recetaId}
          tallaOrigen={openDupTalla}
          tallasYaUsadas={Object.keys(porTalla).filter((t) => porTalla[t]!.length > 0)}
          onClose={() => setOpenDupTalla(null)}
        />
      )}
    </div>
  );
}

/** Peso de orden por categoría: TELA primero, luego AVÍOS, luego INSUMO, otros al final. */
const PESO_CATEGORIA: Record<string, number> = {
  TELA: 1,
  AVIO: 2,
  AVIOS: 2,
  INSUMO: 3,
  INSUMOS: 3,
};
function pesoCategoria(cat: string | undefined | null): number {
  return PESO_CATEGORIA[(cat ?? '').toUpperCase()] ?? 99;
}

function RecetaTabla({
  lineas,
  onDelete,
  onToggleSale,
  pending,
  compact,
  congelada = false,
}: {
  lineas: Linea[];
  onDelete: (id: string) => void;
  onToggleSale: (id: string, valor: boolean) => void;
  pending: boolean;
  compact?: boolean;
  /** Si true, deshabilita inputs de cantidad, toggle y botón eliminar. */
  congelada?: boolean;
}) {
  const [, start] = useTransition();
  // Orden estable: por categoría (TELA → AVIO → INSUMO → otros) y dentro de
  // cada categoría por nombre del material.
  const lineasOrdenadas = [...lineas].sort((a, b) => {
    const pa = pesoCategoria(a.materiales?.categoria);
    const pb = pesoCategoria(b.materiales?.categoria);
    if (pa !== pb) return pa - pb;
    return (a.materiales?.nombre ?? '').localeCompare(b.materiales?.nombre ?? '');
  });
  if (lineas.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-slate-400">Sin líneas para esta talla</div>;
  }

  function actualizarCampo(id: string, patch: Parameters<typeof actualizarLineaReceta>[1]) {
    start(async () => {
      const r = await actualizarLineaReceta(id, patch);
      if (r.ok) toast.success('Línea actualizada');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <Table>
      <TableHeader><TableRow>
        {!compact && <TableHead>Talla</TableHead>}
        <TableHead>Material</TableHead>
        <TableHead>Categoría</TableHead>
        <TableHead className="text-right">Cantidad</TableHead>
        <TableHead className="text-right">Costo total</TableHead>
        <TableHead>✂️ Va al taller</TableHead>
        <TableHead className="text-right">Queda en alm.</TableHead>
        <TableHead></TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {lineasOrdenadas.map((l) => {
          // precio_unitario es por unidad de COMPRA (ej. millar=S/50). La
          // cantidad de receta está en unidad de CONSUMO (ej. unidades). Para
          // el costo de la línea hay que dividir por factor_conversion (millar
          // = 1000 → S/0.05 por unidad).
          const precio = Number(l.materiales?.precio_unitario ?? 0);
          const factor = Number(l.materiales?.factor_conversion ?? 1) || 1;
          const costoUnit = precio / factor;
          const costo = costoUnit * Number(l.cantidad);
          return (
            <TableRow key={l.id}>
              {!compact && <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>}
              <TableCell>
                <div className="font-medium text-sm">{l.materiales?.nombre}</div>
                <div className="font-mono text-[10px] text-slate-500">{l.materiales?.codigo}</div>
              </TableCell>
              <TableCell><Badge variant="secondary" className="text-[10px]">{l.materiales?.categoria}</Badge></TableCell>
              <TableCell className="text-right">
                <InlineNumber
                  valor={Number(l.cantidad)}
                  step={0.001}
                  onChange={(v) => actualizarCampo(l.id, { cantidad: v })}
                  disabled={congelada}
                />
              </TableCell>
              <TableCell className="text-right text-sm">
                {/* Si el material NO tiene precio cargado, "S/ 0.00" engaña —
                    parece costo cero cuando en realidad falta el dato. Cliente
                    reportó (2026-07-12) que "no calculaba el costo": eran
                    materiales duplicados sin precio_unitario. Warning visible
                    + tooltip apuntando a la ficha del material. */}
                {precio <= 0 ? (
                  <span
                    className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                    title={`El material ${l.materiales?.codigo ?? ''} no tiene precio cargado. Cargalo en Materiales para que la receta calcule el costo.`}
                  >
                    ⚠ sin precio
                  </span>
                ) : (
                  <>S/ {costo.toFixed(2)}</>
                )}
              </TableCell>
              <TableCell>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={l.sale_a_servicio}
                    onCheckedChange={(v) => onToggleSale(l.id, !!v)}
                    disabled={pending || congelada}
                  />
                  <span className={l.sale_a_servicio ? 'font-medium text-emerald-700' : 'text-slate-500'}>
                    {l.sale_a_servicio ? 'Sí' : 'No'}
                  </span>
                </label>
              </TableCell>
              <TableCell className="text-right">
                {l.sale_a_servicio ? (
                  <InlineNumber
                    valor={Number(l.cantidad_almacen ?? 0)}
                    step={0.001}
                    onChange={(v) => actualizarCampo(l.id, { cantidad_almacen: v })}
                    disabled={congelada}
                  />
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(l.id)}
                  disabled={pending || congelada}
                  title={congelada ? 'Receta bloqueada para edición' : 'Eliminar línea'}
                  className={congelada ? 'opacity-30 cursor-not-allowed' : ''}
                >
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Edita un número en línea con guardado al salir del input o presionar Enter. */
function InlineNumber({
  valor,
  step = 1,
  onChange,
  disabled = false,
}: {
  valor: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [v, setV] = useState(String(valor));
  useEffect(() => {
    setV(String(valor));
  }, [valor]);
  return (
    <input
      type="number"
      step={step}
      min={0}
      value={v}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = Number(v);
        if (n !== valor && Number.isFinite(n)) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={`h-8 w-24 rounded border border-slate-200 px-2 text-right font-mono text-xs focus:border-happy-400 focus:outline-none focus:ring-2 focus:ring-happy-100 ${disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`}
    />
  );
}

function MaterialCombobox({
  materiales,
  onMaterialChange,
}: {
  materiales: Mat[];
  /** Notifica al form padre cuando se elige o limpia un material.
   *  Permite leer la unidad de consumo del material para mostrarla en el form. */
  onMaterialChange?: (m: Mat | null) => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [seleccionado, setSeleccionado] = useState<Mat | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtrados = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q && seleccionado) return [];
    if (!q) return materiales.slice(0, 30);
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const qn = norm(q);
    return materiales
      .filter((m) =>
        norm(m.codigo).includes(qn) ||
        norm(m.nombre).includes(qn) ||
        m.categoria?.toLowerCase().includes(qn),
      )
      .slice(0, 30);
  }, [materiales, text, seleccionado]);

  function elegir(m: Mat) {
    setSeleccionado(m);
    setText(`${m.codigo} · ${m.nombre}`);
    setOpen(false);
    onMaterialChange?.(m);
  }

  function limpiar() {
    setSeleccionado(null);
    setText('');
    setOpen(true);
    onMaterialChange?.(null);
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name="material_id" value={seleccionado?.id ?? ''} required />
      <label className="mb-1 block text-xs font-medium text-slate-700">
        Material <span className="text-danger">*</span>
        <span className="ml-1 font-normal text-slate-400">— buscar por código o nombre</span>
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSeleccionado(null);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, filtrados.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[highlight]) elegir(filtrados[highlight]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Ej: TEL0001, hilo azul, COTTON…"
          className={`h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-happy-200 ${
            seleccionado ? 'border-happy-400 bg-happy-50/40' : ''
          }`}
        />
        {seleccionado && (
          <button type="button" onClick={limpiar} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && filtrados.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border bg-white shadow-lg">
          {filtrados.map((m, i) => (
            <button
              type="button"
              key={m.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(m)}
              className={`flex w-full items-start gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${i === highlight ? 'bg-happy-50' : ''}`}
            >
              <Badge variant="secondary" className="mt-0.5 text-[9px]">{m.categoria}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-corp-900">{m.nombre}</div>
                <div className="font-mono text-[11px] text-slate-500">
                  {m.codigo}
                  {m.precio_unitario != null && (
                    <span className="ml-2 text-slate-400">· S/ {Number(m.precio_unitario).toFixed(2)}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && filtrados.length === 0 && text.trim() && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-md border bg-white p-3 text-center text-xs text-slate-500 shadow-lg">
          Sin coincidencias para &quot;{text}&quot;
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Modales: duplicar receta / duplicar talla
// ============================================================================

function DuplicarRecetaModal({
  recetaId,
  productoActualId,
  productos,
  tallasConLineas,
  onClose,
}: {
  recetaId: string;
  productoActualId: string;
  productos: Producto[];
  tallasConLineas: string[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState('');
  const [tallaOrigen, setTallaOrigen] = useState('');
  const [tallaDestino, setTallaDestino] = useState('');

  // Antes excluíamos el producto actual; ahora lo incluimos para soportar
  // el caso "duplicar líneas a otra talla del MISMO producto" desde este modal
  // (además del modal específico DuplicarTallaModal). El server (duplicarReceta)
  // ya soporta este caso: si el destino es el mismo producto y la talla destino
  // difiere, hace upsert correctamente.
  const filtrados = productos
    .filter((p) => !busca || p.nombre.toLowerCase().includes(busca.toLowerCase()) || p.codigo.toLowerCase().includes(busca.toLowerCase()))
    .slice(0, 30);

  function ejecutar() {
    if (!seleccionadoId) return toast.error('Elegí un producto destino');
    start(async () => {
      const r = await duplicarReceta(
        recetaId,
        seleccionadoId,
        tallaOrigen || undefined,
        tallaDestino || undefined,
      );
      if (r.ok && r.data) {
        const detalle = tallaOrigen
          ? ` (talla ${tallaOrigen.replace('T', '')}${tallaDestino ? ` → ${tallaDestino.replace('T', '')}` : ''})`
          : '';
        toast.success(`✨ ${r.data.lineas} líneas duplicadas${detalle}`);
        onClose();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">Duplicar receta</h3>
            <p className="text-xs text-slate-500">
              Copia las líneas de esta receta a otro producto. Por defecto duplica todas las tallas
              con sus líneas. Podés filtrar por una talla origen y/o cambiar la talla destino.
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Producto destino</label>
            <Input placeholder="Buscar producto destino…" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-2" />
            <div className="max-h-44 overflow-auto rounded-md border">
              {filtrados.length === 0 ? (
                <p className="p-3 text-center text-xs text-slate-400">Sin productos</p>
              ) : (
                filtrados.map((p) => {
                  const esMismo = p.id === productoActualId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSeleccionadoId(p.id)}
                      className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${
                        seleccionadoId === p.id ? 'bg-happy-100 ring-1 ring-happy-400' : ''
                      }`}
                    >
                      <span>
                        <span className="font-medium">{p.nombre}</span>
                        <span className="ml-2 font-mono text-[10px] text-slate-500">{p.codigo}</span>
                        {esMismo && (
                          <Badge variant="outline" className="ml-2 border-happy-300 text-[9px] text-happy-700">
                            este producto
                          </Badge>
                        )}
                      </span>
                      {seleccionadoId === p.id && <Badge variant="success" className="text-[9px]">Elegido</Badge>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Talla origen <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <select
                value={tallaOrigen}
                onChange={(e) => setTallaOrigen(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todas las tallas</option>
                {tallasConLineas.map((t) => (
                  <option key={t} value={t}>{t.replace('T', '')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Talla destino <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <select
                value={tallaDestino}
                onChange={(e) => setTallaDestino(e.target.value)}
                disabled={!tallaOrigen}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">Misma que la origen</option>
                {TALLAS.filter((t) => t !== tallaOrigen).map((t) => (
                  <option key={t} value={t}>{t.replace('T', '')}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="rounded bg-slate-50 p-2 text-[11px] text-slate-600">
            <strong>Tip:</strong> Si querés crear T8 a partir de T6 en otro producto, elegí
            origen T6 y destino T8 → las líneas se copian con las cantidades de T6 y después
            las ajustás.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="premium" onClick={ejecutar} disabled={pending || !seleccionadoId}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DuplicarTallaModal({
  recetaId,
  tallaOrigen,
  tallasYaUsadas,
  onClose,
}: {
  recetaId: string;
  tallaOrigen: string;
  tallasYaUsadas: string[];
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const tallasDisponibles = TALLAS.filter((t) => !tallasYaUsadas.includes(t));

  function copiar(tallaDestino: string) {
    start(async () => {
      const r = await duplicarLineasTalla(recetaId, tallaOrigen, tallaDestino);
      if (r.ok && r.data) {
        toast.success(`✨ ${r.data.lineas} líneas copiadas a talla ${tallaDestino.replace('T', '')}`);
        onClose();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">
              Duplicar líneas de talla {tallaOrigen.replace('T', '')}
            </h3>
            <p className="text-xs text-slate-500">Elegí la talla destino. Las líneas se copian con sus cantidades; ajustás después.</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        {tallasDisponibles.length === 0 ? (
          <p className="rounded-md bg-slate-50 p-3 text-center text-sm text-slate-500">
            Todas las tallas ya tienen líneas. Elimina alguna primero.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {tallasDisponibles.map((t) => (
              <Button
                key={t}
                variant="outline"
                onClick={() => copiar(t)}
                disabled={pending}
                className="h-12"
              >
                {t.replace('T', '')}
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================================
// Procesos / Operaciones
// ============================================================================

function ProcesosEditor({
  productoId,
  areas,
  procesos,
  productos = [],
  catalogoPasos = [],
  tallasCongeladas = new Set(),
  esHistorica = false,
}: {
  productoId: string;
  areas: Area[];
  procesos: Proceso[];
  productos?: Producto[];
  catalogoPasos?: CatalogoPaso[];
  /** Tallas con OTs posteriores — el server bloquea solo procesos de esas tallas. */
  tallasCongeladas?: Set<string>;
  esHistorica?: boolean;
}) {
  // Índice { area_id → pasos activos ordenados por orden }. Se recalcula solo
  // cuando cambia el catálogo (que llega por prop del server). Reemplaza la
  // función pasosDeArea() del catálogo hardcodeado — ahora las opciones vienen
  // de BD (tabla catalogo_pasos_operativos, mig 61) editable desde
  // /configuracion/catalogo-procesos.
  const catalogoPorArea = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of catalogoPasos) {
      const arr = m.get(p.area_id) ?? [];
      arr.push(p.nombre);
      m.set(p.area_id, arr);
    }
    return m;
  }, [catalogoPasos]);
  const pasosDeAreaId = (areaId: string | null | undefined): string[] | null => {
    if (!areaId) return null;
    return catalogoPorArea.get(areaId) ?? null;
  };
  // Permitir abrir el form si hay AL MENOS UNA talla libre. El server valida
  // la talla específica al guardar. Histórica = todo bloqueado.
  const todasCongeladas = esHistorica || tallasCongeladas.size >= TALLAS.length;
  const congelada = todasCongeladas;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [orderBy, setOrderBy] = useState<'orden' | 'area' | 'tiempo'>('orden');

  // Lista local de áreas: arranca con las del server pero se puede expandir
  // si el usuario crea una nueva inline desde el modal (obs cliente A).
  const [areasLocal, setAreasLocal] = useState<Area[]>(areas);
  const [openNuevaArea, setOpenNuevaArea] = useState(false);
  // Modal para duplicar la secuencia de procesos a otro producto (obs cliente).
  const [openDupProcesos, setOpenDupProcesos] = useState(false);

  // Arranca vacío: el usuario debe elegir explícitamente el proceso.
  // Antes salía 'CORTE' por default y eso confundía (cliente lo reportó).
  const [proceso, setProceso] = useState<(typeof PROCESOS)[number] | ''>('');
  const [areaId, setAreaId] = useState('');
  const [tallaProc, setTallaProc] = useState<string>('');
  const [tiempo, setTiempo] = useState<string>('');
  // es_tercerizado se quita del form (obs cliente: pertenece a planeamiento,
  // no a la definición de la receta). Se envía false por default al server
  // para mantener la columna en BD funcionando.
  const [obs, setObs] = useState('');
  // Descripción operativa: paso específico dentro del proceso enum. Ej. dentro
  // de ACABADO puede haber "DESEMBOLSADO", "LIMPIEZA", "DOBLADO", etc. El enum
  // tiene solo 15 valores; esta descripción permite diferenciar sub-pasos sin
  // reventar la lista de enums.
  const [descripcionOperativa, setDescripcionOperativa] = useState('');
  // Cuando el usuario elige un área con catálogo (Excel del cliente), se le
  // muestra un dropdown de "pasos operativos" pre-cargados. Si el paso que
  // necesita no está listado, activa este flag y aparece el input libre + el
  // dropdown de enum para elegir manualmente.
  const [usarOtroPaso, setUsarOtroPaso] = useState(false);

  function reset() {
    setProceso('');
    setAreaId('');
    setTallaProc('');
    setTiempo('');
    setObs('');
    setDescripcionOperativa('');
    setUsarOtroPaso(false);
  }

  function agregar() {
    // Si el área tiene catálogo (Excel del cliente) el usuario elige un paso
    // pre-cargado y el enum se autofija — así que el requisito real es tener
    // el paso descrito. Si el usuario está en modo manual (o el área no tiene
    // catálogo), pedimos ambos: proceso enum + descripción.
    const pasos = pasosDeAreaId(areaId);
    // Modo catálogo REQUIERE que el área tenga mapping a enum — si no lo
    // tiene (TALLER, áreas custom), el flujo cae al modo manual donde el
    // usuario elige el enum a mano. Sin este check, un área con pasos pero
    // sin enum quedaba sin forma de completar el alta (fix 2026-07-12).
    const areaCodAdd = areasLocal.find((a) => a.id === areaId)?.codigo ?? null;
    const enCatalogo = pasos && enumDeArea(areaCodAdd) != null && !usarOtroPaso;
    if (enCatalogo && !descripcionOperativa) {
      toast.error('Elegí un paso del catálogo');
      return;
    }
    if (!proceso) {
      // Modo catálogo con área sin mapping (raro: TALLER o áreas custom) — o
      // modo manual y el usuario no eligió proceso. Ambos casos requieren el
      // enum para persistir en BD.
      toast.error('Elegí un proceso base');
      return;
    }
    const procesoFinal = proceso;
    start(async () => {
      const r = await agregarProceso(productoId, {
        producto_id: productoId,
        proceso: procesoFinal,
        area_id: areaId || '',
        talla: (tallaProc || '') as (typeof TALLAS)[number] | '',
        orden: 0,
        tiempo_estandar_min: tiempo === '' ? '' : Number(tiempo),
        es_tercerizado: false, // siempre false desde la receta (ver nota arriba)
        observacion: obs,
        descripcion_operativa: descripcionOperativa,
      });
      if (r.ok) {
        toast.success('Operación agregada');
        reset();
        setOpen(false);
      } else toast.error(r.error ?? 'Error');
    });
  }

  function eliminar(id: string) {
    if (!confirm('¿Eliminar esta operación?')) return;
    start(async () => {
      const r = await eliminarProceso(id);
      if (r.ok) toast.success('Eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  const ordenados = useMemo(() => {
    const copy = [...procesos];
    if (orderBy === 'orden') copy.sort((a, b) => a.orden - b.orden);
    else if (orderBy === 'area')
      copy.sort((a, b) =>
        (a.areas_produccion?.nombre ?? a.proceso).localeCompare(b.areas_produccion?.nombre ?? b.proceso),
      );
    else if (orderBy === 'tiempo')
      copy.sort((a, b) => Number(b.tiempo_estandar_min ?? 0) - Number(a.tiempo_estandar_min ?? 0));
    return copy;
  }, [procesos, orderBy]);

  const totalMin = procesos.reduce((s, p) => s + Number(p.tiempo_estandar_min ?? 0), 0);
  const costoTotal = procesos.reduce(
    (s, p) => s + Number(p.tiempo_estandar_min ?? 0) * Number(p.areas_produccion?.valor_minuto ?? 0),
    0,
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Scissors className="h-5 w-5 text-happy-500" />
          <div className="flex-1">
            <h3 className="font-display text-sm font-semibold">Secuencia de operaciones del producto</h3>
            <p className="text-xs text-slate-500">
              Define qué procesos se aplican y en qué orden. El costo se calcula con el valor/minuto de cada área.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Ordenar por:</span>
            <select
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as 'orden' | 'area' | 'tiempo')}
              className="h-8 rounded-md border bg-white px-2 text-xs"
            >
              <option value="orden">Orden / secuencia</option>
              <option value="area">Área</option>
              <option value="tiempo">Tiempo (mayor primero)</option>
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpenDupProcesos(true)}
            disabled={procesos.length === 0}
            title={
              procesos.length === 0
                ? 'Agregá al menos una operación para poder duplicar'
                : 'Duplicar secuencia de operaciones a otro producto (también funciona si el destino está congelado solo si el origen tiene procesos)'
            }
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar a otro producto
          </Button>
          <Button
            variant="premium"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={congelada}
            title={congelada ? 'Receta de procesos congelada — usá "Crear nueva versión" del banner' : 'Agregar operación'}
          >
            <Plus className="h-4 w-4" /> Agregar operación
          </Button>
        </div>
      </Card>

      {open && (
        <Card className="border-happy-300 bg-happy-50/40 p-4">
          <h3 className="mb-3 font-display text-sm font-semibold">Nueva operación</h3>
          <FormGrid cols={3}>
            <FormRow label="Área" required hint="Define el costo/minuto y el catálogo de pasos disponibles">
              <div className="flex gap-1">
                <select
                  value={areaId}
                  onChange={(e) => {
                    const nuevoAreaId = e.target.value;
                    setAreaId(nuevoAreaId);
                    // Reset del paso al cambiar de área: el catálogo cambia y
                    // el paso viejo puede no aplicar. Autofijamos el enum del
                    // área si tiene mapping (ej. área ACABADO → enum ACABADO).
                    const areaCod = areasLocal.find((a) => a.id === nuevoAreaId)?.codigo ?? null;
                    const enumAuto = enumDeArea(areaCod);
                    setDescripcionOperativa('');
                    setUsarOtroPaso(false);
                    if (enumAuto) {
                      setProceso(enumAuto as (typeof PROCESOS)[number]);
                    } else {
                      // Área sin mapping (TALLER, o un área nueva creada por
                      // el usuario): dejar el enum sin autofijar y validar en
                      // el dropdown del fallback manual.
                      const procesosValidos = procesosDeArea(areaCod);
                      if (proceso && !procesosValidos.includes(proceso as (typeof PROCESOS)[number])) {
                        setProceso('');
                      }
                    }
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— sin asignar (todos los procesos) —</option>
                  {areasLocal.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre} {a.valor_minuto ? `(S/${Number(a.valor_minuto).toFixed(3)}/min)` : ''}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenNuevaArea(true)}
                  title="Crear nueva área"
                  className="h-10 shrink-0 px-2"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </FormRow>
            {/* Dropdown "Paso operativo" alimentado por el catálogo de BD
                (tabla catalogo_pasos_operativos, editable en
                /configuracion/catalogo-procesos). Si el área no tiene pasos
                cargados (TALLER, área nueva sin poblar), o el usuario tildó
                "otro", cae al dropdown enum + input libre. */}
            {(() => {
              const areaCod = areasLocal.find((a) => a.id === areaId)?.codigo ?? null;
              const pasosBD = pasosDeAreaId(areaId);
              // Modo catálogo SOLO si además el área mapea a un enum — sin
              // eso el alta quedaba bloqueada sin selector visible (fix
              // 2026-07-12). Áreas sin mapping caen al modo manual.
              const pasos = enumDeArea(areaCod) != null ? pasosBD : null;
              return (
                <FormRow
                  label="Paso operativo"
                  required
                  hint={
                    pasos && !usarOtroPaso
                      ? 'Del catálogo del cliente. Si no ves el paso, elegí "Otro / escribir manual".'
                      : 'Elegí el proceso base y escribí el nombre específico del paso.'
                  }
                >
                  {pasos && !usarOtroPaso ? (
                    <select
                      value={descripcionOperativa}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__OTRO__') {
                          setUsarOtroPaso(true);
                          setDescripcionOperativa('');
                          return;
                        }
                        setDescripcionOperativa(v);
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      required
                    >
                      <option value="">— Elegí un paso —</option>
                      {pasos.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                      <option value="__OTRO__">➕ Otro / escribir manual…</option>
                    </select>
                  ) : (
                    <div className="space-y-2">
                      <select
                        value={proceso}
                        onChange={(e) => setProceso(e.target.value as (typeof PROCESOS)[number] | '')}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        required
                      >
                        <option value="">— Elegí un proceso base —</option>
                        {procesosDeArea(areaCod).map((p) => (
                          <option key={p} value={p}>{p.replace('_', ' ')}</option>
                        ))}
                      </select>
                      <Input
                        value={descripcionOperativa}
                        onChange={(e) => setDescripcionOperativa(e.target.value)}
                        maxLength={200}
                        placeholder="Ej: DESEMBOLSADO DE PAQUETES"
                      />
                      {pasos && (
                        <button
                          type="button"
                          onClick={() => { setUsarOtroPaso(false); setDescripcionOperativa(''); }}
                          className="text-[11px] text-happy-600 hover:underline"
                        >
                          ← Volver al catálogo del área
                        </button>
                      )}
                    </div>
                  )}
                </FormRow>
              );
            })()}
            <FormRow label="Tiempo estándar (min)">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={tiempo}
                onChange={(e) => setTiempo(e.target.value)}
                placeholder="Ej: 15"
              />
            </FormRow>
            <FormRow label="Talla (opcional)" hint="Vacío = aplica a todas">
              <select
                value={tallaProc}
                onChange={(e) => setTallaProc(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Todas</option>
                {TALLAS.map((t) => <option key={t} value={t}>{t.replace('T', '')}</option>)}
              </select>
            </FormRow>
            {/* Quitado el toggle "Tercerizado": no pertenece a la definición
                de la receta. Si en un futuro se agrega esa decisión, debería
                vivir en el módulo de planeamiento/OT, no acá. */}
          </FormGrid>
          <FormRow label="Observación">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </FormRow>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }} disabled={pending}>Cancelar</Button>
            <Button variant="premium" onClick={agregar} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Agregar
            </Button>
          </div>
        </Card>
      )}

      {procesos.length === 0 ? (
        <Card className="p-10 text-center">
          <ListOrdered className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500">
            Aún no hay operaciones definidas para este producto.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Más adelante se podrán importar masivamente desde Excel.
          </p>
        </Card>
      ) : (
        <Card>
          <ProcesosTabla
            procesos={ordenados}
            orderBy={orderBy}
            productoId={productoId}
            onEliminar={eliminar}
            onActualizarTiempo={(id, v) => {
              start(async () => {
                const r = await actualizarProceso(id, { tiempo_estandar_min: v });
                if (r.ok) toast.success('Tiempo actualizado');
                else toast.error(r.error ?? 'Error');
              });
            }}
            onActualizarDescripcion={(id, v) => {
              start(async () => {
                const r = await actualizarProceso(id, { descripcion_operativa: v || null });
                if (r.ok) toast.success('Paso actualizado');
                else toast.error(r.error ?? 'Error');
              });
            }}
            pasosPorArea={catalogoPorArea}
            pending={pending}
          />
          <div className="border-t bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-end gap-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Tiempo total:</span>
                <span className="font-mono font-semibold text-corp-900">{totalMin.toFixed(2)} min</span>
              </div>
              <div>
                <span className="text-slate-500">Costo MO total:</span>{' '}
                <span className="font-display text-base font-semibold text-happy-600">S/ {costoTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      <NuevaAreaInlineModal
        open={openNuevaArea}
        onOpenChange={setOpenNuevaArea}
        onCreated={(a: AreaCreada) => {
          // Inyectar el área nueva en el dropdown local y auto-seleccionarla.
          // Insertamos ordenada alfabéticamente por nombre (igual que el server).
          setAreasLocal((prev) => {
            const next = [...prev, { id: a.id, codigo: a.codigo, nombre: a.nombre, valor_minuto: a.valor_minuto }];
            return next.sort((x, y) => x.nombre.localeCompare(y.nombre));
          });
          setAreaId(a.id);
          // Al crear un área nueva, resetear el paso operativo y autofijar el
          // enum si el código coincide con el mapping del catálogo (ACABADO,
          // BORDADO, etc). Si no coincide, dejar sin proceso — el usuario cae
          // al fallback manual.
          setDescripcionOperativa('');
          setUsarOtroPaso(false);
          const enumAuto = enumDeArea(a.codigo);
          if (enumAuto) {
            setProceso(enumAuto as (typeof PROCESOS)[number]);
          } else {
            const procesosValidos = procesosDeArea(a.codigo);
            if (proceso && !procesosValidos.includes(proceso as (typeof PROCESOS)[number])) {
              setProceso('');
            }
          }
        }}
      />

      {openDupProcesos && (
        <DuplicarProcesosModal
          productoActualId={productoId}
          productos={productos}
          cantidadProcesos={procesos.length}
          onClose={() => setOpenDupProcesos(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Modal: duplicar secuencia de procesos a otro producto
// ============================================================================

function DuplicarProcesosModal({
  productoActualId,
  productos,
  cantidadProcesos,
  onClose,
}: {
  productoActualId: string;
  productos: Producto[];
  cantidadProcesos: number;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [busca, setBusca] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState('');

  // Excluimos el producto actual: duplicar las propias operaciones al mismo
  // producto duplicaría todas las filas (no tiene sentido, no hay "talla
  // destino" como en materiales).
  const filtrados = productos
    .filter((p) => p.id !== productoActualId)
    .filter((p) =>
      !busca ||
      p.nombre.toLowerCase().includes(busca.toLowerCase()) ||
      p.codigo.toLowerCase().includes(busca.toLowerCase()),
    )
    .slice(0, 30);

  function ejecutar() {
    if (!seleccionadoId) return toast.error('Elegí un producto destino');
    start(async () => {
      const r = await duplicarProcesos(productoActualId, seleccionadoId);
      if (r.ok && r.data) {
        toast.success(`✨ ${r.data.procesos} operación(es) duplicada(s)`);
        onClose();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-display text-base font-semibold">Duplicar secuencia de procesos</h3>
            <p className="text-xs text-slate-500">
              Copia las {cantidadProcesos} operación{cantidadProcesos === 1 ? '' : 'es'} de este producto a otro,
              preservando proceso, área, talla, tiempo y observaciones. Si el destino ya tenía
              operaciones, las nuevas se agregan al final (no reemplaza).
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Producto destino</label>
            <Input
              placeholder="Buscar producto destino…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="mb-2"
            />
            <div className="max-h-44 overflow-auto rounded-md border">
              {filtrados.length === 0 ? (
                <p className="p-3 text-center text-xs text-slate-400">Sin productos</p>
              ) : (
                filtrados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSeleccionadoId(p.id)}
                    className={`flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-happy-50 ${
                      seleccionadoId === p.id ? 'bg-happy-100 ring-1 ring-happy-400' : ''
                    }`}
                  >
                    <span>
                      <span className="font-medium">{p.nombre}</span>
                      <span className="ml-2 font-mono text-[10px] text-slate-500">{p.codigo}</span>
                    </span>
                    {seleccionadoId === p.id && <Badge variant="success" className="text-[9px]">Elegido</Badge>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button variant="premium" onClick={ejecutar} disabled={pending || !seleccionadoId}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Copy className="h-4 w-4" /> Duplicar
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// Tabla de operaciones con drag & drop (solo cuando orderBy === 'orden')
// ============================================================================

function ProcesosTabla({
  procesos,
  orderBy,
  productoId,
  onEliminar,
  onActualizarTiempo,
  onActualizarDescripcion,
  pasosPorArea,
  pending,
}: {
  procesos: Proceso[];
  orderBy: 'orden' | 'area' | 'tiempo';
  productoId: string;
  onEliminar: (id: string) => void;
  onActualizarTiempo: (id: string, v: number) => void;
  onActualizarDescripcion: (id: string, v: string) => void;
  /** Catálogo de pasos por area_id — el editor inline del paso se vuelve un
   *  SELECT con estas opciones (cliente pidió 2026-07-12: no permitir texto
   *  libre, solo elegir pasos establecidos para evitar errores de tipeo). */
  pasosPorArea: Map<string, string[]>;
  pending: boolean;
}) {
  // Estado local para reflejar el orden visualmente al instante (optimistic).
  // Cuando llega `procesos` por props (después del refresh server), se sincroniza.
  const [items, setItems] = useState<Proceso[]>(procesos);
  useEffect(() => setItems(procesos), [procesos]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dndDisabled = orderBy !== 'orden';

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nuevo = arrayMove(items, oldIndex, newIndex);
    setItems(nuevo);
    // Persistir orden en server
    reordenarProcesos(productoId, nuevo.map((i) => i.id))
      .then((r) => {
        if (!r.ok) {
          toast.error(r.error ?? 'No se pudo reordenar');
          setItems(procesos); // revertir
        } else {
          toast.success('Orden guardado');
        }
      });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-16">Orden</TableHead>
              <TableHead>Área</TableHead>
              <TableHead>Proceso / Paso</TableHead>
              <TableHead>Talla</TableHead>
              <TableHead className="text-right">Tiempo (min)</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead>Observación</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <ProcesoFila
                key={p.id}
                proceso={p}
                onEliminar={onEliminar}
                onActualizarTiempo={onActualizarTiempo}
                onActualizarDescripcion={onActualizarDescripcion}
                opcionesPaso={p.area_id ? (pasosPorArea.get(p.area_id) ?? null) : null}
                pending={pending}
                dndDisabled={dndDisabled}
              />
            ))}
          </TableBody>
        </Table>
      </SortableContext>
      {dndDisabled && (
        <p className="border-t bg-amber-50/40 px-4 py-2 text-[10px] text-amber-700">
          💡 Para reordenar arrastrando, cambie el orden a &quot;Orden / secuencia&quot; arriba.
        </p>
      )}
    </DndContext>
  );
}

function ProcesoFila({
  proceso: p,
  onEliminar,
  onActualizarTiempo,
  onActualizarDescripcion,
  opcionesPaso,
  pending,
  dndDisabled,
}: {
  proceso: Proceso;
  onEliminar: (id: string) => void;
  onActualizarTiempo: (id: string, v: number) => void;
  onActualizarDescripcion: (id: string, v: string) => void;
  /** Pasos del catálogo del área de esta fila. Con opciones → SELECT;
   *  sin opciones (área sin catálogo) → input libre como antes. */
  opcionesPaso: string[] | null;
  pending: boolean;
  dndDisabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: p.id,
    disabled: dndDisabled,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isDragging ? '#fef3c7' : undefined,
  };
  const tiempoMin = Number(p.tiempo_estandar_min ?? 0);
  const valorMin = Number(p.areas_produccion?.valor_minuto ?? 0);
  const costo = tiempoMin * valorMin;
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8 px-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={dndDisabled}
          aria-label="Arrastrar para reordenar"
          className={`flex h-6 w-6 items-center justify-center rounded text-slate-400 ${
            dndDisabled ? 'cursor-not-allowed opacity-30' : 'cursor-grab hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing'
          }`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </TableCell>
      <TableCell className="font-mono text-xs">{p.orden}</TableCell>
      <TableCell>
        {p.areas_produccion ? (
          <Badge variant="secondary">{p.areas_produccion.nombre}</Badge>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex flex-col gap-0.5">
          <span>{p.proceso.replace('_', ' ')}</span>
          {opcionesPaso && opcionesPaso.length > 0 ? (
            <SelectPasoInline
              valor={p.descripcion_operativa ?? ''}
              opciones={opcionesPaso}
              disabled={pending}
              onChange={(v) => onActualizarDescripcion(p.id, v)}
            />
          ) : (
            <InlineDescripcion
              valor={p.descripcion_operativa ?? ''}
              onChange={(v) => onActualizarDescripcion(p.id, v)}
            />
          )}
        </div>
      </TableCell>
      <TableCell>
        {p.talla ? (
          <Badge variant="outline">{p.talla.replace('T', '')}</Badge>
        ) : (
          <span className="text-xs text-slate-400">Todas</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <InlineTiempo valor={tiempoMin} onChange={(v) => onActualizarTiempo(p.id, v)} />
      </TableCell>
      <TableCell className="text-right text-sm">
        {valorMin > 0 ? `S/ ${costo.toFixed(2)}` : <span className="text-xs text-slate-400">—</span>}
      </TableCell>
      <TableCell className="max-w-xs truncate text-xs text-slate-500">{p.observacion}</TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={() => onEliminar(p.id)} disabled={pending}>
          <Trash2 className="h-3.5 w-3.5 text-danger" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** Selector inline del paso operativo — reemplaza al input de texto libre
 *  cuando el área tiene catálogo (cliente pidió 2026-07-12: escribir a mano
 *  permite errores; debe ELEGIR de los pasos establecidos). Si el valor
 *  actual es legado y no está en el catálogo, se muestra como opción extra
 *  para no perderlo. */
function SelectPasoInline({
  valor,
  opciones,
  disabled,
  onChange,
}: {
  valor: string;
  opciones: string[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const valorLegado = valor && !opciones.includes(valor);
  return (
    <select
      value={valor}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v !== valor) onChange(v);
      }}
      className={`w-full max-w-[240px] cursor-pointer rounded border px-1 py-0.5 text-[11px] font-normal focus:border-happy-400 focus:outline-none focus:ring-2 focus:ring-happy-100 ${
        valor
          ? 'border-transparent bg-transparent text-slate-600 hover:border-slate-200'
          : 'border-dashed border-amber-300 bg-amber-50/50 text-amber-700'
      }`}
      title="Elegir el paso específico del catálogo del área"
    >
      <option value="">— elegir paso —</option>
      {valorLegado && <option value={valor}>{valor} (fuera de catálogo)</option>}
      {opciones.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

/** Edita la descripción operativa en línea (subtítulo bajo el proceso enum).
 *  Vacío se muestra como placeholder "+ agregar paso específico" para invitar
 *  al usuario a distinguir filas repetidas (ej. 5 rows de ACABADO). */
function InlineDescripcion({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => { setV(valor); }, [valor]);
  return (
    <input
      type="text"
      maxLength={200}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v.trim() !== valor.trim()) onChange(v.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder="+ paso específico (ej: DESEMBOLSADO)"
      className="w-full max-w-[240px] rounded border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-normal text-slate-600 placeholder:text-[10px] placeholder:italic placeholder:text-slate-400 hover:border-slate-200 focus:border-happy-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-happy-100"
    />
  );
}

/** Edita el tiempo en línea con confirmación al perder focus o Enter. */
function InlineTiempo({ valor, onChange }: { valor: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(String(valor));
  useEffect(() => { setV(String(valor)); }, [valor]);
  return (
    <input
      type="number"
      step="0.01"
      min={0}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { const n = Number(v); if (n !== valor && Number.isFinite(n)) onChange(n); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="h-8 w-20 rounded border border-slate-200 bg-white px-2 text-right font-mono text-xs focus:border-happy-400 focus:outline-none focus:ring-2 focus:ring-happy-100"
    />
  );
}
