import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { ArrowRight, Truck, ShieldCheck, Sparkles, Heart, MessageCircle, Calendar } from 'lucide-react';
import { createClient } from '@happy/db/server';
import { ProductCard } from '@/components/product-card';
import { loadPublicaciones } from '@/server/queries/publicaciones';
import { BLUR_DATA_URL } from '@/lib/image';

export const dynamic = 'force-dynamic';

const CATS_HERO = [
  { slug: 'halloween',        label: 'Halloween',       emoji: '🎃', gradient: 'from-happy-500 to-corp-700' },
  { slug: 'fiestas-patrias',  label: 'Fiestas Patrias', emoji: '🇵🇪', gradient: 'from-danger to-happy-500' },
  { slug: 'navidad',          label: 'Navidad',         emoji: '🎅', gradient: 'from-corp-700 to-happy-600' },
  { slug: 'danzas-tipicas',   label: 'Danzas Típicas',  emoji: '💃', gradient: 'from-happy-600 to-corp-900' },
  { slug: 'superheroes',      label: 'Superhéroes',     emoji: '🦸', gradient: 'from-corp-700 to-corp-900' },
  { slug: 'princesas',        label: 'Princesas',       emoji: '👸', gradient: 'from-happy-400 to-danger' },
];

type CampaniaActiva = {
  slug: string | null;
  nombre: string;
  descripcion: string | null;
  fecha_fin: string | null;
  banner_url: string | null;
  imagen_url: string | null;
};

async function loadCampaniasActivas(): Promise<CampaniaActiva[]> {
  try {
    const sb = await createClient();
    const hoy = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb
      .from('campanas')
      .select('slug, nombre, descripcion, fecha_fin, banner_url, imagen_url, fecha_inicio')
      .eq('activa', true)
      .or(`fecha_inicio.is.null,fecha_inicio.lte.${hoy}`)
      .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`)
      .order('orden_web')
      .limit(3);
    if (error) {
      console.warn('[campanias] error:', error.message);
      return [];
    }
    return (data ?? []) as CampaniaActiva[];
  } catch (e) {
    console.warn('[campanias] exception:', (e as Error).message);
    return [];
  }
}

export default async function Home() {
  const [destacados, campanias] = await Promise.all([
    loadPublicaciones({ destacado: true, limit: 8 }),
    loadCampaniasActivas(),
  ]);

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-corp-50 via-white to-happy-50">
        <div className="absolute -left-32 top-10 h-72 w-72 rounded-full bg-happy-200/50 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-corp-200/40 blur-3xl" />
        <div className="container relative px-4 py-16 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge className="mb-4 bg-happy-100 text-happy-800 hover:bg-happy-200">
                <Sparkles className="mr-1 h-3 w-3" /> Temporada Halloween 2026
              </Badge>
              <h1 className="font-display text-5xl font-semibold leading-tight tracking-tight text-corp-900 md:text-6xl">
                Disfraces que <span className="bg-happy-gradient bg-clip-text text-transparent">alegran fiestas</span> en todo el Perú
              </h1>
              <p className="mt-4 max-w-xl text-lg text-corp-700/80">
                Más de 200 modelos en 11 tallas. Confección propia con materiales premium.
                Niños y adultos. Yape, Plin, tarjeta o WhatsApp.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/productos">
                  <Button variant="premium" size="lg">
                    Ver catálogo completo <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/categoria/halloween">
                  <Button variant="outline" size="lg" className="border-corp-700 text-corp-700 hover:bg-corp-50">
                    🎃 Ofertas Halloween
                  </Button>
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-3 gap-4 text-center">
                <Stat icon={<Truck className="h-5 w-5" />} value="2-3 días" label="Envío Lima" />
                <Stat icon={<ShieldCheck className="h-5 w-5" />} value="100%" label="Pago seguro" />
                <Stat icon={<Heart className="h-5 w-5" />} value="+30k" label="Familias felices" />
              </div>
            </div>

            <div className="relative">
              <div className="grid grid-cols-2 gap-3">
                {CATS_HERO.slice(0, 4).map((c, i) => (
                  <Link
                    key={c.slug}
                    href={`/categoria/${c.slug}`}
                    className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.gradient} p-6 text-white shadow-soft transition hover:shadow-glow ${i % 2 === 1 ? 'translate-y-6' : ''}`}
                  >
                    <div className="text-5xl drop-shadow-sm">{c.emoji}</div>
                    <div className="mt-3 font-display text-lg font-semibold">{c.label}</div>
                    <ArrowRight className="absolute bottom-4 right-4 h-5 w-5 opacity-60 transition group-hover:translate-x-1 group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CAMPAÑAS ACTIVAS */}
      {campanias.length > 0 && (
        <section className="container px-4 pt-12">
          <div className="mb-6 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-happy-500" />
            <h2 className="font-display text-2xl font-semibold text-corp-900">Campañas activas</h2>
          </div>
          <div className={`grid gap-4 ${campanias.length === 1 ? '' : campanias.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
            {campanias.map((c) => {
              const banner = c.banner_url ?? c.imagen_url;
              return (
                <Link
                  key={c.slug ?? c.nombre}
                  href={`/campanias/${c.slug ?? ''}`}
                  className="group relative overflow-hidden rounded-2xl border-2 border-happy-200 bg-gradient-to-br from-happy-500 via-danger to-corp-700 p-6 text-white shadow-soft transition hover:-translate-y-1 hover:shadow-glow"
                >
                  {banner && (
                    <Image
                      src={banner}
                      alt={c.nombre}
                      fill
                      className="object-cover opacity-40"
                      sizes="(max-width: 768px) 100vw, 33vw"
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                    />
                  )}
                  <div className="relative">
                    <Badge className="mb-3 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30">
                      <Sparkles className="mr-1 h-3 w-3" /> Campaña
                    </Badge>
                    <h3 className="font-display text-2xl font-semibold leading-tight">{c.nombre}</h3>
                    {c.descripcion && (
                      <p className="mt-1 line-clamp-2 text-sm text-white/90">{c.descripcion}</p>
                    )}
                    {c.fecha_fin && (
                      <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs">
                        <Calendar className="h-3 w-3" /> Hasta {new Date(c.fecha_fin).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}
                      </p>
                    )}
                    <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold opacity-90 group-hover:opacity-100">
                      Ver productos <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* CATEGORÍAS */}
      <section className="container px-4 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold text-corp-900">Explora por temporada</h2>
            <p className="mt-1 text-slate-500">Encuentra el disfraz perfecto para cada celebración</p>
          </div>
          <Link href="/productos" className="hidden text-sm font-medium text-happy-600 hover:underline md:inline">
            Ver todas las categorías →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATS_HERO.map((c) => (
            <Link key={c.slug} href={`/categoria/${c.slug}`}>
              <Card className="group flex aspect-square flex-col items-center justify-center gap-2 border-2 transition hover:-translate-y-1 hover:border-happy-400 hover:shadow-glow">
                <div className="text-4xl transition group-hover:scale-110">{c.emoji}</div>
                <span className="text-sm font-medium text-corp-900">{c.label}</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* DESTACADOS */}
      <section className="container px-4 pb-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold text-corp-900">Más vendidos esta semana 🔥</h2>
            <p className="mt-1 text-slate-500">Selección curada del equipo</p>
          </div>
          <Link href="/productos" className="text-sm font-medium text-happy-600 hover:underline">
            Ver todos →
          </Link>
        </div>

        {destacados.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">
            No hay productos destacados aún. Desde el ERP marca productos como “destacados” en /web-catalogo.
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {destacados.map((p, i) => (
              <ProductCard key={p.slug ?? i} p={p} priority={i < 4} />
            ))}
          </div>
        )}
      </section>

      {/* CTA WHATSAPP */}
      <section className="bg-corp-gradient py-16 text-white">
        <div className="container px-4 text-center">
          <h2 className="font-display text-3xl font-semibold md:text-4xl">¿Compra al por mayor o personalizada?</h2>
          <p className="mt-3 text-lg text-white/90">Hablemos por WhatsApp — atención directa con nuestro equipo</p>
          <a
            href="https://wa.me/51916856842"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 font-semibold text-corp-900 shadow-2xl transition hover:scale-105 hover:text-happy-600"
          >
            <MessageCircle className="h-5 w-5" />
            Escribir al +51 916 856 842
          </a>
        </div>
      </section>
    </>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div>
      <div className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-happy-100 text-happy-600">{icon}</div>
      <p className="font-display text-lg font-semibold text-corp-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
