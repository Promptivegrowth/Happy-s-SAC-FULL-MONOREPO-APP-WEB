'use client';

import { useState, useTransition } from 'react';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Textarea } from '@happy/ui/textarea';
import { Loader2, ArrowRight, CheckCircle2, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cambiarEstadoOT, agregarNotaOT, declararProduccion, cerrarOT } from '@/server/actions/ot';

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

export function OtLineaProduccion({ otId, lineaId, cortada, fallas, disabled }: {
  otId: string; lineaId: string; cortada: number; fallas: number; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [c, setC] = useState(cortada);
  const [f, setF] = useState(fallas);

  function save() {
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

  return (
    <div className="flex items-center gap-1">
      <Input type="number" value={c} onChange={(e) => setC(Number(e.target.value))} min={0} className="h-8 w-16 text-xs" placeholder="Cort." />
      <Input type="number" value={f} onChange={(e) => setF(Number(e.target.value))} min={0} className="h-8 w-14 text-xs" placeholder="Fall." />
      <Button variant="premium" size="sm" onClick={save} disabled={pending} className="h-8 px-2">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 px-1"><X className="h-3 w-3" /></Button>
    </div>
  );
}
