'use client';

import { useTransition, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Calendar, Loader2 } from 'lucide-react';
import { PERIODOS, type PeriodoKey } from '@/server/actions/dashboard-helpers';

export function PeriodoSelector({ current }: { current: PeriodoKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [openCustom, setOpenCustom] = useState(false);
  const [desde, setDesde] = useState(sp.get('desde') ?? '');
  const [hasta, setHasta] = useState(sp.get('hasta') ?? '');

  function pick(p: PeriodoKey) {
    const params = new URLSearchParams();
    params.set('p', p);
    if (p === 'custom' && desde && hasta) {
      params.set('desde', desde);
      params.set('hasta', hasta);
    }
    start(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  function applyCustom() {
    if (!desde || !hasta) return;
    const params = new URLSearchParams();
    params.set('p', 'custom');
    params.set('desde', desde);
    params.set('hasta', hasta);
    setOpenCustom(false);
    start(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODOS.map((p) => {
        const active = current === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => pick(p.key)}
            className={[
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
              active
                ? 'bg-happy-500 text-white shadow-sm shadow-happy-500/30'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-happy-300 hover:text-happy-600',
            ].join(' ')}
            disabled={pending}
          >
            {p.label}
          </button>
        );
      })}

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenCustom((o) => !o)}
          className={[
            'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition',
            current === 'custom'
              ? 'bg-corp-700 text-white shadow-sm shadow-corp-700/30'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-corp-300 hover:text-corp-700',
          ].join(' ')}
          disabled={pending}
        >
          <Calendar className="h-3.5 w-3.5" />
          {current === 'custom' && desde && hasta ? `${desde} → ${hasta}` : 'Custom'}
        </button>

        {openCustom && (
          <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs font-medium text-slate-600">Rango personalizado</p>
            <div className="space-y-2">
              <label className="block text-[11px] text-slate-500">
                Desde
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-happy-500 focus:outline-none"
                />
              </label>
              <label className="block text-[11px] text-slate-500">
                Hasta
                <input
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-happy-500 focus:outline-none"
                />
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpenCustom(false)}
                  className="rounded-md px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!desde || !hasta}
                  className="rounded-md bg-happy-500 px-3 py-1 text-xs font-medium text-white hover:bg-happy-600 disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
    </div>
  );
}
