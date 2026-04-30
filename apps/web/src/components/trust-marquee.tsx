import { ShoppingBasket, Lock, Truck, Award, type LucideIcon } from 'lucide-react';

type TrustItem = {
  icon: LucideIcon;
  title: string;
  desc: string;
};

const TRUST: TrustItem[] = [
  { icon: ShoppingBasket, title: 'Compras Online', desc: 'Diferentes formas de pago seguro' },
  { icon: Lock, title: 'Compras Seguras', desc: 'Protegido contra infiltración de datos' },
  { icon: Truck, title: 'Delivery 24H', desc: 'Envíos a Lima y provincias' },
  { icon: Award, title: '100% Peruano', desc: 'Somos fabricantes — producto 100% peruano' },
];

/**
 * Sección de confianza con efecto marquesina (carrusel infinito).
 * Las cards se duplican en el track, animación CSS desplaza -50% para
 * hacer loop sin saltos. En hover sobre el contenedor, la animación
 * pausa. En hover sobre cada card, efecto premium (lift + shimmer).
 */
export function TrustMarquee() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-corp-900 via-corp-800 to-corp-900 py-14 sm:py-16">
      <div className="container mb-8 px-4 text-center sm:mb-10">
        <h2 className="font-display text-2xl font-semibold text-white sm:text-3xl lg:text-4xl">
          ¿Por qué confiar en Happy?
        </h2>
        <p className="mt-2 text-sm text-white/70 sm:text-base">
          Más de 30 mil familias respaldan nuestro servicio
        </p>
      </div>

      <div className="group/marquee relative">
        <div className="flex w-max gap-5 animate-trust-marquee group-hover/marquee:[animation-play-state:paused]">
          {[...TRUST, ...TRUST].map((t, i) => (
            <TrustCard key={i} item={t} />
          ))}
        </div>
        {/* Fade en los bordes para que las cards "entren" en escena */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-corp-900 to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-corp-900 to-transparent sm:w-24" />
      </div>

      <style>{`
        @keyframes trust-marquee {
          0%   { transform: translateX(0);    }
          100% { transform: translateX(-50%); }
        }
        .animate-trust-marquee {
          animation: trust-marquee 32s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-trust-marquee { animation: none; }
        }
      `}</style>
    </section>
  );
}

function TrustCard({ item }: { item: TrustItem }) {
  const Icon = item.icon;
  return (
    <div className="group/card relative flex w-72 shrink-0 items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-happy-500 via-happy-600 to-happy-700 p-5 shadow-lg ring-1 ring-white/15 transition duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:shadow-2xl hover:ring-white/40 sm:w-80">
      {/* Icono en cuadro semitransparente */}
      <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-sm transition duration-300 group-hover/card:rotate-[-6deg] group-hover/card:bg-white/25">
        <Icon className="h-7 w-7" strokeWidth={2.2} />
      </div>

      <div className="relative z-10">
        <h3 className="font-display text-lg font-bold leading-tight text-white">{item.title}</h3>
        <p className="mt-0.5 text-xs leading-snug text-white/85">{item.desc}</p>
      </div>

      {/* Shimmer que recorre la card en hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover/card:translate-x-full" />

      {/* Halo decorativo radial */}
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
    </div>
  );
}
