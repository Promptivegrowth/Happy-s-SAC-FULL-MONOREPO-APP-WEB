'use client';

import { useEffect, useRef, useState } from 'react';
import { Truck, ShieldCheck, Sparkles, Heart, type LucideIcon } from 'lucide-react';

type Stat = {
  icon: LucideIcon;
  /** Color del icono — gradiente del badge */
  accent: string;
  /** Color del número (debe contrastar con fondo blanco) */
  numberColor: string;
  /** Si es número, se anima de 0 al valor; si es string, se renderiza fijo */
  value: number | string;
  prefix?: string;
  suffix?: string;
  /** Permite formatear el contador (ej. "30 mil" en vez de "30,000") */
  formatter?: (n: number) => string;
  label: string;
};

const STATS: Stat[] = [
  {
    icon: Truck,
    accent: 'from-happy-500 to-happy-600',
    numberColor: 'text-happy-600',
    value: '2-3',
    suffix: ' días',
    label: 'Envío en Lima',
  },
  {
    icon: ShieldCheck,
    accent: 'from-emerald-500 to-emerald-600',
    numberColor: 'text-emerald-600',
    value: 100,
    suffix: '%',
    label: 'Yape · Plin · Tarjeta',
  },
  {
    icon: Sparkles,
    accent: 'from-corp-700 to-corp-900',
    numberColor: 'text-corp-900',
    value: 200,
    prefix: '+',
    suffix: ' modelos',
    label: '11 tallas disponibles',
  },
  {
    icon: Heart,
    accent: 'from-pink-500 to-rose-500',
    numberColor: 'text-rose-600',
    value: 30000,
    prefix: '+',
    formatter: (n) => `${Math.floor(n / 1000)} mil`,
    label: 'Familias felices',
  },
];

function useInView<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setInView(true);
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, threshold]);
  return { ref, inView };
}

function Counter({
  to,
  prefix = '',
  suffix = '',
  formatter,
  start,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  formatter?: (n: number) => string;
  start: boolean;
}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    const dur = 1800;
    let raf = 0;
    const tick = (t: number) => {
      const e = Math.min(1, (t - t0) / dur);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - e, 3);
      setN(Math.round(to * eased));
      if (e < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, to]);
  const display = formatter ? formatter(n) : n.toLocaleString('es-PE');
  return (
    <>
      {prefix}
      {display}
      {suffix}
    </>
  );
}

export function PremiumStats() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50/70 to-white py-14 sm:py-20">
      {/* Halos decorativos sutiles */}
      <div className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-happy-200/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-corp-200/25 blur-3xl" />

      <div ref={ref} className="container relative px-4">
        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-happy-300 hover:shadow-xl sm:p-7"
              style={{
                animation: inView
                  ? `stat-rise 700ms cubic-bezier(0.34,1.56,0.64,1) ${i * 100}ms both`
                  : undefined,
              }}
            >
              {/* Icono — badge con gradiente premium */}
              <div
                className={`mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${s.accent} text-white shadow-lg ring-1 ring-white/30 transition group-hover:scale-110 group-hover:rotate-[-4deg]`}
              >
                <s.icon className="h-7 w-7" strokeWidth={2.2} />
              </div>

              {/* Número grande */}
              <p
                className={`font-display text-3xl font-bold leading-none ${s.numberColor} sm:text-4xl lg:text-5xl`}
              >
                {typeof s.value === 'number' ? (
                  <Counter
                    to={s.value}
                    prefix={s.prefix}
                    suffix={s.suffix}
                    formatter={s.formatter}
                    start={inView}
                  />
                ) : (
                  <>
                    {s.prefix}
                    {s.value}
                    {s.suffix}
                  </>
                )}
              </p>

              {/* Label */}
              <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">{s.label}</p>

              {/* Línea inferior decorativa que se ilumina en hover */}
              <div
                className={`absolute bottom-0 left-0 h-1 w-0 bg-gradient-to-r ${s.accent} transition-all duration-500 group-hover:w-full`}
              />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes stat-rise {
          from { opacity: 0; transform: translateY(20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1);    }
        }
      `}</style>
    </section>
  );
}
