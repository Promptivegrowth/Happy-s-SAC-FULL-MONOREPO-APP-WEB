'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SLIDES = [
  {
    src: '/slider1.webp',
    alt: 'Disfraces Happys — temporada actual',
    href: '/productos',
  },
  {
    src: '/slider2.webp',
    alt: 'Colección de disfraces para niños y niñas',
    href: '/disfraces/ninos',
  },
  {
    src: '/slider3.webp',
    alt: 'Disfraces para adultos y eventos',
    href: '/disfraces/adultos',
  },
];

const AUTO_ROTATE_MS = 5500;

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
    <section
      className="relative w-full overflow-hidden bg-corp-900"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Promociones destacadas"
    >
      {/* Slides container — usa aspect-ratio responsive que aproxima la proporción
          horizontal de los webp originales sin cortarlos en mobile. */}
      <div className="relative aspect-[16/9] w-full sm:aspect-[21/9] lg:aspect-[24/9]">
        {SLIDES.map((s, i) => {
          const inactive = i !== active;
          return (
            <Link
              key={s.src}
              href={s.href}
              tabIndex={inactive ? -1 : 0}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${
                inactive ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
            >
              <Image
                src={s.src}
                alt={s.alt}
                fill
                priority={i === 0}
                className="object-cover"
                sizes="100vw"
                // Las webp del cliente ya vienen optimizadas (~150KB cada una).
                // unoptimized evita que el optimizer de Next/Vercel devuelva 400
                // y sirve el archivo directo desde /public.
                unoptimized
              />
            </Link>
          );
        })}

        {/* Controles laterales (visibles en hover desktop, siempre visibles touch) */}
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Slide anterior"
          className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50 sm:left-4"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Slide siguiente"
          className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50 sm:right-4"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2 sm:bottom-5">
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
  );
}
