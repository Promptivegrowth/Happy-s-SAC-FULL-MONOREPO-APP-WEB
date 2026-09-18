import Link from 'next/link';
import { Search, Home, MessageCircle } from 'lucide-react';

export const metadata = {
  title: 'Página no encontrada · Disfraces Happy\'s',
  robots: { index: false, follow: true },
};

/**
 * La página que ve alguien cuando la dirección no existe.
 *
 * Hasta ahora no había ninguna, así que salía la de Next por defecto: un "404 —
 * This page could not be found" en inglés, sin un solo enlace. Para una tienda
 * eso es perder la visita: la persona no entiende qué pasó, no sabe si la
 * tienda existe y no tiene a dónde ir. Javier la encontró desde el celular el
 * 18/09/2026 y lo primero que pensó fue que la web estaba rota.
 *
 * Esto no evita que una dirección falle —eso hay que arreglarlo donde
 * corresponda—, pero convierte un callejón sin salida en un desvío: dice en
 * castellano qué pasó y ofrece las categorías, el buscador y el WhatsApp.
 */
const GRUPOS = [
  { href: '/disfraces/ninas', label: 'Disfraces de Niña', emoji: '👧' },
  { href: '/disfraces/ninos', label: 'Disfraces de Niño', emoji: '👦' },
  { href: '/disfraces/adultos', label: 'Disfraces de Adultos', emoji: '🧑' },
  { href: '/disfraces/accesorios', label: 'Accesorios', emoji: '🎀' },
];

const POPULARES = [
  { href: '/categoria/halloween', label: 'Halloween' },
  { href: '/categoria/danzas-tipicas', label: 'Danzas típicas' },
  { href: '/categoria/fiestas-patrias', label: 'Fiestas Patrias' },
  { href: '/categoria/princesas-especiales', label: 'Princesas' },
  { href: '/categoria/superheroes-especiales', label: 'Superhéroes' },
  { href: '/categoria/navidad', label: 'Navidad' },
];

export default function NotFound() {
  return (
    <div className="container px-4 py-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="font-display text-6xl font-bold text-happy-500">404</p>
        <h1 className="mt-3 font-display text-2xl font-semibold text-corp-900 sm:text-3xl">
          No encontramos esta página
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Puede que el enlace esté viejo o que el disfraz ya no esté publicado.
          La tienda funciona con normalidad: elegí por dónde seguir.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-md bg-happy-500 px-5 text-sm font-semibold text-white transition hover:bg-happy-600"
          >
            <Home className="h-4 w-4" /> Ir al inicio
          </Link>
          <Link
            href="/productos"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 px-5 text-sm font-medium text-corp-900 transition hover:bg-slate-50"
          >
            <Search className="h-4 w-4" /> Ver todos los disfraces
          </Link>
          <Link
            href="/contacto"
            className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 px-5 text-sm font-medium text-corp-900 transition hover:bg-slate-50"
          >
            <MessageCircle className="h-4 w-4" /> Escribinos
          </Link>
        </div>
      </div>

      {/* Las cuatro secciones grandes, que es lo que la mayoría viene a buscar. */}
      <div className="mx-auto mt-10 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GRUPOS.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="rounded-xl border border-slate-200 bg-white p-4 text-center transition hover:border-happy-300 hover:shadow-md"
          >
            <span className="text-3xl" aria-hidden>{g.emoji}</span>
            <p className="mt-1.5 text-sm font-semibold text-corp-900">{g.label}</p>
          </Link>
        ))}
      </div>

      <div className="mx-auto mt-8 max-w-3xl text-center">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
          Categorías más buscadas
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {POPULARES.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-happy-300 hover:bg-happy-50 hover:text-happy-700"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
