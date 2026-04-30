'use client';

import Image from 'next/image';
import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Gift, Sparkles, ArrowRight } from 'lucide-react';

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

type SlideLayout = 'izquierda-lottie' | 'derecha-lottie' | 'centro' | 'centro-amplio';

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
  /** Color del título principal — debe contrastar con el fondo del slide */
  tituloColor: string;
  /** Color del acento (segunda línea — color sólido fuerte) */
  acentoColor: string;
};

const SLIDES: Slide[] = [
  {
    src: '/slider1.webp',
    alt: 'Día de la Madre — disfraces típicos para mamá',
    href: '/campanias/dia-de-la-madre-2026',
    layout: 'derecha-lottie',
    pretitulo: '✨ Mayo 2026',
    titulo: '¡Feliz día,',
    tituloAcento: 'Mami!',
    subtitulo: 'Disfraces típicos y trajes especiales para que su show del Día de la Madre sea inolvidable.',
    cta: 'Ver colección',
    badgeIcon: 'heart',
    tituloColor: '#231459', // azul oscuro corp-900 sobre fondo claro/rosa
    acentoColor: '#EC1C24', // rojo danger fuerte — alto contraste
  },
  {
    src: '/slider2.webp',
    alt: 'Disfraces para el día de la madre — colección 2026',
    href: '/campanias/dia-de-la-madre-2026',
    layout: 'centro',
    pretitulo: '🌸 Edición limitada',
    titulo: 'Mamá merece',
    tituloAcento: 'lo mejor',
    subtitulo: 'Vestidos coloridos y trajes únicos\npara que mamá brille en cada presentación.',
    cta: 'Comprar ahora',
    badgeIcon: 'gift',
    tituloColor: '#231459',
    acentoColor: '#E15A25', // naranja oscuro happy-600
  },
  {
    src: '/slider3.webp',
    alt: 'Show del día de la madre — disfraces y accesorios',
    href: '/campanias/dia-de-la-madre-2026',
    layout: 'centro-amplio',
    pretitulo: '💝 ¡Solo por mayo!',
    titulo: 'Sorprende a',
    tituloAcento: 'la reina del hogar',
    subtitulo: 'Más de 200 modelos · 11 tallas · Yape · Plin · Tarjeta · Envío Lima 2-3 días',
    cta: 'Descubrir más',
    badgeIcon: 'sparkle',
    tituloColor: '#231459',
    acentoColor: '#EC1C24', // rojo danger
  },
];

const LOTTIE_SRC = 'https://lottie.host/0be6f22b-54c5-4c84-bce8-5c7367018885/jmgIfyFbJo.lottie';
const AUTO_ROTATE_MS = 8000;

function BadgeIcon({ kind }: { kind: Slide['badgeIcon'] }) {
  if (kind === 'heart') return <Heart className="h-4 w-4 fill-current" />;
  if (kind === 'gift') return <Gift className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

/**
 * Texto animado letra por letra con efecto "bounce in" stagger.
 * Cada letra aparece con un pequeño rebote 60ms después de la anterior.
 * Los espacios se preservan con un span de width visible para que no colapse.
 */
function AnimatedText({
  text,
  className = '',
  delayBase = 0,
  letterDelay = 50,
  style,
}: {
  text: string;
  className?: string;
  delayBase?: number;
  letterDelay?: number;
  style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={style} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          aria-hidden="true"
          className="inline-block"
          style={{
            // Spaces no animan visualmente pero conservan el ancho.
            animation:
              ch === ' '
                ? undefined
                : `hero-letter-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delayBase + i * letterDelay}ms both`,
            // Espacio inquebrantable para que el span tenga ancho.
            whiteSpace: 'pre',
          }}
        >
          {ch}
        </span>
      ))}
    </span>
  );
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

          /* Letra por letra: aparece desde abajo, se pasa de tamaño y rebota */
          @keyframes hero-letter-pop {
            0%   { opacity: 0; transform: translateY(28px) scale(0.4) rotate(-8deg); }
            55%  { opacity: 1; transform: translateY(-6px) scale(1.18) rotate(2deg); }
            85%  { transform: translateY(2px) scale(0.96) rotate(-1deg); }
            100% { transform: translateY(0)   scale(1)    rotate(0deg);  }
          }

          @keyframes hero-fade-in {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0);   }
          }
          @keyframes hero-bounce-in {
            0%   { opacity: 0; transform: scale(0.6) translateY(20px); }
            60%  { opacity: 1; transform: scale(1.08) translateY(-4px); }
            100% { transform: scale(1) translateY(0); }
          }
          @keyframes hero-progress { from { width: 0%; } to { width: 100%; } }
          @keyframes hero-shimmer-slide {
            0%   { background-position:   0% 50%; }
            100% { background-position: 200% 50%; }
          }
          .hero-acento-shimmer {
            background-size: 200% auto;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: hero-shimmer-slide 3.5s linear infinite;
          }
          /* Pequeña sombra blanca sutil para que el texto oscuro no se pierda en imágenes claras */
          .hero-text-glow {
            text-shadow:
              0 1px 0 rgba(255, 255, 255, 0.7),
              0 2px 8px rgba(255, 255, 255, 0.45);
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

                {!inactive && <SlideContent slide={s} keyForAnim={`${i}-${active}`} />}
              </div>
            );
          })}

          {!paused && (
            <div
              key={`progress-${active}`}
              className="absolute left-0 top-0 z-20 h-1 bg-happy-500"
              style={{ animation: `hero-progress ${AUTO_ROTATE_MS}ms linear forwards` }}
            />
          )}

          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Slide anterior"
            className="absolute left-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-corp-900 shadow-md backdrop-blur-sm transition hover:bg-white sm:left-4 sm:h-11 sm:w-11"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Slide siguiente"
            className="absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-corp-900 shadow-md backdrop-blur-sm transition hover:bg-white sm:right-4 sm:h-11 sm:w-11"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 gap-2 sm:bottom-5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Ir al slide ${i + 1}`}
                className={`h-2.5 rounded-full transition-all ${
                  i === active ? 'w-10 bg-happy-500' : 'w-2.5 bg-corp-900/40 hover:bg-corp-900/60'
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
  // Posición / alineación del bloque de texto según layout.
  // Slider 1: derecha-lottie — texto a la derecha, lottie a la izquierda.
  // Slider 2 y 3: centrado, con padding amplio para que no se corte el texto.
  const wrapperClasses = {
    'izquierda-lottie': 'items-center justify-start pl-8 sm:pl-20 lg:pl-32 xl:pl-48 2xl:pl-64',
    'derecha-lottie': 'items-center justify-end pr-8 sm:pr-20 lg:pr-32 xl:pr-48 2xl:pr-64',
    centro: 'items-center justify-center px-6 sm:px-12',
    'centro-amplio': 'items-center justify-center px-6 sm:px-12',
  }[slide.layout];

  // Anchos máximos del bloque de texto. Generosos para que las dos líneas
  // del título quepan sin recortarse incluso en xl con tipografía grande.
  const textWidth = {
    'izquierda-lottie': 'max-w-[18rem] text-left sm:max-w-md lg:max-w-xl xl:max-w-2xl',
    'derecha-lottie': 'max-w-[18rem] text-right sm:max-w-md lg:max-w-xl xl:max-w-2xl',
    centro: 'max-w-md text-center sm:max-w-2xl lg:max-w-3xl',
    'centro-amplio': 'max-w-md text-center sm:max-w-2xl lg:max-w-4xl',
  }[slide.layout];

  const layoutLateral = slide.layout === 'izquierda-lottie' || slide.layout === 'derecha-lottie';

  // Delay para empezar las letras del título DESPUÉS del badge
  const TITULO_DELAY = 300;
  const ACENTO_DELAY = TITULO_DELAY + slide.titulo.length * 50 + 100;
  const SUBT_DELAY = ACENTO_DELAY + (slide.tituloAcento?.length ?? 0) * 50 + 200;
  const CTA_DELAY = SUBT_DELAY + 400;

  return (
    <div key={keyForAnim} className={`absolute inset-0 z-10 flex font-fun ${wrapperClasses}`}>
      <div className={`${textWidth} relative space-y-3 sm:space-y-5`}>
        {/* Pretítulo / badge */}
        <div
          className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-rose-500 to-happy-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg sm:text-sm ${
            layoutLateral ? '' : 'mx-auto'
          }`}
          style={{ animation: 'hero-bounce-in 600ms cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <BadgeIcon kind={slide.badgeIcon} />
          {slide.pretitulo}
        </div>

        {/* Título — letra por letra con bounce.
            Tamaños calibrados para que las dos líneas quepan en cada layout. */}
        <h2
          className={`font-fun font-bold leading-[1.05] tracking-tight ${
            layoutLateral
              ? 'text-3xl sm:text-5xl lg:text-6xl xl:text-7xl'
              : slide.layout === 'centro-amplio'
                ? 'text-3xl sm:text-5xl lg:text-7xl'
                : 'text-3xl sm:text-5xl lg:text-6xl'
          }`}
          style={{ color: slide.tituloColor }}
        >
          <span className="hero-text-glow block whitespace-nowrap">
            <AnimatedText text={slide.titulo} delayBase={TITULO_DELAY} letterDelay={55} />
          </span>
          {slide.tituloAcento && (
            <span
              className="hero-text-glow block whitespace-nowrap"
              style={{ color: slide.acentoColor }}
            >
              <AnimatedText text={slide.tituloAcento} delayBase={ACENTO_DELAY} letterDelay={55} />
            </span>
          )}
        </h2>

        {/* Subtítulo — whitespace-pre-line respeta los \n del texto. */}
        <p
          className="whitespace-pre-line font-fun text-base font-medium text-corp-900/85 sm:text-lg lg:text-xl"
          style={{ animation: `hero-fade-in 700ms ease-out ${SUBT_DELAY}ms both` }}
        >
          {slide.subtitulo}
        </p>

        {/* CTA */}
        <div
          className={`pt-2 ${layoutLateral ? '' : 'flex justify-center'}`}
          style={{ animation: `hero-bounce-in 700ms cubic-bezier(0.34,1.56,0.64,1) ${CTA_DELAY}ms both` }}
        >
          <Link
            href={slide.href}
            className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-happy-500 via-happy-600 to-danger px-7 py-3.5 text-base font-bold text-white shadow-xl transition hover:scale-105 hover:shadow-2xl sm:px-9 sm:py-4 sm:text-lg"
          >
            {slide.cta}
            <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      {/* Lottie en layouts laterales: se ubica en el lado opuesto al texto. */}
      {layoutLateral && (
        <div
          className={`pointer-events-none absolute top-1/2 hidden h-40 w-40 -translate-y-1/2 sm:block sm:h-52 sm:w-52 lg:h-72 lg:w-72 xl:h-80 xl:w-80 ${
            slide.layout === 'izquierda-lottie'
              ? 'right-2 lg:right-8 xl:right-16'
              : 'left-2 lg:left-8 xl:left-16'
          }`}
          style={{ animation: 'hero-bounce-in 900ms cubic-bezier(0.34,1.56,0.64,1) 600ms both' }}
        >
          <dotlottie-wc src={LOTTIE_SRC} autoplay loop style={{ width: '100%', height: '100%' }} />
        </div>
      )}
    </div>
  );
}
