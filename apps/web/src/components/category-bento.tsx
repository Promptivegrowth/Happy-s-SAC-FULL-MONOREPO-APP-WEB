import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

type Cat = {
  slug: string;
  label: string;
  /** Imágenes transparentes — se renderizan superpuestas con leve rotación al hover */
  images: [string, string];
};

const CATEGORIES: [Cat, Cat, Cat, Cat] = [
  { slug: 'disfraces-ninas', label: 'Disfraces Niñas', images: ['/grid/nina-1.png', '/grid/nina-2.png'] },
  { slug: 'disfraces-nino', label: 'Disfraces de niño', images: ['/grid/nino-1.png', '/grid/nino-2.png'] },
  { slug: 'accesorios', label: 'Accesorios', images: ['/grid/accesorios-1.png', '/grid/accesorios-2.png'] },
  { slug: 'disfraces-adulto', label: 'Disfraces de adulto', images: ['/grid/adulto-1.png', '/grid/adulto-2.png'] },
];

/**
 * Bento grid asimétrico (2 grandes a los lados, 2 medianos al centro).
 * Fondo premium #F5821F con difuminado radial. Hover SOLO en las imágenes
 * (scale + rotación leve). El fondo NO tiene hover.
 */
export function CategoryBento() {
  const [ninas, nino, accesorios, adulto] = CATEGORIES;
  return (
    <section className="container px-4 py-16 sm:py-20">
      <div className="mb-8 flex items-end justify-between sm:mb-10">
        <div>
          <h2 className="font-display text-3xl font-semibold text-corp-900 sm:text-4xl lg:text-5xl">
            Categorías
          </h2>
          <p className="mt-2 text-base text-slate-500 sm:text-lg">
            Elegí dónde empezar la aventura
          </p>
        </div>
        <Link
          href="/productos"
          className="hidden items-center gap-1 text-sm font-semibold text-happy-600 transition hover:gap-2 hover:text-happy-700 md:inline-flex"
        >
          Ver todas <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
        {/* Tile grande — Niñas (col 1, span 2 filas en lg) */}
        <CategoryTile cat={ninas} className="lg:row-span-2" tall />
        {/* Tile mediano — Niño (col 2, fila 1 en lg) */}
        <CategoryTile cat={nino} />
        {/* Tile grande — Adulto (col 3, span 2 filas en lg) */}
        <CategoryTile cat={adulto} className="lg:row-span-2" tall />
        {/* Tile mediano — Accesorios (col 2, fila 2 en lg) */}
        <CategoryTile cat={accesorios} />
      </div>
    </section>
  );
}

function CategoryTile({
  cat,
  className = '',
  tall = false,
}: {
  cat: Cat;
  className?: string;
  tall?: boolean;
}) {
  return (
    <Link
      href={`/categoria/${cat.slug}`}
      className={`group relative isolate overflow-hidden rounded-3xl shadow-lg ring-1 ring-white/10 ${
        tall ? 'min-h-[420px] lg:min-h-[560px]' : 'min-h-[260px] sm:min-h-[300px]'
      } ${className}`}
      style={{
        background:
          'radial-gradient(circle at 50% 20%, #FFA94D 0%, #F5821F 45%, #C7641A 100%)',
      }}
    >
      {/* Difuminado decorativo (no se anima en hover) */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_85%,rgba(255,255,255,0.22),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,255,255,0.15),transparent_45%)]" />

      {/* Capa de imágenes — única zona con hover.
          Tall: dos imágenes horizontales con overlap (cada una aspect-square al
          ~70% del ancho del tile → mucho más grandes que con flex w-1/2).
          Short: lado a lado al pie. */}
      {tall ? (
        <div className="absolute inset-x-2 bottom-3 top-24 sm:bottom-5">
          <div className="relative h-full w-full">
            {cat.images.map((src, i) => {
              const isLeft = i === 0;
              return (
                <div
                  key={src}
                  className={`absolute bottom-0 aspect-square w-[68%] max-w-[340px] transition-all duration-500 ease-out ${
                    isLeft
                      ? 'left-0 z-10 group-hover:-translate-x-1 group-hover:-rotate-2'
                      : 'right-0 z-0 group-hover:translate-x-1 group-hover:rotate-2'
                  } group-hover:scale-[1.04]`}
                  style={{
                    filter: 'drop-shadow(0 14px 22px rgba(0,0,0,0.3))',
                  }}
                >
                  <Image
                    src={src}
                    alt={`${cat.label} — disfraz ${i + 1}`}
                    fill
                    className="object-contain object-bottom"
                    sizes="(max-width: 768px) 70vw, 25vw"
                    priority={false}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 top-20 flex items-end justify-center gap-1 px-4 sm:gap-2 sm:px-6">
          {cat.images.map((src, i) => {
            const isLeft = i === 0;
            return (
              <div
                key={src}
                className={`relative h-full w-1/2 transition-all duration-500 ease-out ${
                  isLeft
                    ? 'group-hover:-translate-x-1 group-hover:-rotate-2'
                    : 'group-hover:translate-x-1 group-hover:rotate-2'
                } group-hover:scale-[1.04]`}
                style={{
                  filter: 'drop-shadow(0 12px 18px rgba(0,0,0,0.25))',
                }}
              >
                <Image
                  src={src}
                  alt={`${cat.label} — disfraz ${i + 1}`}
                  fill
                  className="object-contain object-bottom"
                  sizes="(max-width: 768px) 50vw, 25vw"
                  priority={false}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Etiqueta — arriba a la izquierda, fuera del área de imágenes */}
      <div className="relative z-10 p-6 sm:p-7">
        <h3 className="font-display text-2xl font-bold leading-tight text-white drop-shadow-md sm:text-3xl lg:text-[2rem]">
          {cat.label}
        </h3>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm transition group-hover:bg-white/25">
          Explorar <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
