import { Truck } from 'lucide-react';
import type { EstadoImportacion } from '@/server/actions/importaciones';

export function EstadoBadge({ estado }: { estado: EstadoImportacion }) {
  const cfg: Record<EstadoImportacion, { label: string; className: string }> = {
    PREPARACION: { label: 'PREPARACIÓN', className: 'bg-slate-100 text-slate-700' },
    EN_TRANSITO: { label: 'EN TRÁNSITO', className: 'bg-blue-100 text-blue-700' },
    EN_ADUANAS: { label: 'EN ADUANAS', className: 'bg-amber-100 text-amber-800' },
    LIBERADA: { label: 'LIBERADA', className: 'bg-cyan-100 text-cyan-800' },
    RECIBIDA: { label: 'RECIBIDA', className: 'bg-emerald-100 text-emerald-800' },
    CANCELADA: { label: 'CANCELADA', className: 'bg-rose-100 text-rose-700' },
  };
  const c = cfg[estado] ?? cfg.PREPARACION;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-transparent px-2.5 py-0.5 text-[10px] font-semibold ${c.className}`}
    >
      <Truck className="h-3 w-3" />
      {c.label}
    </span>
  );
}
