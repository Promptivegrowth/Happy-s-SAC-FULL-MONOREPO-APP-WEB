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

export function OtAcciones({ otId, estado, almacenes }: {
  otId: string;
  estado: string;
  almacenes: { id: string; nombre: string; codigo: string }[];
}) {
  const [pending, start] = useTransition();
  const [showCierre, setShowCierre] = useState(false);
  const [almacenSel, setAlmacenSel] = useState(almacenes[0]?.id ?? '');

  const next = FLOW[estado] ?? [];

  function transicion(nuevo: string) {
    if (!confirm(`¿Cambiar estado a ${nuevo.replace('_',' ')}?`)) return;
    start(async () => {
      const r = await cambiarEstadoOT(otId, nuevo as Parameters<typeof cambiarEstadoOT>[1]);
      if (r.ok) toast.success('Estado actualizado');
      else toast.error(r.error ?? 'Error');
    });
  }

  function cerrar() {
    if (!almacenSel) return toast.error('Selecciona almacén destino');
    start(async () => {
      const r = await cerrarOT(otId, almacenSel);
      if (r.ok && r.data) {
        toast.success(`OT cerrada · ${r.data.lotes} lote(s) PT generados`);
        setShowCierre(false);
      } else toast.error(r.error ?? 'Error');
    });
  }

  if (estado === 'COMPLETADA' || estado === 'CANCELADA') return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado === 'EN_CONTROL_CALIDAD' ? (
        showCierre ? (
          <div className="flex items-center gap-2 rounded-lg border bg-white p-2">
            <select value={almacenSel} onChange={(e) => setAlmacenSel(e.target.value)} className="h-9 rounded-md border bg-white px-2 text-sm">
              {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <Button variant="premium" size="sm" onClick={cerrar} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar cierre
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCierre(false)}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <Button variant="premium" onClick={() => setShowCierre(true)} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" /> Cerrar OT (declarar PT)
          </Button>
        )
      ) : (
        next.map((n) => (
          <Button
            key={n}
            variant={n === 'CANCELADA' ? 'destructive' : 'corp'}
            size="sm"
            onClick={() => transicion(n)}
            disabled={pending}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {n.replace('_', ' ')}
          </Button>
        ))
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

export function OtLineaProduccion({ otId, lineaId, planificada, cortada, fallas, disabled }: {
  otId: string; lineaId: string; planificada: number; cortada: number; fallas: number; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  // El campo es ACUMULADO (no incremento). Pre-popular con el plan sugiere
  // "completar todo": el usuario solo modifica si no completó. Si ya está
  // todo cortado, se mantiene cortada (no fuerza overshoot).
  const sugerido = Math.max(planificada, cortada);
  const [c, setC] = useState(sugerido);
  const [f, setF] = useState(fallas);

  function save() {
    // Se permite cortar más del plan (extras). Solo validamos que las fallas
    // no superen lo cortado (no podés tener más fallas que unidades).
    if (f > c) {
      return toast.error('Fallas no pueden superar cortadas');
    }
    if (c > planificada) {
      // Aviso suave, no bloqueo.
      toast.warning(`Cortando ${c} extras (plan ${planificada}). Se guarda igual.`);
    }
    start(async () => {
      const r = await declararProduccion(otId, lineaId, c, f);
      if (r.ok) {
        toast.success('Producción declarada');
        setOpen(false);
      } else toast.error(r.error ?? 'Error');
    });
  }

  if (disabled) return <span className="text-xs text-slate-400">—</span>;

  if (!open) {
    return <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Editar</Button>;
  }

  const faltaCortar = Math.max(planificada - cortada, 0);
  return (
    <div className="flex items-end gap-1">
      <div className="flex flex-col">
        <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Cortado</label>
        <Input
          type="number"
          value={c}
          onChange={(e) => setC(Number(e.target.value))}
          min={0}
          className="h-8 w-16 text-xs"
          placeholder="0"
          title={`Acumulado. Plan ${planificada}. Falta cortar ${faltaCortar}. Se permiten extras.`}
          autoFocus
        />
      </div>
      <div className="flex flex-col">
        <label className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Fallas</label>
        <Input
          type="number"
          value={f}
          onChange={(e) => setF(Number(e.target.value))}
          min={0}
          max={c}
          className="h-8 w-14 text-xs"
          placeholder="0"
          title="Unidades descartadas (acumulado)"
        />
      </div>
      <Button variant="premium" size="sm" onClick={save} disabled={pending} className="h-8 px-2" title="Guardar">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => { setC(cortada); setF(fallas); setOpen(false); }} className="h-8 px-1" title="Cancelar"><X className="h-3 w-3" /></Button>
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
