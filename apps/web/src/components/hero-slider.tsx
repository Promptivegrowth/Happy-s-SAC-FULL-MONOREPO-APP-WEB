'use client';

import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Gift, Sparkles } from 'lucide-react';

// Declaración mínima del web component para que TS no se queje.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'dotlottie-wc': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autoplay?: boolean | string;
          loop?: boolean | string;
          speed?: string | number;
        },
        HTMLElement
      >;
    }
  }
}

type SlideLayout = 'derecha-lottie' | 'centro' | 'centro-amplio';

type Slide = {
  src: string;
  alt: string;
  href: string;
  layout: SlideLayout;
  pretitulo: string;
  titulo: string;
  tituloAcento?: string;
  subtitulo: string;
  cta: string;
  badgeIcon: 'heart' | 'gift' | 'sparkle';
};

const SLIDES: Slide[] = [
  {
    src: '/slider1.webp',
    alt: 'Día de la Madre — disfraces típicos para mamá',
    href: '/campanias/dia-de-la-madre-2026',
    layout: 'derecha-lottie',
    pretitulo: 'Mayo 2026',
    titulo: 'Feliz Día,',
    tituloAcento: 'Mamá ❤',
    subtitulo: 'Disfraces típicos y trajes especiales para que su show escolar sea inolvidable.',
    cta: 'Ver colección Mamá →',
    badgeIcon: 'heart',
  },
  {
    src: '/slider2.webp',
    alt: 'Disfraces para el día de la madre — colección 2026',
    href: '/campanias/dia-de-la-madre-2026',
    layout: 'centro',
    pretitulo: 'Edición limitada',
    titulo: 'Mamá merece',
    tituloAcento: 'lo mejor',
    subtitulo: 'Vestidos coloridos para que mamá brille en cada presentación.',
    cta: 'Comprar ahora',
    badgeIcon: 'gift',
  },
  {
    src: '/slider3.webp',
    alt: 'Show del día de la madre — disfraces y accesorios',
    href: '/campanias/dia-de-la-madre-2026',
    layout: 'centro-amplio',
    pretitulo: '¡Solo por mayo!',
    titulo: 'Sorprende a',
    tituloAcento: 'la reina del hogar',
    subtitulo: 'Más de 200 modelos · 11 tallas · Yape · Plin · Tarjeta · Envío Lima 2-3 días',
    cta: 'Descubrir más',
    badgeIcon: 'sparkle',
  },
];

const LOTTIE_SRC = 'https://lottie.host/0be6f22b-54c5-4c84-bce8-5c7367018885/jmgIfyFbJo.lottie';
const AUTO_ROTATE_MS = 7500;

function BadgeIcon({ kind }: { kind: Slide['badgeIcon'] }) {
  if (kind === 'heart') return <Heart className="h-3.5 w-3.5 fill-current" />;
  if (kind === 'gift') return <Gift className="h-3.5 w-3.5" />;
  return <Sparkles className="h-3.5 w-3.5" />;
}

export function HeroSlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), AUTO_ROTATE_MS);
    return () => clearInterval(t);
  }, [paused]);

  function go(dir: -1 | 1) {
    setActive((i) => (i + dir + SLIDES.length) % SLIDES.length);
  }

  return (
    <>
      <Script
        src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.9.10/dist/dotlottie-wc.js"
        type="module"
        strategy="afterInteractive"
      />

      <section
        className="relative w-full overflow-hidden bg-corp-900"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        aria-roledescription="carousel"
        aria-label="Promociones Día de la Madre 2026"
      >
        <style>{`
          @keyframes hero-kenburns {
            0%   { transform: scale(1)    translate(0,    0);    }
            100% { transform: scale(1.10) translate(-1%, -1%);   }
          }
          .hero-kb-active {
            animation: hero-kenburns ${AUTO_ROTATE_MS + 1500}ms ease-out forwards;
          }
          @keyframes hero-fade-down {
            from { opacity: 0; transform: translateY(-12px); }
            to   { opacity: 1; transform: translateY(0);     }
          }
          @keyframes hero-fade-up {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0);    }
          }
          @keyframes hero-bounce-in {
            0%   { opacity: 0; transform: scale(0.6); }
            60%  { opacity: 1; transform: scale(1.06); }
            100% { transform: scale(1); }
          }
          @keyframes hero-progress { from { width: 0%; } to { width: 100%; } }
          @keyframes hero-shimmer {
            0%   { background-position: -200% 50%; }
            100% { background-position:  200% 50%; }
          }
          .hero-text-shimmer {
            background: linear-gradient(90deg,
              #fff 0%, #ffd6e0 25%, #ffb3c6 50%, #ffd6e0 75%, #fff 100%);
            background-size: 200% auto;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: hero-shimmer 4s linear infinite;
          }
        `}</style>

        <div className="relative aspect-[16/9] w-full sm:aspect-[21/9] lg:aspect-[24/9]">
          {SLIDES.map((s, i) => {
            const inactive = i !== active;
            return (
              <div
                key={s.src}
                className={`absolute inset-0 transition-opacity duration-1000 ease-out ${
                  inactive ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                {/* Imagen con Ken Burns */}
                <div className={`absolute inset-0 ${inactive ? '' : 'hero-kb-active'}`} key={`${i}-${active}`}>
                  <Image
                    src={s.src}
                    alt={s.alt}
                    fill
                    priority={i === 0}
                    className="object-cover"
                    sizes="100vw"
                    unoptimized
                  />
                </div>

                {/* Overlay degradado para mejor contraste del texto */}
                {!inactive && (
                  <div
                    className={`pointer-events-none absolute inset-0 ${
                      s.layout === 'derecha-lottie'
                        ? 'bg-gradient-to-l from-black/40 via-transparent to-transparent'
                        : 'bg-gradient-to-t from-black/30 via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-white/10 sm:to-transparent'
                    }`}
                  />
                )}

                {/* Contenido por layout */}
                {!inactive && (
                  <SlideContent slide={s} keyForAnim={`${i}-${active}`} />
                )}
              </div>
            );
          })}

          {/* Barra de progreso */}
          {!paused && (
            <div
              key={`progress-${active}`}
              className="absolute left-0 top-0 z-20 h-1 bg-happy-400"
              style={{ animation: `hero-progress ${AUTO_ROTATE_MS}ms linear forwards` }}
            />
          )}

          {/* Controles */}
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Slide anterior"
            className="absolute left-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50 sm:left-4"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Slide siguiente"
            className="absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50 sm:right-4"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-2 sm:bottom-5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Ir al slide ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === active ? 'w-8 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                }`}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function SlideContent({ slide, keyForAnim }: { slide: Slide; keyForAnim: string }) {
  // Posición / alineación del bloque de texto según layout
  const wrapperClasses = {
    'derecha-lottie': 'items-center justify-end pr-4 sm:pr-12 lg:pr-32 xl:pr-48',
    centro: 'items-center justify-center px-4',
    'centro-amplio': 'items-center justify-center px-4',
  }[slide.layout];

  const textWidth = {
    'derecha-lottie': 'max-w-md text-right',
    centro: 'max-w-lg text-center',
    'centro-amplio': 'max-w-2xl text-center',
  }[slide.layout];

  return (
    <div key={keyForAnim} className={`absolute inset-0 z-10 flex ${wrapperClasses}`}>
      <div className={`${textWidth} relative space-y-3 sm:space-y-4`}>
        {/* Pretítulo / badge */}
        <div
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg sm:text-xs"
          style={{ animation: 'hero-fade-down 600ms ease-out both' }}
        >
          <BadgeIcon kind={slide.badgeIcon} />
          {slide.pretitulo}
        </div>

        {/* Título grande con shimmer rosa en la línea acento */}
        <h2
          className="font-display text-2xl font-bold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:text-4xl lg:text-5xl xl:text-6xl"
          style={{ animation: 'hero-fade-up 700ms ease-out 100ms both' }}
        >
          <span className="block">{slide.titulo}</span>
          {slide.tituloAcento && (
            <span className="hero-text-shimmer block">{slide.tituloAcento}</span>
          )}
        </h2>

        {/* Subtítulo */}
        <p
          className="text-xs text-white/95 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] sm:text-sm lg:text-base"
          style={{ animation: 'hero-fade-up 800ms ease-out 250ms both' }}
        >
          {slide.subtitulo}
        </p>

        {/* CTA */}
        <div
          className={`pt-1 ${slide.layout === 'derecha-lottie' ? 'flex justify-end' : 'flex justify-center'}`}
          style={{ animation: 'hero-bounce-in 700ms cubic-bezier(0.34,1.56,0.64,1) 400ms both' }}
        >
          <Link
            href={slide.href}
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-happy-500 px-6 py-2.5 text-sm font-bold text-white shadow-xl transition hover:scale-105 hover:shadow-2xl sm:px-8 sm:py-3 sm:text-base"
          >
            {slide.cta}
          </Link>
        </div>
      </div>

      {/* Lottie solo en slider 1, en el extremo derecho.
          Se renderiza DENTRO del overlay para que el flex justify-end empuje el bloque
          de texto hacia la izquierda. Lo posicionamos absolute para no afectar el flujo. */}
      {slide.layout === 'derecha-lottie' && (
        <div
          className="pointer-events-none absolute right-1 top-1/2 hidden h-32 w-32 -translate-y-1/2 sm:block sm:h-44 sm:w-44 lg:right-4 lg:h-56 lg:w-56 xl:h-64 xl:w-64"
          style={{ animation: 'hero-fade-up 900ms ease-out 200ms both' }}
        >
          <dotlottie-wc
            src={LOTTIE_SRC}
            autoplay
            loop
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
    </div>
  );
}
