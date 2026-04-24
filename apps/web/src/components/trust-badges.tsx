import { ShieldCheck } from 'lucide-react';

const PAGOS = [
  { name: 'Visa', label: 'VISA', bg: 'bg-white', text: 'text-blue-700' },
  { name: 'Mastercard', label: 'MC', bg: 'bg-white', text: 'text-red-600' },
  { name: 'American Express', label: 'AMEX', bg: 'bg-white', text: 'text-blue-900' },
  { name: 'Yape', label: 'Yape', bg: 'bg-purple-600', text: 'text-white' },
  { name: 'Plin', label: 'Plin', bg: 'bg-blue-600', text: 'text-white' },
  { name: 'Pago Efectivo', label: 'PE', bg: 'bg-yellow-400', text: 'text-corp-900' },
];

export function TrustBadges() {
  return (
    <div className="rounded-xl border-2 border-corp-200 bg-gradient-to-br from-corp-50 to-happy-50 p-4">
      <div className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-corp-900">
        <ShieldCheck className="h-4 w-4 text-corp-700" /> Pago 100% Seguro
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
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
