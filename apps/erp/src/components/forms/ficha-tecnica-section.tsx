'use client';

/**
 * SECCIÓN — Ficha técnica de un producto (MVP fase 1).
 *
 * Sub-tabs internos: Resumen · Composición · Medidas · Imágenes · Confección/Acabados
 *
 * Estado vacío: si el producto no tiene ficha vigente, muestra un CTA grande
 * "Crear ficha técnica" para arrancar la primera revisión.
 */

import { useState, useTransition, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Label } from '@happy/ui/label';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import {
  FileText, Plus, Loader2, Save, Trash2, Upload, ImageIcon, Ruler, Shirt, Wrench,
  Layers, Info, Scissors, Package, Download, Share2, Copy, X, ExternalLink, Sparkles, GitCompare,
} from 'lucide-react';
import { toast } from 'sonner';
import { ordenTalla, normalizarTexto } from '@happy/lib';
import {
  crearFichaTecnica,
  actualizarFichaTecnica,
  guardarMedidasFicha,
  subirImagenFicha,
  vincularImagenDesdeGaleria,
  eliminarImagenFicha,
  guardarPiezasCorte,
  generarLinkPublico,
  revocarLinkPublico,
  listarLinksPublicos,
  aplicarPlantillaFicha,
  obtenerDiffRevisiones,
  listarProductosConCuadroMedidas,
  obtenerMedidasParaCopiar,
  type DiffRevisiones,
} from '@/server/actions/fichas-tecnicas';
import {
  TEMPORADAS,
  TIPOS_IMAGEN_FICHA,
  TIPO_IMAGEN_LABEL,
  TIPOS_TELA,
  PLANTILLAS_PRENDA,
  type FichaTecnica,
  type FichaMedida,
  type FichaImagen,
  type TipoImagenFicha,
  type Temporada,
  type PiezaCorte,
  type AvioRow,
  type ProcesoFichaRow,
  type TipoTela,
} from '@/server/actions/fichas-tecnicas-helpers';

type GaleriaItem = { id: string; url: string; alt: string | null };

type Props = {
  productoId: string;
  productoNombre: string;
  tallasProducto: string[];
  ficha: FichaTecnica | null;
  medidas: FichaMedida[];
  imagenes: FichaImagen[];
  piezas: PiezaCorte[];
  avios: AvioRow[];
  procesos: ProcesoFichaRow[];
  revisiones: { id: string; revision: number; vigente: boolean; updated_at: string }[];
  /** Galería del producto (img principal + adicionales) — para reusar en ficha. */
  galeriaProducto?: GaleriaItem[];
  /** ID de la receta activa del producto — necesario para linkear al editor
   *  de operaciones (post-2026-07-08, cliente no encontraba el link). */
  recetaActivaId?: string | null;
};

type SubTab = 'resumen' | 'composicion' | 'medidas' | 'corte' | 'avios' | 'imagenes' | 'confeccion';

export function FichaTecnicaSection(props: Props) {
  const router = useRouter();
  const [creando, startCreando] = useTransition();

  if (!props.ficha) {
    return (
      <Card className="border-2 border-dashed border-slate-300 p-10 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 font-display text-lg font-semibold text-corp-900">
          Este producto aún no tiene ficha técnica
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          La ficha técnica documenta materiales, medidas por talla, especificaciones de confección,
          imágenes de referencia y acabados — útil para producción, calidad y atención al cliente B2B.
        </p>
        <Button
          variant="premium"
          size="lg"
          className="mt-5"
          disabled={creando}
          onClick={() => {
            startCreando(async () => {
              const r = await crearFichaTecnica(props.productoId);
              if (r.ok) {
                toast.success('Ficha técnica creada');
                router.refresh();
              } else {
                toast.error(r.error ?? 'Error');
              }
            });
          }}
        >
          {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear ficha técnica
        </Button>
      </Card>
    );
  }

  return <FichaEditor {...props} ficha={props.ficha} />;
}

function FichaEditor({
  productoId, productoNombre, tallasProducto, ficha, medidas, imagenes, piezas, avios, procesos, revisiones, galeriaProducto = [],
}: Props & { ficha: FichaTecnica }) {
  const router = useRouter();
  const [tab, setTab] = useState<SubTab>('resumen');
  const [creandoRev, startRev] = useTransition();
  const [descargando, setDescargando] = useState(false);
  const [compartirOpen, setCompartirOpen] = useState(false);
  const [plantillaOpen, setPlantillaOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  async function descargarPDF() {
    setDescargando(true);
    try {
      const { generarFichaTecnicaPDF } = await import('./ficha-tecnica-pdf');
      await generarFichaTecnicaPDF(ficha.id, productoId);
    } catch (e) {
      toast.error('Error al generar PDF: ' + (e as Error).message);
    } finally {
      setDescargando(false);
    }
  }

  async function descargarPDFCompacto() {
    setDescargando(true);
    try {
      const { generarFichaCompactaPDF } = await import('./ficha-tecnica-pdf');
      await generarFichaCompactaPDF(ficha.id, productoId);
    } catch (e) {
      toast.error('Error al generar PDF: ' + (e as Error).message);
    } finally {
      setDescargando(false);
    }
  }

  function nuevaRevision() {
    if (!confirm(`¿Crear nueva revisión a partir de la ${ficha.revision}? La actual quedará archivada.`)) return;
    startRev(async () => {
      const r = await crearFichaTecnica(productoId);
      if (r.ok) {
        toast.success(`Revisión ${r.data?.revision} creada`);
        router.refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="space-y-4">
      {/* Header con metadatos de la ficha vigente */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-happy-100 p-2">
            <FileText className="h-4 w-4 text-happy-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">
              {productoNombre} · Revisión vigente
            </p>
            <p className="font-display text-base font-semibold text-corp-900">
              Rev. {ficha.revision}
              {ficha.fecha_aprobacion && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  · Aprobada {new Date(ficha.fecha_aprobacion).toLocaleDateString('es-PE')}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {revisiones.length > 1 && (
            <Badge variant="outline" className="text-[10px]">
              {revisiones.length} revisiones en historial
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={descargarPDFCompacto} disabled={descargando} title="PDF de 1 página para imprimir y meter en la OT del taller">
            <FileText className="h-3.5 w-3.5" />
            Compacto OT
          </Button>
          <Button variant="outline" size="sm" onClick={descargarPDF} disabled={descargando}>
            {descargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            PDF completo
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCompartirOpen(true)} title="Generar link público compartible con el cliente">
            <Share2 className="h-3.5 w-3.5" />
            Compartir
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPlantillaOpen(true)} title="Cargar medidas y piezas predefinidas">
            <Sparkles className="h-3.5 w-3.5" />
            Plantilla
          </Button>
          {revisiones.length > 1 && (
            <Button variant="outline" size="sm" onClick={() => setDiffOpen(true)} title="Comparar con la revisión anterior">
              <GitCompare className="h-3.5 w-3.5" />
              Comparar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={nuevaRevision} disabled={creandoRev}>
            {creandoRev && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Nueva revisión
          </Button>
        </div>
      </Card>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        <SubTabBtn active={tab === 'resumen'} onClick={() => setTab('resumen')} icon={<Info className="h-3.5 w-3.5" />}>
          Resumen
        </SubTabBtn>
        <SubTabBtn active={tab === 'composicion'} onClick={() => setTab('composicion')} icon={<Shirt className="h-3.5 w-3.5" />}>
          Composición
        </SubTabBtn>
        <SubTabBtn active={tab === 'medidas'} onClick={() => setTab('medidas')} icon={<Ruler className="h-3.5 w-3.5" />}>
          Medidas ({medidas.length})
        </SubTabBtn>
        <SubTabBtn active={tab === 'corte'} onClick={() => setTab('corte')} icon={<Scissors className="h-3.5 w-3.5" />}>
          Corte ({piezas.length})
        </SubTabBtn>
        <SubTabBtn active={tab === 'avios'} onClick={() => setTab('avios')} icon={<Package className="h-3.5 w-3.5" />}>
          Avíos ({avios.length})
        </SubTabBtn>
        <SubTabBtn active={tab === 'imagenes'} onClick={() => setTab('imagenes')} icon={<ImageIcon className="h-3.5 w-3.5" />}>
          Imágenes ({imagenes.length})
        </SubTabBtn>
        <SubTabBtn active={tab === 'confeccion'} onClick={() => setTab('confeccion')} icon={<Wrench className="h-3.5 w-3.5" />}>
          Confección / Acabados
        </SubTabBtn>
      </div>

      {tab === 'resumen' && <ResumenTab ficha={ficha} />}
      {tab === 'composicion' && <ComposicionTab ficha={ficha} />}
      {tab === 'medidas' && <MedidasTab ficha={ficha} medidasIniciales={medidas} tallasProducto={tallasProducto} />}
      {tab === 'corte' && <CorteTab ficha={ficha} piezasIniciales={piezas} />}
      {tab === 'avios' && <AviosTab productoId={productoId} avios={avios} procesos={procesos} />}
      {tab === 'imagenes' && <ImagenesTab fichaId={ficha.id} imagenes={imagenes} galeriaProducto={galeriaProducto} />}
      {tab === 'confeccion' && <ConfeccionTab ficha={ficha} />}

      {compartirOpen && (
        <CompartirModal fichaId={ficha.id} onClose={() => setCompartirOpen(false)} />
      )}
      {plantillaOpen && (
        <PlantillaModal fichaId={ficha.id} onClose={() => setPlantillaOpen(false)} onApplied={() => { setPlantillaOpen(false); router.refresh(); }} />
      )}
      {diffOpen && (
        <DiffModal productoId={productoId} onClose={() => setDiffOpen(false)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// RESUMEN
// ────────────────────────────────────────────────────────────────────────────
function ResumenTab({ ficha }: { ficha: FichaTecnica }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    temporada: ficha.temporada ?? '',
    fecha_aprobacion: ficha.fecha_aprobacion ?? '',
    cliente_referencia: ficha.cliente_referencia ?? '',
    descripcion_larga: ficha.descripcion_larga ?? '',
    alcance_uso: ficha.alcance_uso ?? '',
    observaciones: ficha.observaciones ?? '',
  });

  function save() {
    start(async () => {
      const r = await actualizarFichaTecnica(ficha.id, {
        temporada: (form.temporada || null) as Temporada | null,
        fecha_aprobacion: form.fecha_aprobacion || null,
        cliente_referencia: form.cliente_referencia,
        descripcion_larga: form.descripcion_larga,
        alcance_uso: form.alcance_uso,
        observaciones: form.observaciones,
      });
      if (r.ok) toast.success('Resumen guardado');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Temporada</Label>
          <select
            value={form.temporada}
            onChange={(e) => setForm({ ...form, temporada: e.target.value })}
            className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
          >
            <option value="">—</option>
            {TEMPORADAS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Fecha aprobación</Label>
          <Input
            type="date"
            value={form.fecha_aprobacion}
            onChange={(e) => setForm({ ...form, fecha_aprobacion: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Cliente / referencia</Label>
          <Input
            value={form.cliente_referencia}
            onChange={(e) => setForm({ ...form, cliente_referencia: e.target.value })}
            placeholder="Ej. Colegio XYZ"
            className="mt-1"
          />
        </div>
      </div>

      <Field label="Descripción del producto">
        <textarea
          value={form.descripcion_larga}
          onChange={(e) => setForm({ ...form, descripcion_larga: e.target.value })}
          rows={3}
          placeholder="Pantalón escolar que lleva elástico en la cintura. Cuenta con..."
          className="mt-1 w-full rounded-md border border-input bg-white p-2 text-sm"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Alcance / uso de la prenda">
          <Input
            value={form.alcance_uso}
            onChange={(e) => setForm({ ...form, alcance_uso: e.target.value })}
            placeholder="Prenda uso escolar"
            className="mt-1"
          />
        </Field>
        <Field label="Observaciones">
          <Input
            value={form.observaciones}
            onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
            className="mt-1"
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button variant="premium" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar resumen
        </Button>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// COMPOSICIÓN (tela principal + secundaria)
// ────────────────────────────────────────────────────────────────────────────
function ComposicionTab({ ficha }: { ficha: FichaTecnica }) {
  const [pending, start] = useTransition();

  // Cliente reportó (post-2026-07-08): "nuestros disfraces requieren hasta
  // 9 tipos de tela". Ampliamos de 2 (principal + secundaria) a 9 (principal
  // + 8 secundarias). Los prefijos son:
  //   - tela_principal
  //   - tela_secundaria (la secundaria original, mantiene el nombre por compat)
  //   - tela_secundaria_2 hasta tela_secundaria_8 (mig 59)
  const PREFIXES = ['tela_principal', 'tela_secundaria', 'tela_secundaria_2', 'tela_secundaria_3',
    'tela_secundaria_4', 'tela_secundaria_5', 'tela_secundaria_6', 'tela_secundaria_7',
    'tela_secundaria_8'] as const;
  const SUFIJOS = ['nombre', 'composicion', 'color', 'densidad', 'ancho'] as const;

  const initial: Record<string, string> = {};
  for (const p of PREFIXES) {
    for (const s of SUFIJOS) {
      const key = `${p}_${s}`;
      initial[key] = (ficha as unknown as Record<string, string | null>)[key] ?? '';
    }
  }
  const [form, setForm] = useState<Record<string, string>>(initial);

  // Cuántas telas secundarias "expandir" por default: mostramos hasta la
  // última con datos + 1 vacía. Así si la ficha tiene 3 telas usadas, muestra 4.
  const [telasVisibles, setTelasVisibles] = useState(() => {
    let ultimaConDatos = 1; // 1 = solo principal
    for (let i = 1; i < PREFIXES.length; i++) {
      const p = PREFIXES[i]!;
      const hayDatos = SUFIJOS.some((s) => initial[`${p}_${s}`]);
      if (hayDatos) ultimaConDatos = i + 1;
    }
    return Math.min(9, Math.max(2, ultimaConDatos + 1));
  });

  function save() {
    start(async () => {
      const r = await actualizarFichaTecnica(ficha.id, form);
      if (r.ok) toast.success('Composición guardada');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="space-y-4">
      {PREFIXES.slice(0, telasVisibles).map((prefix, idx) => (
        <Card key={prefix} className="space-y-3 p-5">
          <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-corp-900">
            <Layers className="mr-1 inline h-3.5 w-3.5" />
            {idx === 0 ? 'Tela principal' : `Tela secundaria ${idx === 1 ? '' : idx} (opcional)`}
          </h4>
          <TelaForm
            prefix={prefix}
            values={form}
            onChange={(v) => setForm({ ...form, ...v })}
          />
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {telasVisibles < 9 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTelasVisibles((n) => Math.min(9, n + 1))}
            type="button"
          >
            + Agregar tela {telasVisibles === 1 ? 'secundaria' : `secundaria ${telasVisibles}`}
          </Button>
        )}
        {telasVisibles >= 9 && <span className="text-xs text-slate-500">Máximo 9 telas</span>}
        <Button variant="premium" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar composición
        </Button>
      </div>
    </div>
  );
}

function TelaForm({
  prefix, values, onChange,
}: {
  prefix: string;   // Ampliado para soportar tela_secundaria_2..8 (mig 59)
  values: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const k = (suf: string) => `${prefix}_${suf}`;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Nombre tejido">
        <Input
          value={values[k('nombre')] ?? ''}
          onChange={(e) => onChange({ [k('nombre')]: e.target.value })}
          placeholder="Polinam"
          className="mt-1"
        />
      </Field>
      <Field label="Composición">
        <Input
          value={values[k('composicion')] ?? ''}
          onChange={(e) => onChange({ [k('composicion')]: e.target.value })}
          placeholder="100% poliéster"
          className="mt-1"
        />
      </Field>
      <Field label="Color">
        <Input
          value={values[k('color')] ?? ''}
          onChange={(e) => onChange({ [k('color')]: e.target.value })}
          placeholder="Verde"
          className="mt-1"
        />
      </Field>
      <Field label="Densidad">
        <Input
          value={values[k('densidad')] ?? ''}
          onChange={(e) => onChange({ [k('densidad')]: e.target.value })}
          className="mt-1"
        />
      </Field>
      <Field label="Ancho de tela">
        <Input
          value={values[k('ancho')] ?? ''}
          onChange={(e) => onChange({ [k('ancho')]: e.target.value })}
          placeholder="1.70 +/- 2 cm"
          className="mt-1"
        />
      </Field>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MEDIDAS — matriz medida × talla
// ────────────────────────────────────────────────────────────────────────────
type MedidaRow = {
  codigo: string;
  descripcion: string;
  tolerancia_cm: number;
  observaciones: string;
  valores: Record<string, string>; // talla → valor string
};

function MedidasTab({
  ficha, medidasIniciales, tallasProducto,
}: {
  ficha: FichaTecnica;
  medidasIniciales: FichaMedida[];
  tallasProducto: string[];
}) {
  const [pending, start] = useTransition();
  const tallas = useMemo(() => {
    const set = new Set<string>();
    tallasProducto.forEach((t) => set.add(t));
    medidasIniciales.forEach((m) => m.valores.forEach((v) => set.add(v.talla)));
    return Array.from(set).sort((a, b) => ordenTalla(a) - ordenTalla(b));
  }, [tallasProducto, medidasIniciales]);

  const [rows, setRows] = useState<MedidaRow[]>(() => {
    if (medidasIniciales.length === 0) {
      // Plantilla: una fila vacía para arrancar
      return [{ codigo: 'A', descripcion: '', tolerancia_cm: 0.5, observaciones: '', valores: {} }];
    }
    return medidasIniciales.map((m) => ({
      codigo: m.codigo,
      descripcion: m.descripcion,
      tolerancia_cm: m.tolerancia_cm,
      observaciones: m.observaciones ?? '',
      valores: Object.fromEntries(m.valores.map((v) => [v.talla, v.valor !== null ? String(v.valor) : '']))
    }));
  });

  function siguienteCodigo() {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const usadas = new Set(rows.map((r) => r.codigo.trim().toUpperCase()));
    for (const l of letras) if (!usadas.has(l)) return l;
    return `M${rows.length + 1}`;
  }

  function agregar() {
    setRows([...rows, { codigo: siguienteCodigo(), descripcion: '', tolerancia_cm: 0.5, observaciones: '', valores: {} }]);
  }

  // "Copiar de otro producto" (pedido 20/07/2026): las prendas de una misma
  // categoría comparten cuadro de medidas casi siempre. Se copian las medidas
  // de la ficha vigente de otro producto al grid — el usuario revisa/ajusta
  // y recién persiste con "Guardar medidas".
  const [copiarOpen, setCopiarOpen] = useState(false);

  function copiarDesde(meds: FichaMedida[], nombreOrigen: string) {
    const hayContenido = rows.some(
      (r) => r.descripcion.trim() !== '' || Object.values(r.valores).some((v) => v && v.trim() !== ''),
    );
    if (
      hayContenido &&
      !confirm(`Se reemplazará el cuadro actual por las ${meds.length} medidas de "${nombreOrigen}". ¿Desea continuar?`)
    ) {
      return;
    }
    const tallasSet = new Set(tallas);
    let valoresOmitidos = 0;
    const nuevos: MedidaRow[] = meds.map((m) => {
      const valores: Record<string, string> = {};
      for (const v of m.valores) {
        if (v.valor === null) continue;
        if (tallasSet.has(v.talla)) valores[v.talla] = String(v.valor);
        else valoresOmitidos++;
      }
      return {
        codigo: m.codigo,
        descripcion: m.descripcion,
        tolerancia_cm: m.tolerancia_cm,
        observaciones: m.observaciones ?? '',
        valores,
      };
    });
    setRows(nuevos);
    setCopiarOpen(false);
    toast.success(
      `${meds.length} medida(s) copiadas de "${nombreOrigen}". Revise los valores y presione "Guardar medidas".`,
      { duration: 8000 },
    );
    if (valoresOmitidos > 0) {
      toast.info(
        `${valoresOmitidos} valor(es) no se copiaron porque este producto no tiene esas tallas.`,
        { duration: 8000 },
      );
    }
  }
  function eliminar(i: number) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  function actualizar(i: number, patch: Partial<MedidaRow>) {
    setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function setValor(i: number, talla: string, valor: string) {
    setRows(rows.map((r, idx) => idx === i ? { ...r, valores: { ...r.valores, [talla]: valor } } : r));
  }

  function save() {
    // Validación local
    for (const r of rows) {
      if (!r.codigo.trim() || !r.descripcion.trim()) {
        toast.error('Cada medida necesita código y descripción');
        return;
      }
    }
    const codigosUnicos = new Set(rows.map((r) => r.codigo.trim().toUpperCase()));
    if (codigosUnicos.size !== rows.length) {
      toast.error('Hay códigos duplicados');
      return;
    }

    start(async () => {
      const r = await guardarMedidasFicha(
        ficha.id,
        rows.map((row, idx) => ({
          codigo: row.codigo,
          descripcion: row.descripcion,
          tolerancia_cm: Number(row.tolerancia_cm) || 0,
          observaciones: row.observaciones || null,
          orden: idx,
          valores: tallas.map((t) => ({
            talla: t,
            valor: row.valores[t] && row.valores[t].trim() !== '' ? Number(row.valores[t]) : null,
          })),
        })),
      );
      if (r.ok) toast.success('Medidas guardadas');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <div>
          <h4 className="font-display text-sm font-semibold text-corp-900">
            Cuadro de medidas (centímetros)
          </h4>
          <p className="text-[11px] text-slate-500">
            {tallas.length === 0
              ? 'Este producto no tiene variantes con tallas todavía — crealas en la tab "Variantes".'
              : `Tallas disponibles: ${tallas.join(' · ')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopiarOpen(true)}
            title="Copiar el cuadro de medidas de otro producto (misma categoría, por ejemplo)"
          >
            <Copy className="h-3.5 w-3.5" /> Copiar de…
          </Button>
          <Button variant="outline" size="sm" onClick={agregar}>
            <Plus className="h-3.5 w-3.5" /> Medida
          </Button>
          <Button variant="premium" size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar medidas
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">#</TableHead>
              <TableHead className="min-w-[200px]">Descripción</TableHead>
              {tallas.map((t) => (
                <TableHead key={t} className="w-20 text-center">{t}</TableHead>
              ))}
              <TableHead className="w-20 text-center">Tol ±cm</TableHead>
              <TableHead className="min-w-[120px]">Observación</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={tallas.length + 5} className="py-8 text-center text-sm text-slate-400">
                  Sin medidas. Click en "Medida" para agregar.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>
                  <Input
                    value={row.codigo}
                    onChange={(e) =>
                      actualizar(i, {
                        // Solo letras y dígitos, mayúsculas, máx 4 (A, B, A1, M1, etc.)
                        codigo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4),
                      })
                    }
                    placeholder="A"
                    className="h-8 text-center font-mono text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.descripcion}
                    onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                    placeholder="LARGO DESDE EL BORDE DE PRETINA"
                    maxLength={120}
                    className="h-8"
                  />
                </TableCell>
                {tallas.map((t) => (
                  <TableCell key={t}>
                    <Input
                      value={row.valores[t] ?? ''}
                      inputMode="decimal"
                      onChange={(e) =>
                        setValor(
                          i,
                          t,
                          // Permite dígitos, punto y coma; convierte coma a punto;
                          // mantiene solo el primer punto si vienen varios.
                          e.target.value
                            .replace(/[^\d.,]/g, '')
                            .replace(/,/g, '.')
                            .replace(/^(\d*\.\d*).*/, '$1'),
                        )
                      }
                      placeholder="—"
                      className="h-8 text-center font-mono text-xs"
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={50}
                    value={row.tolerancia_cm}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      actualizar(i, { tolerancia_cm: Number.isFinite(n) && n >= 0 ? Math.min(n, 50) : 0 });
                    }}
                    className="h-8 text-center font-mono text-xs"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.observaciones}
                    onChange={(e) => actualizar(i, { observaciones: e.target.value })}
                    maxLength={200}
                    className="h-8"
                  />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => eliminar(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {copiarOpen && (
        <CopiarMedidasModal
          productoId={ficha.producto_id}
          onClose={() => setCopiarOpen(false)}
          onCopiar={copiarDesde}
        />
      )}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MODAL — Copiar cuadro de medidas desde otro producto
// ────────────────────────────────────────────────────────────────────────────
function CopiarMedidasModal({
  productoId, onClose, onCopiar,
}: {
  productoId: string;
  onClose: () => void;
  onCopiar: (medidas: FichaMedida[], nombreOrigen: string) => void;
}) {
  const [lista, setLista] = useState<{ producto_id: string; nombre: string; codigo: string; medidas: number }[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  useEffect(() => {
    listarProductosConCuadroMedidas(productoId)
      .then(setLista)
      .catch(() => setLista([]));
  }, [productoId]);

  const filtrados = useMemo(() => {
    const tokens = normalizarTexto(filtro).split(/\s+/).filter(Boolean);
    return (lista ?? [])
      .filter((p) => {
        const hay = normalizarTexto(`${p.nombre} ${p.codigo}`);
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 30);
  }, [lista, filtro]);

  async function elegir(p: { producto_id: string; nombre: string }) {
    setCargandoId(p.producto_id);
    try {
      const meds = await obtenerMedidasParaCopiar(p.producto_id);
      if (meds.length === 0) {
        toast.error('Ese producto no tiene medidas en su ficha vigente.');
        return;
      }
      onCopiar(meds, p.nombre);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudieron cargar las medidas');
    } finally {
      setCargandoId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-happy-600" />
            <h3 className="font-display text-lg font-semibold text-corp-900">Copiar medidas de otro producto</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Elija el producto del cual copiar el cuadro completo (medidas, valores por talla y tolerancias).
          Los valores llegan al cuadro para que los revise — nada se guarda hasta presionar <strong>"Guardar medidas"</strong>.
        </p>
        <Input
          autoFocus
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="mb-3"
        />
        <div className="max-h-72 overflow-y-auto rounded-md border">
          {lista === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando productos…
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {lista.length === 0
                ? 'Ningún producto tiene cuadro de medidas con valores todavía.'
                : 'Sin coincidencias.'}
            </p>
          ) : (
            filtrados.map((p) => (
              <button
                key={p.producto_id}
                type="button"
                onClick={() => elegir(p)}
                disabled={cargandoId !== null}
                className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-happy-50 disabled:opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-corp-900">{p.nombre}</p>
                  <p className="text-[11px] text-slate-500">{p.codigo}</p>
                </div>
                {cargandoId === p.producto_id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-happy-600" />
                ) : (
                  <Badge variant="secondary">{p.medidas} medida{p.medidas === 1 ? '' : 's'}</Badge>
                )}
              </button>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// IMÁGENES
// ────────────────────────────────────────────────────────────────────────────
function ImagenesTab({
  fichaId,
  imagenes,
  galeriaProducto,
}: {
  fichaId: string;
  imagenes: FichaImagen[];
  galeriaProducto: GaleriaItem[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<TipoImagenFicha>('DELANTERO');
  const [leyenda, setLeyenda] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [galeriaOpen, setGaleriaOpen] = useState(false);

  // URLs ya vinculadas a esta ficha (para marcar las que ya están en uso)
  const urlsEnFicha = new Set(imagenes.map((i) => i.url));

  async function handleFile(file: File) {
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
      toast.error('Solo PNG, JPG o WEBP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Máx 10 MB');
      return;
    }
    setSubiendo(true);
    try {
      // FileReader.readAsDataURL es robusto para archivos grandes.
      // (El anterior `String.fromCharCode(...new Uint8Array(buf))` causaba
      // "Maximum call stack size exceeded" en imágenes de varios MB porque
      // el spread operator pasa miles de argumentos a fromCharCode.)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.split(',')[1] ?? '';
      if (!base64) throw new Error('Archivo vacío o ilegible');

      const r = await subirImagenFicha(fichaId, {
        tipo,
        leyenda: leyenda || null,
        filename: file.name,
        mime: file.type as 'image/png' | 'image/jpeg' | 'image/webp',
        base64,
      });
      if (r.ok) {
        toast.success('Imagen subida');
        setLeyenda('');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    } catch (e) {
      toast.error('Error al subir: ' + (e as Error).message);
    } finally {
      setSubiendo(false);
    }
  }

  async function vincularDesdeGaleria(url: string) {
    setSubiendo(true);
    try {
      const r = await vincularImagenDesdeGaleria(fichaId, {
        tipo,
        url,
        leyenda: leyenda || null,
      });
      if (r.ok) {
        toast.success(`Imagen vinculada como ${TIPO_IMAGEN_LABEL[tipo]}`);
        setLeyenda('');
        setGaleriaOpen(false);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Error');
      }
    } finally {
      setSubiendo(false);
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Eliminar esta imagen?')) return;
    const r = await eliminarImagenFicha(id);
    if (r.ok) {
      toast.success('Imagen eliminada');
      router.refresh();
    } else {
      toast.error(r.error ?? 'Error');
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-corp-900">
          <Upload className="mr-1 inline h-3.5 w-3.5" /> Subir nueva imagen
        </h4>
        <div className="grid gap-3 sm:grid-cols-[200px_1fr_auto]">
          <div>
            <Label className="text-xs">Tipo</Label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoImagenFicha)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-white px-2 text-sm"
            >
              {TIPOS_IMAGEN_FICHA.map((t) => (
                <option key={t} value={t}>{TIPO_IMAGEN_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs">Leyenda (opcional)</Label>
            <Input
              value={leyenda}
              onChange={(e) => setLeyenda(e.target.value)}
              placeholder="Vista delantera del modelo"
              className="mt-1"
            />
          </div>
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Reset INMEDIATO del input — así onChange siempre se dispara
                // aunque se seleccione el mismo archivo, y nunca queda
                // "atascado" si el upload falla.
                e.target.value = '';
                if (f) void handleFile(f);
              }}
              className="hidden"
            />
            <Button
              variant="premium"
              onClick={() => fileRef.current?.click()}
              disabled={subiendo}
            >
              {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Subir
            </Button>
            {galeriaProducto.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setGaleriaOpen(true)}
                disabled={subiendo}
                title="Reutilizar una imagen ya subida en la galería del producto"
              >
                <ImageIcon className="h-4 w-4" />
                Elegir de galería ({galeriaProducto.length})
              </Button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400">PNG / JPG / WEBP · máx 10 MB · o reusá imágenes ya subidas en el producto sin duplicar archivo</p>
      </Card>

      {/* Modal: elegir de galería del producto */}
      {galeriaOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-corp-900/60 backdrop-blur-sm p-4"
          onClick={() => !subiendo && setGaleriaOpen(false)}
        >
          <Card
            className="w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-corp-900">
                  Elegir imagen de la galería del producto
                </h3>
                <p className="text-xs text-slate-500">
                  Se vinculará como <strong>{TIPO_IMAGEN_LABEL[tipo]}</strong> sin duplicar el archivo en storage.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setGaleriaOpen(false)} disabled={subiendo}>
                ✕
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {galeriaProducto.map((g) => {
                const yaUsada = urlsEnFicha.has(g.url);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => !yaUsada && vincularDesdeGaleria(g.url)}
                    disabled={subiendo || yaUsada}
                    className={`group relative overflow-hidden rounded-md border-2 transition ${
                      yaUsada
                        ? 'border-slate-200 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 hover:border-happy-500 hover:shadow-md cursor-pointer'
                    }`}
                  >
                    <div className="aspect-square bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={g.url} alt={g.alt ?? ''} className="h-full w-full object-contain" />
                    </div>
                    {yaUsada && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          ✓ Ya en ficha
                        </span>
                      </div>
                    )}
                    {!yaUsada && (
                      <div className="absolute inset-0 hidden items-center justify-center bg-happy-500/10 group-hover:flex">
                        <span className="rounded-full bg-happy-500 px-3 py-1 text-xs font-medium text-white">
                          Vincular
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {imagenes.length === 0 ? (
        <Card className="p-10 text-center">
          <ImageIcon className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Aún no hay imágenes en esta ficha.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {imagenes.map((img) => (
            <Card key={img.id} className="overflow-hidden">
              <div className="aspect-square bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.leyenda ?? ''} className="h-full w-full object-contain" />
              </div>
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px]">{TIPO_IMAGEN_LABEL[img.tipo]}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => borrar(img.id)}>
                    <Trash2 className="h-3 w-3 text-rose-500" />
                  </Button>
                </div>
                {img.leyenda && <p className="text-xs text-slate-600">{img.leyenda}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CONFECCIÓN / ACABADOS
// ────────────────────────────────────────────────────────────────────────────
function ConfeccionTab({ ficha }: { ficha: FichaTecnica }) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    puntadas_remalle: ficha.puntadas_remalle ?? '',
    puntadas_recta: ficha.puntadas_recta ?? '',
    notas_confeccion: ficha.notas_confeccion ?? '',
    notas_acabados: ficha.notas_acabados ?? '',
    envase_primario: ficha.envase_primario ?? '',
    envase_secundario: ficha.envase_secundario ?? '',
    cinta_embalaje: ficha.cinta_embalaje ?? '',
    sticker_talla: ficha.sticker_talla ?? '',
    rotulado_primario: ficha.rotulado_primario ?? '',
    rotulado_secundario: ficha.rotulado_secundario ?? '',
  });

  function save() {
    start(async () => {
      const r = await actualizarFichaTecnica(ficha.id, form);
      if (r.ok) toast.success('Notas guardadas');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-corp-900">Confección</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Puntadas por pulgada — remalle">
            <Input
              value={form.puntadas_remalle}
              onChange={(e) => setForm({ ...form, puntadas_remalle: e.target.value })}
              placeholder="11 ppp +/- 1"
              className="mt-1"
            />
          </Field>
          <Field label="Puntadas por pulgada — recta">
            <Input
              value={form.puntadas_recta}
              onChange={(e) => setForm({ ...form, puntadas_recta: e.target.value })}
              placeholder="10 ppp +/- 1"
              className="mt-1"
            />
          </Field>
        </div>
        <Field label="Notas de confección (descripción por sección)">
          <textarea
            value={form.notas_confeccion}
            onChange={(e) => setForm({ ...form, notas_confeccion: e.target.value })}
            rows={6}
            placeholder="DELANTERO: El bolsillo delantero consiste en...&#10;TIROS: Dos piezas unidas con remalle de cuatro hilos..."
            className="mt-1 w-full rounded-md border border-input bg-white p-2 font-mono text-xs"
          />
        </Field>
      </Card>

      <Card className="space-y-3 p-5">
        <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-corp-900">Acabados y empaque</h4>
        <Field label="Notas de acabados">
          <textarea
            value={form.notas_acabados}
            onChange={(e) => setForm({ ...form, notas_acabados: e.target.value })}
            rows={3}
            placeholder="Planchado o vaporizado, libre de brillo..."
            className="mt-1 w-full rounded-md border border-input bg-white p-2 text-xs"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Envase primario (bolsa individual)">
            <Input
              value={form.envase_primario}
              onChange={(e) => setForm({ ...form, envase_primario: e.target.value })}
              placeholder="Bolsa polietileno 13x20 / 1.5 micras"
              className="mt-1"
            />
          </Field>
          <Field label="Envase secundario (caja)">
            <Input
              value={form.envase_secundario}
              onChange={(e) => setForm({ ...form, envase_secundario: e.target.value })}
              placeholder="Cartón corrugado 60x40x40 / 20 unid"
              className="mt-1"
            />
          </Field>
          <Field label="Cinta de embalaje">
            <Input
              value={form.cinta_embalaje}
              onChange={(e) => setForm({ ...form, cinta_embalaje: e.target.value })}
              placeholder='3" transparente'
              className="mt-1"
            />
          </Field>
          <Field label="Sticker de talla">
            <Input
              value={form.sticker_talla}
              onChange={(e) => setForm({ ...form, sticker_talla: e.target.value })}
              placeholder="Papel adhesivo 1cm fondo blanco"
              className="mt-1"
            />
          </Field>
          <Field label="Rotulado primario">
            <Input
              value={form.rotulado_primario}
              onChange={(e) => setForm({ ...form, rotulado_primario: e.target.value })}
              placeholder="Contiene talla, ubicado..."
              className="mt-1"
            />
          </Field>
          <Field label="Rotulado secundario (caja)">
            <Input
              value={form.rotulado_secundario}
              onChange={(e) => setForm({ ...form, rotulado_secundario: e.target.value })}
              placeholder="Etiqueta A4 con razón social, RUC, tallas/cantidad"
              className="mt-1"
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button variant="premium" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// CORTE — piezas
// ────────────────────────────────────────────────────────────────────────────
type PiezaRow = {
  tipo_tela: TipoTela;
  descripcion: string;
  cantidad: string;
  posicion: string;
  orientacion: string;
  observaciones: string;
};

function CorteTab({ ficha, piezasIniciales }: { ficha: FichaTecnica; piezasIniciales: PiezaCorte[] }) {
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<PiezaRow[]>(() =>
    piezasIniciales.length > 0
      ? piezasIniciales.map((p) => ({
          tipo_tela: p.tipo_tela,
          descripcion: p.descripcion,
          cantidad: String(p.cantidad),
          posicion: p.posicion ?? '',
          orientacion: p.orientacion ?? '',
          observaciones: p.observaciones ?? '',
        }))
      : [{ tipo_tela: 'PRINCIPAL', descripcion: '', cantidad: '1', posicion: 'vertical', orientacion: 'hilo', observaciones: '' }],
  );

  function agregar() {
    setRows([...rows, { tipo_tela: 'PRINCIPAL', descripcion: '', cantidad: '1', posicion: 'vertical', orientacion: 'hilo', observaciones: '' }]);
  }
  function eliminar(i: number) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  function actualizar(i: number, patch: Partial<PiezaRow>) {
    setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function save() {
    for (const r of rows) {
      if (!r.descripcion.trim()) {
        toast.error('Toda pieza requiere descripción');
        return;
      }
      if (!r.cantidad || Number(r.cantidad) < 1) {
        toast.error('Cantidad debe ser ≥ 1');
        return;
      }
    }
    start(async () => {
      const r = await guardarPiezasCorte(
        ficha.id,
        rows.map((row, idx) => ({
          tipo_tela: row.tipo_tela,
          descripcion: row.descripcion,
          cantidad: Number(row.cantidad),
          posicion: row.posicion || null,
          orientacion: row.orientacion || null,
          observaciones: row.observaciones || null,
          orden: idx,
        })),
      );
      if (r.ok) toast.success('Piezas guardadas');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-slate-200 p-3">
        <div>
          <h4 className="font-display text-sm font-semibold text-corp-900">Hoja de corte</h4>
          <p className="text-[11px] text-slate-500">Piezas a cortar por tipo de tela. Subí un diagrama en la tab "Imágenes" tipo "Diagrama de corte".</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={agregar}>
            <Plus className="h-3.5 w-3.5" /> Pieza
          </Button>
          <Button variant="premium" size="sm" onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">Tipo tela</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead className="w-20 text-center">Cantidad</TableHead>
            <TableHead className="w-32">Posición</TableHead>
            <TableHead className="w-32">Orientación</TableHead>
            <TableHead>Observación</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-400">
                Sin piezas. Click en "Pieza" para agregar.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row, i) => (
            <TableRow key={i}>
              <TableCell>
                <select
                  value={row.tipo_tela}
                  onChange={(e) => actualizar(i, { tipo_tela: e.target.value as TipoTela })}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                >
                  {TIPOS_TELA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </TableCell>
              <TableCell>
                <Input
                  value={row.descripcion}
                  onChange={(e) => actualizar(i, { descripcion: e.target.value })}
                  placeholder="Delantero, Bolsa menor, Vivos, Franja..."
                  maxLength={80}
                  className="h-8"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  inputMode="numeric"
                  value={row.cantidad}
                  // Solo enteros positivos (las piezas de corte son unidades enteras)
                  onChange={(e) => actualizar(i, { cantidad: e.target.value.replace(/[^\d]/g, '') })}
                  className="h-8 text-center font-mono text-xs"
                />
              </TableCell>
              <TableCell>
                <select
                  value={row.posicion}
                  onChange={(e) => actualizar(i, { posicion: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                >
                  <option value="">—</option>
                  <option value="vertical">vertical</option>
                  <option value="horizontal">horizontal</option>
                  <option value="sesgo">sesgo</option>
                </select>
              </TableCell>
              <TableCell>
                <select
                  value={row.orientacion}
                  onChange={(e) => actualizar(i, { orientacion: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-white px-2 text-xs"
                >
                  <option value="">—</option>
                  <option value="hilo">hilo</option>
                  <option value="contrahilo">contrahilo</option>
                  <option value="diagonal">diagonal</option>
                </select>
              </TableCell>
              <TableCell>
                <Input
                  value={row.observaciones}
                  onChange={(e) => actualizar(i, { observaciones: e.target.value })}
                  maxLength={200}
                  className="h-8"
                />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => eliminar(i)}>
                  <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AVÍOS — solo lectura desde receta + procesos
// ────────────────────────────────────────────────────────────────────────────
function AviosTab({ productoId, avios, procesos }: { productoId: string; avios: AvioRow[]; procesos: ProcesoFichaRow[] }) {
  return (
    <div className="space-y-4">
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <div>
            <h4 className="font-display text-sm font-semibold text-corp-900">Cuadro de avíos</h4>
            <p className="text-[11px] text-slate-500">
              Materiales tomados de la <Link href={`/recetas?producto=${productoId}`} className="text-happy-600 hover:underline">receta activa</Link>.
              Subí imagen referencial desde /materiales.
            </p>
          </div>
        </div>
        {avios.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Este producto no tiene receta activa con materiales.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16"></TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Cantidad total</TableHead>
                <TableHead>Unidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {avios.map((a) => (
                <TableRow key={a.material_id}>
                  <TableCell>
                    {a.imagen_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.imagen_url} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-100 text-slate-300">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-corp-900">{a.nombre}</div>
                    <div className="font-mono text-[10px] text-slate-400">{a.codigo}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{a.categoria}</Badge></TableCell>
                  <TableCell className="text-sm">{a.color ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{a.cantidad_total.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</TableCell>
                  <TableCell className="text-xs text-slate-500">{a.unidad || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-slate-200 p-3">
          <h4 className="font-display text-sm font-semibold text-corp-900">Procesos / secuencia de operaciones</h4>
          <p className="text-[11px] text-slate-500">
            Vista previa. Para <strong>agregar, editar o reordenar</strong> pasos, andá al editor de recetas (botón &quot;Ver receta BOM&quot; arriba).
          </p>
        </div>
        {procesos.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Este producto no tiene procesos cargados.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 text-center">#</TableHead>
                <TableHead>Proceso</TableHead>
                <TableHead>Área</TableHead>
                <TableHead>Máquina</TableHead>
                <TableHead>Descripción operativa</TableHead>
                <TableHead className="w-24 text-right">Tiempo min</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procesos.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-center font-mono text-xs">{p.orden}</TableCell>
                  <TableCell className="text-sm font-medium">{p.proceso}</TableCell>
                  <TableCell className="text-xs">{p.area ?? '—'}</TableCell>
                  <TableCell className="text-xs">
                    {p.maquina ?? <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.descripcion_operativa ?? <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{p.tiempo_estandar_min}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MODAL — Compartir ficha vía link público
// ────────────────────────────────────────────────────────────────────────────
type LinkRow = { id: string; token: string; expira_en: string | null; vistas: number; activo: boolean; created_at: string; ultima_vista_en: string | null };

function CompartirModal({ fichaId, onClose }: { fichaId: string; onClose: () => void }) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [generando, startGen] = useTransition();
  const [diasValidez, setDiasValidez] = useState('30');
  const webUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    // Asume mismo dominio o variable de env. Usamos NEXT_PUBLIC_WEB_URL si está definida.
    return (process.env.NEXT_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const data = await listarLinksPublicos(fichaId);
      setLinks(data as unknown as LinkRow[]);
    } finally {
      setCargando(false);
    }
  }

  // Cargar al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { void cargar(); }, []);

  function generar() {
    const dias = Math.max(0, Math.min(365, Number(diasValidez) || 0));
    startGen(async () => {
      const r = await generarLinkPublico(fichaId, { dias_validez: dias });
      if (r.ok) {
        toast.success('Link generado');
        void cargar();
      } else {
        toast.error(r.error ?? 'Error');
      }
    });
  }

  async function copiarLink(token: string) {
    const url = `${webUrl || window.location.origin.replace('erp', 'web')}/fichas/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar — copia manual: ' + url);
    }
  }

  async function revocar(linkId: string) {
    if (!confirm('¿Revocar este link? El cliente que lo tenga ya no podrá acceder.')) return;
    const r = await revocarLinkPublico(linkId);
    if (r.ok) {
      toast.success('Link revocado');
      void cargar();
    } else {
      toast.error(r.error ?? 'Error');
    }
  }

  function fmtFecha(s: string | null): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  }

  function linkUrl(token: string): string {
    const base = webUrl || (typeof window !== 'undefined' ? window.location.origin.replace('erp', 'web') : '');
    return `${base}/fichas/${token}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-happy-600" />
            <h3 className="font-display text-lg font-semibold text-corp-900">Compartir ficha técnica</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          Genera un link público que el cliente B2B puede abrir sin login. Podés revocarlo cuando quieras.
        </p>

        {/* Generar nuevo */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label className="text-xs">Validez (días)</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={diasValidez}
                onChange={(e) => setDiasValidez(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-[10px] text-slate-400">0 = no expira</p>
            </div>
            <Button variant="premium" onClick={generar} disabled={generando}>
              {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generar link
            </Button>
          </div>
        </div>

        {/* Lista de links existentes */}
        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200">
          {cargando ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : links.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Todavía no generaste ningún link.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Link</TableHead>
                  <TableHead className="w-24">Expira</TableHead>
                  <TableHead className="w-16 text-center">Vistas</TableHead>
                  <TableHead className="w-24">Estado</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => {
                  const expirado = !!(l.expira_en && new Date(l.expira_en) < new Date());
                  const activo = l.activo && !expirado;
                  return (
                    <TableRow key={l.id} className={!activo ? 'opacity-50' : ''}>
                      <TableCell>
                        <p className="font-mono text-[10px] text-slate-600">{l.token.slice(0, 8)}…{l.token.slice(-4)}</p>
                        <p className="text-[10px] text-slate-400">Creado {fmtFecha(l.created_at)}</p>
                      </TableCell>
                      <TableCell className="text-xs">{l.expira_en ? fmtFecha(l.expira_en) : 'Nunca'}</TableCell>
                      <TableCell className="text-center font-mono text-xs">{l.vistas}</TableCell>
                      <TableCell>
                        {!l.activo ? (
                          <Badge variant="secondary" className="text-[10px]">Revocado</Badge>
                        ) : expirado ? (
                          <Badge variant="outline" className="text-[10px]">Expirado</Badge>
                        ) : (
                          <Badge variant="success" className="text-[10px]">Activo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {activo && (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => copiarLink(l.token)} title="Copiar link">
                                <Copy className="h-3 w-3" />
                              </Button>
                              <a href={linkUrl(l.token)} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="sm" title="Abrir en nueva pestaña">
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </a>
                              <Button variant="ghost" size="sm" onClick={() => revocar(l.id)} title="Revocar">
                                <Trash2 className="h-3 w-3 text-rose-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MODAL — Plantilla por tipo de prenda
// ────────────────────────────────────────────────────────────────────────────
function PlantillaModal({ fichaId, onClose, onApplied }: { fichaId: string; onClose: () => void; onApplied: () => void }) {
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [aplicando, start] = useTransition();

  function aplicar() {
    if (!seleccionada) return;
    if (!confirm('¿Aplicar plantilla? Solo se agregarán medidas/piezas que NO existan — no se sobreescribe lo que ya cargaste.')) return;
    start(async () => {
      const r = await aplicarPlantillaFicha(fichaId, seleccionada);
      if (r.ok) {
        const d = r.data;
        toast.success(`Plantilla aplicada — +${d?.medidas_agregadas ?? 0} medidas, +${d?.piezas_agregadas ?? 0} piezas`);
        onApplied();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-happy-600" />
            <h3 className="font-display text-lg font-semibold text-corp-900">Aplicar plantilla de prenda</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Elija el tipo de prenda que más se acerque. Se agregarán las medidas estándar y piezas típicas — <strong>solo si no existen ya</strong> en su ficha (no destruye nada cargado).
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {PLANTILLAS_PRENDA.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setSeleccionada(p.key)}
              className={`flex items-start gap-3 rounded-lg border-2 p-3 text-left transition ${
                seleccionada === p.key
                  ? 'border-happy-500 bg-happy-50'
                  : 'border-slate-200 bg-white hover:border-happy-300 hover:bg-happy-50/30'
              }`}
            >
              <span className="text-2xl">{p.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-semibold text-corp-900">{p.nombre}</p>
                <p className="text-[11px] text-slate-500">{p.descripcion}</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  {p.medidas.length} medidas · {p.piezas.length} piezas
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={aplicando}>Cancelar</Button>
          <Button variant="premium" onClick={aplicar} disabled={!seleccionada || aplicando}>
            {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar plantilla
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// MODAL — Diff de revisiones
// ────────────────────────────────────────────────────────────────────────────
function DiffModal({ productoId, onClose }: { productoId: string; onClose: () => void }) {
  const [diff, setDiff] = useState<DiffRevisiones | null | 'loading'>('loading');

  // Cargar una sola vez
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {
    (async () => {
      try {
        const d = await obtenerDiffRevisiones(productoId);
        setDiff(d);
      } catch {
        setDiff(null);
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="flex max-h-[85vh] w-full max-w-3xl flex-col p-0 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <GitCompare className="h-5 w-5 text-happy-600" />
            <h3 className="font-display text-lg font-semibold text-corp-900">
              Comparar revisiones
              {diff && diff !== 'loading' && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  Rev. {diff.rev_anterior} → Rev. {diff.rev_actual}
                </span>
              )}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {diff === 'loading' && (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          )}
          {diff === null && (
            <p className="py-10 text-center text-sm text-slate-500">
              No hay diferencias o aún no existe una segunda revisión.
            </p>
          )}
          {diff && diff !== 'loading' && (
            <>
              {diff.campos_cambiados.length === 0 && diff.medidas_cambiadas.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">
                  Las dos revisiones son idénticas en datos cargados.
                </p>
              )}

              {diff.campos_cambiados.length > 0 && (
                <Card className="p-0">
                  <div className="border-b border-slate-100 p-3">
                    <h4 className="font-display text-sm font-semibold text-corp-900">
                      Campos cambiados ({diff.campos_cambiados.length})
                    </h4>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campo</TableHead>
                        <TableHead>Rev. {diff.rev_anterior}</TableHead>
                        <TableHead>Rev. {diff.rev_actual}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diff.campos_cambiados.map((c) => (
                        <TableRow key={c.campo}>
                          <TableCell className="text-xs font-medium text-corp-900">{c.campo}</TableCell>
                          <TableCell className="text-xs text-rose-700">{c.anterior ?? <em className="text-slate-400">vacío</em>}</TableCell>
                          <TableCell className="text-xs text-emerald-700">{c.actual ?? <em className="text-slate-400">vacío</em>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}

              {diff.medidas_cambiadas.length > 0 && (
                <Card className="p-0">
                  <div className="border-b border-slate-100 p-3">
                    <h4 className="font-display text-sm font-semibold text-corp-900">
                      Medidas modificadas ({diff.medidas_cambiadas.length})
                    </h4>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Cód</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="w-16">Talla</TableHead>
                        <TableHead className="w-20 text-right">Rev. {diff.rev_anterior}</TableHead>
                        <TableHead className="w-20 text-right">Rev. {diff.rev_actual}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diff.medidas_cambiadas.flatMap((m) =>
                        m.cambios.map((c, idx) => (
                          <TableRow key={`${m.codigo}-${c.talla}`}>
                            {idx === 0 && (
                              <>
                                <TableCell className="font-mono text-xs" rowSpan={m.cambios.length}>{m.codigo}</TableCell>
                                <TableCell className="text-xs" rowSpan={m.cambios.length}>{m.descripcion}</TableCell>
                              </>
                            )}
                            <TableCell className="text-xs">{c.talla}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-rose-700">{c.anterior ?? '—'}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-emerald-700">{c.actual ?? '—'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PRIMITIVOS
// ────────────────────────────────────────────────────────────────────────────
function SubTabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition ${
        active ? 'border-happy-500 text-happy-700' : 'border-transparent text-slate-500 hover:text-corp-900'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
