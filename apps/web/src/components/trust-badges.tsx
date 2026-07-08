import { ShieldCheck } from 'lucide-react';

// Cliente pidió (post-2026-07-08) simplificar a solo 4 medios reales:
// Yape, Plin, Transferencia, Tarjeta. Se quitaron VISA/MC/AMEX/PE que
// duplicaban visualmente lo que "Tarjeta" ya cubre.
const PAGOS = [
  { name: 'Yape', label: 'Yape', bg: 'bg-purple-600', text: 'text-white' },
  { name: 'Plin', label: 'Plin', bg: 'bg-blue-600', text: 'text-white' },
  { name: 'Transferencia', label: 'Transferencia', bg: 'bg-emerald-600', text: 'text-white' },
  { name: 'Tarjeta', label: 'Tarjeta', bg: 'bg-slate-800', text: 'text-white' },
];

export function TrustBadges() {
  return (
    <div className="rounded-xl border-2 border-corp-200 bg-gradient-to-br from-corp-50 to-happy-50 p-4">
      <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-corp-900">
        <ShieldCheck className="h-4 w-4 text-corp-700" /> Pago 100% Seguro
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAGOS.map((p) => (
          <div
            key={p.name}
            className={`flex h-10 items-center justify-center rounded-md border ${p.bg} ${p.text} text-xs font-bold shadow-sm`}
            title={p.name}
          >
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}
