import { Card } from '@happy/ui/card';
import {
  ClipboardList, ShoppingCart, Scissors, Shirt, Sparkles, BadgeCheck, Warehouse, XCircle, Check,
  type LucideIcon,
} from 'lucide-react';

/**
 * Línea de tiempo visual del avance de una OT: en qué etapa está, desde
 * planificación → materiales → corte → confección/servicio → decorado →
 * control de calidad → envío a almacén (pedido cliente 2026-08-24).
 */

type Etapa = { label: string; icon: LucideIcon };
const ETAPAS: Etapa[] = [
  { label: 'Planificación', icon: ClipboardList },
  { label: 'Compra de materiales', icon: ShoppingCart },
  { label: 'Corte', icon: Scissors },
  { label: 'Confección / Servicio', icon: Shirt },
  { label: 'Decorado', icon: Sparkles },
  { label: 'Control de calidad', icon: BadgeCheck },
  { label: 'Enviado a almacén', icon: Warehouse },
];

// Índice de etapa según el estado de la OT. "Compra de materiales" (1) no es un
// estado propio: se marca cumplida cuando la OT ya pasó a corte.
const ESTADO_A_ETAPA: Record<string, number> = {
  BORRADOR: 0,
  PLANIFICADA: 0,
  EN_CORTE: 2,
  EN_HABILITADO: 2,
  EN_SERVICIO: 3,
  EN_DECORADO: 4,
  EN_CONTROL_CALIDAD: 5,
  COMPLETADA: 6,
};

export function OtTimeline({ estado }: { estado: string }) {
  const cancelada = estado === 'CANCELADA';
  const actual = ESTADO_A_ETAPA[estado] ?? 0;
  const completada = estado === 'COMPLETADA';

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
        <div className="flex min-w-[720px] items-start">
          {ETAPAS.map((et, i) => {
            const Icon = et.icon;
            const done = !cancelada && (completada || i < actual);
            const current = !cancelada && !completada && i === actual;
            const circle = cancelada
              ? 'border-slate-200 bg-slate-100 text-slate-400'
              : done
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : current
                  ? 'border-happy-500 bg-happy-50 text-happy-600 ring-4 ring-happy-100'
                  : 'border-slate-200 bg-white text-slate-300';
            const lineDone = !cancelada && (completada || i < actual);
            return (
              <div key={et.label} className="flex flex-1 flex-col items-center">
                <div className="flex w-full items-center">
                  {/* línea izquierda */}
                  <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : lineDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition ${circle}`}>
                    {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>
                  {/* línea derecha */}
                  <div className={`h-0.5 flex-1 ${i === ETAPAS.length - 1 ? 'opacity-0' : (!cancelada && (completada || i < actual)) ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                </div>
                <p className={`mt-1.5 max-w-[96px] text-center text-[11px] leading-tight ${current ? 'font-semibold text-happy-700' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {et.label}
                </p>
                {current && <span className="mt-0.5 rounded-full bg-happy-100 px-1.5 text-[9px] font-semibold uppercase text-happy-700">Aquí</span>}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
