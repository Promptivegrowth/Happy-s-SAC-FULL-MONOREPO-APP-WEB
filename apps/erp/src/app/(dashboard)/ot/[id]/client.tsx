'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Loader2, ArrowRight, CheckCircle2, X, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  cambiarEstadoOT,
  agregarNotaOT,
  declararProduccion,
  cerrarOT,
  contarProcesosPendientesOT,
  agregarLineaOT,
  eliminarLineaOT,
} from '@/server/actions/ot';

const FLOW: Record<string, string[]> = {
  BORRADOR: ['PLANIFICADA','CANCELADA'],
  PLANIFICADA: ['EN_CORTE','CANCELADA'],
  EN_CORTE: ['EN_HABILITADO','EN_SERVICIO'],
  EN_HABILITADO: ['EN_SERVICIO'],
  EN_SERVICIO: ['EN_DECORADO','EN_CONTROL_CALIDAD'],
  EN_DECORADO: ['EN_CONTROL_CALIDAD'],
  EN_CONTROL_CALIDAD: ['COMPLETADA'],
};

/**
 * Áreas de la receta del producto que habilitan cada estado siguiente.
 * - Estados omitidos (EN_HABILITADO, EN_CONTROL_CALIDAD, COMPLETADA, CANCELADA)
 *   se muestran siempre (opcionales o transversales).
 * - Caso edge: si la receta no tiene operaciones (áreas vacío), mostramos
 *   todos los botones del FLOW (fallback seguro).
 */
const ESTADO_REQUIERE_AREAS: Record<string, string[]> = {
  EN_CORTE: ['CORTE'],
  EN_SERVICIO: ['CONFECCIÓN', 'CONFECCION', 'COSTURA', 'TALLER'],
  EN_DECORADO: ['BORDADO', 'ESTAMPADO', 'SUBLIMADO', 'DECORADO', 'PLISADO'],
};

function filtrarTransiciones(allNext: string[], areas: string[]): string[] {
  if (areas.length === 0) return allNext;
  return allNext.filter((estado) => {
    const reqs = ESTADO_REQUIERE_AREAS[estado];
    if (!reqs) return true;
    return reqs.some((a) => areas.includes(a));
  });
}

export function OtAcciones({ otId, estado, almacenes, areasReceta = [], usuarioEsGerente = false, avanceBloqueo = null }: {
  otId: string;
  estado: string;
  almacenes: { id: string; nombre: string; codigo: string }[];
  /** Códigos de área presentes en la receta del producto de la OT. */
  areasReceta?: string[];
  /** Solo gerencia puede forzar el cierre con operaciones sin declarar. */
  usuarioEsGerente?: boolean;
  /** Si hay operaciones del área actual sin declarar, se bloquea el avance. */
  avanceBloqueo?: { nombre: string; pendientes: number; total: number } | null;
}) {
  const [pending, start] = useTransition();
  const [showCierre, setShowCierre] = useState(false);
  const [almacenSel, setAlmacenSel] = useState(almacenes[0]?.id ?? '');
  // Operaciones sin declarar detectadas al intentar cerrar (bloquea el cierre).
  const [pendientes, setPendientes] = useState<{ n: number; resumen: string } | null>(null);

  const next = filtrarTransiciones(FLOW[estado] ?? [], areasReceta);

  function transicion(nuevo: string) {
    // Bloqueo de avance: no dejar pasar de proceso si el área actual tiene
    // operaciones sin declarar (CANCELAR siempre permitido).
    if (avanceBloqueo && nuevo !== 'CANCELADA') {
      toast.error(
        `No se puede avanzar: faltan declarar ${avanceBloqueo.pendientes} de ${avanceBloqueo.total} operación(es) del área ${avanceBloqueo.nombre}. Regístrelas en "Tiempos & costo MO".`,
        { duration: 8000 },
      );
      return;
    }
    if (!confirm(`¿Cambiar estado a ${nuevo.replace('_',' ')}?`)) return;
    start(async () => {
      const r = await cambiarEstadoOT(otId, nuevo as Parameters<typeof cambiarEstadoOT>[1]);
      if (r.ok) toast.success('Estado actualizado');
      else toast.error(r.error ?? 'Error');
    });
  }

  function cerrar(forzar = false) {
    if (!almacenSel) return toast.error('Seleccione almacén destino');
    start(async () => {
      // Chequeo previo: ¿faltan operaciones por declarar? (pedido 21/07/2026)
      if (!forzar) {
        const chk = await contarProcesosPendientesOT(otId);
        if (chk.pendientes > 0) {
          setPendientes({ n: chk.pendientes, resumen: chk.resumen });
          if (!usuarioEsGerente) {
            toast.error(
              `Faltan declarar ${chk.pendientes} operación(es) (${chk.resumen}). Regístrelas en "Tiempos & costo MO".`,
              { duration: 8000 },
            );
            return;
          }
          // Gerente: se muestra el botón "Cerrar de todos modos" (no cerramos aún)
          return;
        }
      }
      const r = await cerrarOT(otId, almacenSel, forzar);
      if (r.ok && r.data) {
        toast.success(`OT cerrada · ${r.data.lotes} lote(s) PT generados`);
        setShowCierre(false);
        setPendientes(null);
      } else toast.error(r.error ?? 'Error');
    });
  }

  if (estado === 'COMPLETADA' || estado === 'CANCELADA') return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado === 'EN_CONTROL_CALIDAD' ? (
        showCierre ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-white p-2">
            <div className="flex items-center gap-2">
              {almacenes.length === 1 ? (
                // 1 solo almacén PT — no mostrar dropdown, solo confirmar
                <span className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  → {almacenes[0]!.nombre}
                </span>
              ) : (
                <select value={almacenSel} onChange={(e) => setAlmacenSel(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              )}
              <Button variant="premium" size="sm" onClick={() => cerrar(false)} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirmar cierre
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowCierre(false); setPendientes(null); }}><X className="h-4 w-4" /></Button>
            </div>
            {pendientes && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                <p>
                  <strong>Faltan declarar {pendientes.n} operación(es):</strong> {pendientes.resumen}.
                  Regístrelas en la pestaña <strong>Tiempos &amp; costo MO</strong> antes de cerrar.
                </p>
                {usuarioEsGerente && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Como gerente, ¿cerrar la OT con ${pendientes.n} operación(es) sin declarar? Quedará registrado en la bitácora.`)) {
                        cerrar(true);
                      }
                    }}
                    disabled={pending}
                    className="mt-2"
                  >
                    Cerrar de todos modos (gerencia)
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <Button variant="premium" onClick={() => setShowCierre(true)} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" />
            {almacenes.length === 1
              ? `Cerrar OT (entra a ${almacenes[0]!.codigo})`
              : 'Cerrar OT (declarar PT)'}
          </Button>
        )
      ) : (
        <div className="flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {next.map((n) => {
              const bloqueado = !!avanceBloqueo && n !== 'CANCELADA';
              return (
                <Button
                  key={n}
                  variant={n === 'CANCELADA' ? 'destructive' : 'corp'}
                  size="sm"
                  onClick={() => transicion(n)}
                  disabled={pending || bloqueado}
                  title={bloqueado ? `Faltan declarar ${avanceBloqueo!.pendientes} de ${avanceBloqueo!.total} operación(es) del área ${avanceBloqueo!.nombre}` : undefined}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {n.replace('_', ' ')}
                </Button>
              );
            })}
          </div>
          {avanceBloqueo && (
            <p className="max-w-xs text-right text-[11px] text-amber-700">
              Para avanzar, declare los tiempos del área <strong>{avanceBloqueo.nombre}</strong> ({avanceBloqueo.pendientes} de {avanceBloqueo.total} pendientes).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function OtNotaForm({ otId }: { otId: string }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState('');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return;
    const fd = new FormData();
    fd.append('detalle', text);
    start(async () => {
      const r = await agregarNotaOT(otId, fd);
      if (r.ok) {
        toast.success('Nota agregada');
        setText('');
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <form onSubmit={submit} className="rounded-lg border bg-happy-50/30 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Agregar nota al timeline (consideraciones, anomalías, observaciones)…"
        rows={2}
        className="border-0 bg-transparent focus-visible:ring-0"
      />
      <div className="flex justify-end">
        <Button type="submit" variant="premium" size="sm" disabled={pending || !text.trim()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Agregar nota
        </Button>
      </div>
    </form>
  );
}

export function OtLineaProduccion({ otId, lineaId, cortada, fallas, disabled }: {
  otId: string; lineaId: string; planificada: number; cortada: number; fallas: number; disabled: boolean;
  /** @deprecated ya no se usa — la cantidad cortada no se edita en la OT. */
  usuarioEsGerente?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState(fallas);

  // La cantidad cortada VIENE del módulo Corte y no se edita en la OT
  // (pedido del cliente 21/07/2026: la restricción/ajuste vive en la orden
  // de corte). En la OT solo se declaran las FALLAS.
  function save() {
    if (f > cortada) {
      return toast.error('Las fallas no pueden superar lo cortado');
    }
    start(async () => {
      // Reenvía la cortada SIN cambios (solo actualiza fallas). Al ser igual
      // a lo guardado, el server no pide ninguna autorización.
      const r = await declararProduccion(otId, lineaId, cortada, f);
      if (r.ok) {
        toast.success('Guardado');
        setOpen(false);
      } else toast.error(r.error ?? 'Error');
    });
  }

  if (disabled) return <span className="text-xs text-slate-400">—</span>;

  if (!open) {
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Editar</Button>;
  }

  return (
    <div className="flex items-end gap-1">
      <div className="flex flex-col">
        <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
          Cortado <span className="text-slate-400">(del Corte)</span>
        </label>
        <div
          className="flex h-8 w-16 items-center justify-center rounded-md border bg-slate-100 text-xs font-semibold text-slate-600"
          title="La cantidad cortada se declara en la orden de Corte y se refleja acá al cerrar el corte."
        >
          {cortada}
        </div>
      </div>
      <div className="flex flex-col">
        <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Fallas</label>
        <Input
          type="number"
          value={f}
          onChange={(e) => setF(Number(e.target.value))}
          min={0}
          max={cortada}
          className="h-8 w-14 text-xs"
          placeholder="0"
          title="Unidades descartadas (acumulado)"
          autoFocus
        />
      </div>
      <Button variant="premium" size="sm" onClick={save} disabled={pending} className="h-8 px-2" title="Guardar fallas">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setF(fallas); setOpen(false); }} className="h-8 px-1" title="Cancelar"><X className="h-3 w-3" /></Button>
    </div>
  );
}

const TALLAS_OPCIONES = ['T0','T2','T4','T6','T8','T10','T12','T14','T16','TS','TAD'] as const;

type ProductoOpcion = { id: string; codigo: string; nombre: string };

export function AgregarLineaOTForm({
  otId,
  productos,
  productoIdDefault,
}: {
  otId: string;
  productos: ProductoOpcion[];
  /** Producto a pre-seleccionar (típicamente el único producto que ya está en la OT). */
  productoIdDefault?: string;
}) {
  const [pending, start] = useTransition();
  const [productoId, setProductoId] = useState(productoIdDefault ?? '');
  const [talla, setTalla] = useState<(typeof TALLAS_OPCIONES)[number]>('T8');
  const [cantidad, setCantidad] = useState<number>(1);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!productoId) return toast.error('Selecciona un producto');
    if (cantidad < 1) return toast.error('La cantidad debe ser ≥ 1');

    const fd = new FormData();
    fd.append('producto_id', productoId);
    fd.append('talla', talla);
    fd.append('cantidad_planificada', String(cantidad));

    start(async () => {
      const r = await agregarLineaOT(otId, null, fd);
      if (r.ok) {
        toast.success('Línea agregada');
        // Mantener el producto seleccionado si fue el default (típicamente OT
        // mono-producto). Esto deja al usuario en condiciones de seguir
        // agregando tallas sin volver a elegir el producto.
        if (!productoIdDefault) setProductoId('');
        setCantidad(1);
      } else {
        toast.error(r.error ?? 'Error al agregar línea');
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-happy-300 bg-happy-50/30 p-3"
    >
      <div className="flex-1 min-w-[220px]">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Producto
        </label>
        {productoIdDefault ? (
          // OT ya tiene un producto: lo fijamos (regla del cliente: una OT =
          // un solo producto). Para producir otro producto, se crea una OT
          // separada del mismo plan.
          (() => {
            const fijo = productos.find((p) => p.id === productoIdDefault);
            return (
              <>
                <input type="hidden" name="producto_id" value={productoIdDefault} />
                <div
                  className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700"
                  title="Una OT corresponde a un solo producto. Para otro producto, generá una OT separada."
                >
                  <span className="font-mono text-[10px] text-slate-400">{fijo?.codigo ?? '?'}</span>
                  <span className="font-medium">{fijo?.nombre ?? 'Producto fijo'}</span>
                  <span className="ml-auto rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-600">fijo</span>
                </div>
              </>
            );
          })()
        ) : (
          <select
            name="producto_id"
            value={productoId}
            onChange={(e) => setProductoId(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-white px-2 text-sm"
            required
          >
            <option value="">— Seleccionar producto —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} · {p.nombre}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Talla
        </label>
        <select
          value={talla}
          onChange={(e) => setTalla(e.target.value as (typeof TALLAS_OPCIONES)[number])}
          className="h-9 w-20 rounded-md border border-input bg-white px-2 text-sm"
        >
          {TALLAS_OPCIONES.map((t) => (
            <option key={t} value={t}>{t.replace('T', '')}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Cantidad
        </label>
        <Input
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
          className="h-9 w-24"
          required
        />
      </div>
      <Button type="submit" variant="premium" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Agregar
      </Button>
    </form>
  );
}

export function EliminarLineaOT({ otId, lineaId, disabled }: { otId: string; lineaId: string; disabled: boolean }) {
  const [pending, start] = useTransition();

  function submit() {
    if (!confirm('¿Eliminar esta línea de la OT?')) return;
    start(async () => {
      const r = await eliminarLineaOT(otId, lineaId);
      if (r.ok) toast.success('Línea eliminada');
      else toast.error(r.error ?? 'Error');
    });
  }

  if (disabled) return null;
  return (
    <Button variant="ghost" size="sm" onClick={submit} disabled={pending} className="h-8 w-8 p-0 text-slate-400 hover:text-danger">
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
    </Button>
  );
}
