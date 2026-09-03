import { Card } from '@happy/ui/card';
import {
  ClipboardList, Scissors, Shirt, Sparkles, BadgeCheck, Warehouse, Layers, Scan, Brush,
  XCircle, Check, Circle, type LucideIcon,
} from 'lucide-react';

/**
 * Línea de tiempo del avance de una OT. Ahora es DINÁMICA (pedido cliente
 * 2026-09-02): las etapas reflejan la SECUENCIA REAL de áreas de los procesos
 * del/los producto(s) de la OT (derivada de productos_procesos.orden), no una
 * lista genérica fija. Cada producto puede tener su propia secuencia.
 *
 * Las etapas y su estado (done/current/pending) se calculan en el server
 * (page.tsx) a partir del corte declarado, los registros de tiempo y las OS
 * retornadas. Aquí solo se renderiza.
 */

export type EtapaTimeline = {
  label: string;
  /** Código de área (CORTE, COSTURA, BORDADO, …) o pseudo-etapa (__PLAN__, __ALM__). */
  codigo: string;
  estado: 'done' | 'current' | 'pending';
  fecha: string | null;
};

const ICON_AREA: Record<string, LucideIcon> = {
  __PLAN__: ClipboardList,
  CORTE: Scissors,
  COSTURA: Shirt,
  CONFECCION: Shirt,
  BORDADO: Sparkles,
  ESTAMPADO: Scan,
  SUBLIMADO: Scan,
  DECORADO: Sparkles,
  PLISADO: Layers,
  ACABADO: BadgeCheck,
  PLANCHADO: Brush,
  CONTROL_CALIDAD: BadgeCheck,
  __ALM__: Warehouse,
};

function fmtFecha(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function OtTimeline({ etapas, cancelada = false }: { etapas: EtapaTimeline[]; cancelada?: boolean }) {
  const minW = Math.max(720, etapas.length * 108);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-corp-900">Avance de la orden</h3>
        {cancelada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700">
            <XCircle className="h-3.5 w-3.5" /> Cancelada
          </span>
        )}
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex items-start" style={{ minWidth: `${minW}px` }}>
          {etapas.map((et, i) => {
            const Icon = ICON_AREA[et.codigo] ?? Circle;
            const done = !cancelada && et.estado === 'done';
            const current = !cancelada && et.estado === 'current';
            const circle = cancelada
              ? 'border-slate-200 bg-slate-100 text-slate-400'
              : done
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : current
                  ? 'border-happy-500 bg-happy-50 text-happy-600 ring-4 ring-happy-100'
                  : 'border-slate-200 bg-white text-slate-300';
            const lineDone = !cancelada && done;
            const prevDone = !cancelada && (etapas[i - 1]?.estado === 'done');
            return (
              <div key={`${et.codigo}-${i}`} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : prevDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition ${circle}`}>
                    {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  <div className={`h-0.5 flex-1 ${i === etapas.length - 1 ? 'opacity-0' : lineDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                </div>
                <p className={`mt-1.5 max-w-[100px] text-center text-[11px] capitalize leading-tight ${current ? 'font-semibold text-happy-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {et.label.toLowerCase()}
                </p>
                {fmtFecha(et.fecha) && (
                  <span className="mt-0.5 font-mono text-[10px] text-slate-500">{fmtFecha(et.fecha)}</span>
                )}
                {current && <span className="mt-0.5 rounded-full bg-happy-100 px-1.5 text-[9px] font-semibold uppercase text-happy-700">Aquí</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
