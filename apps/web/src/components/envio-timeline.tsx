import { ShoppingBag, Truck, MapPin, Timer } from 'lucide-react';

function fmt(d: Date) {
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }).replace('.', '');
}

export function EnvioTimeline() {
  const hoy = new Date();
  const enProceso = new Date(hoy);
  enProceso.setDate(hoy.getDate() + 1);
  const entregaDesde = new Date(hoy);
  entregaDesde.setDate(hoy.getDate() + 2);
  const entregaHasta = new Date(hoy);
  entregaHasta.setDate(hoy.getDate() + 4);

  const cutoff = new Date();
  cutoff.setHours(15, 0, 0, 0); // corte 3 PM
  const ahora = new Date();
  const aplica = ahora < cutoff;

  return (
    <div className="space-y-3">
      {aplica && (
        <p className="flex items-center gap-2 text-sm text-corp-900">
          <Timer className="h-4 w-4 text-happy-500" />
          <span>
            Ordena hoy antes de las <strong>3:00 PM</strong> y recibe tu pedido entre el{' '}
            <strong>{fmt(entregaDesde)}</strong> y el <strong>{fmt(entregaHasta)}</strong>
          </span>
        </p>
      )}
      <div className="rounded-xl border bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-2">
          <Step icon={<ShoppingBag className="h-4 w-4" />} label="Pedido realizado" date={fmt(hoy)} active />
          <Line />
          <Step icon={<Truck className="h-4 w-4" />} label="En proceso" date={fmt(enProceso)} active />
          <Line />
          <Step
            icon={<MapPin className="h-4 w-4" />}
            label="Entregado"
            date={`${fmt(entregaDesde)} - ${fmt(entregaHasta).split(' ')[0]}`}
            active={false}
          />
        </div>
      </div>
    </div>
  );
}

function Step({ icon, label, date, active }: { icon: React.ReactNode; label: string; date: string; active: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${
          active ? 'border-happy-500 bg-happy-500 text-white' : 'border-slate-300 bg-white text-slate-400'
        }`}
      >
        {icon}
      </div>
      <p className={`text-[10px] font-medium leading-tight ${active ? 'text-corp-900' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className="text-[10px] text-slate-500">{date}</p>
    </div>
  );
}

function Line() {
  return <div className="h-0.5 flex-1 bg-slate-300" />;
}
