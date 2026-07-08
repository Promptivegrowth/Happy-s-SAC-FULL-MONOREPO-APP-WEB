'use client';

import { useState, useTransition } from 'react';
import { Input } from '@happy/ui/input';
import { Check, Loader2 } from 'lucide-react';
import { actualizarUmbralAlmacen } from '@/server/actions/almacenes-config';

export function UmbralInput({
  id,
  valorInicial,
  deshabilitado,
}: {
  id: string;
  valorInicial: number;
  deshabilitado?: boolean;
}) {
  const [valor, setValor] = useState(String(valorInicial));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function guardar() {
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) { setErr('Debe ser un número ≥ 0'); return; }
    if (num === valorInicial) return;
    setErr(null);
    start(async () => {
      try {
        await actualizarUmbralAlmacen({ id, stock_minimo_default: num });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <Input
        type="number"
        min={0}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        disabled={deshabilitado || pending}
        className="h-8 w-20 text-right font-mono text-sm"
      />
      {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {saved && <Check className="h-4 w-4 text-emerald-500" />}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
