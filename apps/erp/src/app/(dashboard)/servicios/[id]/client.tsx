'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@happy/ui/button';
import { Input } from '@happy/ui/input';
import { Badge } from '@happy/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@happy/ui/table';
import { Loader2, ArrowRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cambiarEstadoOS, registrarRecepcionOS } from '@/server/actions/corte';

const FLOW: Record<string, string[]> = {
  EMITIDA: ['DESPACHADA','ANULADA'],
  DESPACHADA: ['EN_PROCESO'],
  EN_PROCESO: ['RECEPCIONADA'],
  RECEPCIONADA: ['CERRADA'],
};

export function OsTransitions({ osId, estado }: { osId: string; estado: string }) {
  const [pending, start] = useTransition();
  const next = FLOW[estado] ?? [];
  if (next.length === 0) return null;

  function go(nuevo: string) {
    if (!confirm(`¿Cambiar estado a ${nuevo.replace('_', ' ')}?`)) return;
    start(async () => {
      const r = await cambiarEstadoOS(osId, nuevo);
      if (r.ok) toast.success('Estado actualizado');
      else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {next.map((n) => (
        <Button
          key={n}
          variant={n === 'ANULADA' ? 'destructive' : n === 'CERRADA' || n === 'RECEPCIONADA' ? 'premium' : 'corp'}
          size="sm"
          onClick={() => go(n)}
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {n.replace('_', ' ')}
        </Button>
      ))}
    </div>
  );
}

/**
 * Editor de RECEPCIÓN de la OS (pedido del cliente 21/07/2026): fecha de
 * retorno + unidades aprobadas (recepcionadas) y falladas por línea. La OS
 * la trabaja un tercero (taller), así que acá solo se registra lo que vuelve.
 */
type LineaRecep = {
  id: string;
  producto_nombre: string;
  producto_codigo: string;
  talla: string;
  enviado: number;
  recepcionada: number;
  fallada: number;
};
export function RecepcionOSEditor({
  osId,
  fechaRetornoInicial,
  lineas,
  disabled,
}: {
  osId: string;
  fechaRetornoInicial: string;
  lineas: LineaRecep[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fechaRetorno, setFechaRetorno] = useState(
    fechaRetornoInicial || new Date().toISOString().slice(0, 10),
  );
  const [rows, setRows] = useState<LineaRecep[]>(lineas);

  function setVal(i: number, campo: 'recepcionada' | 'fallada', v: string) {
    const n = v === '' ? 0 : Math.max(0, Math.floor(Number(v)));
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [campo]: Number.isFinite(n) ? n : 0 } : r)));
  }
  function completarTodo() {
    // Marca todo lo enviado como recepcionado (aprobado), fallas en 0.
    setRows((prev) => prev.map((r) => ({ ...r, recepcionada: r.enviado, fallada: 0 })));
  }

  const totalRecep = rows.reduce((s, r) => s + r.recepcionada, 0);
  const totalFall = rows.reduce((s, r) => s + r.fallada, 0);
  const totalEnv = rows.reduce((s, r) => s + r.enviado, 0);
  const excede = rows.some((r) => r.recepcionada + r.fallada > r.enviado);

  function guardar() {
    if (excede) return toast.error('Recepcionadas + falladas no puede superar lo enviado.');
    start(async () => {
      const r = await registrarRecepcionOS(
        osId,
        fechaRetorno,
        rows.map((x) => ({ id: x.id, recepcionada: x.recepcionada, fallada: x.fallada })),
      );
      if (r.ok) {
        toast.success('Recepción registrada — OS marcada como RECEPCIONADA');
        router.refresh();
      } else toast.error(r.error ?? 'Error');
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border-b p-4">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha de retorno</label>
          <Input
            type="date"
            value={fechaRetorno}
            onChange={(e) => setFechaRetorno(e.target.value)}
            disabled={disabled || pending}
            className="mt-1 h-9 w-40 text-sm"
          />
        </div>
        {!disabled && (
          <Button variant="outline" size="sm" onClick={completarTodo} disabled={pending} className="text-xs">
            Todo recepcionado OK
          </Button>
        )}
        <div className="ml-auto text-right text-xs text-slate-500">
          Enviado {totalEnv} · <span className="text-emerald-600">Recep. {totalRecep}</span> · <span className="text-amber-600">Fallas {totalFall}</span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Talla</TableHead>
            <TableHead className="text-right">Enviado</TableHead>
            <TableHead className="text-right">Aprobadas (recep.)</TableHead>
            <TableHead className="text-right">Falladas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((l, i) => {
            const filaExcede = l.recepcionada + l.fallada > l.enviado;
            return (
              <TableRow key={l.id}>
                <TableCell className="font-medium">
                  {l.producto_nombre}
                  {l.producto_codigo && <span className="ml-2 font-mono text-[10px] text-slate-400">{l.producto_codigo}</span>}
                </TableCell>
                <TableCell><Badge variant="outline">{l.talla.replace('T', '')}</Badge></TableCell>
                <TableCell className="text-right font-mono text-sm">{l.enviado}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={l.enviado}
                    value={l.recepcionada || ''}
                    onChange={(e) => setVal(i, 'recepcionada', e.target.value)}
                    disabled={disabled || pending}
                    className={`ml-auto h-8 w-20 text-right text-xs ${filaExcede ? 'border-danger bg-red-50' : ''}`}
                    placeholder="0"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={l.enviado}
                    value={l.fallada || ''}
                    onChange={(e) => setVal(i, 'fallada', e.target.value)}
                    disabled={disabled || pending}
                    className={`ml-auto h-8 w-20 text-right text-xs ${filaExcede ? 'border-danger bg-red-50' : ''}`}
                    placeholder="0"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {!disabled && (
        <div className="flex justify-end p-4">
          <Button variant="premium" size="sm" onClick={guardar} disabled={pending || excede}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Registrar recepción
          </Button>
        </div>
      )}
    </div>
  );
}
