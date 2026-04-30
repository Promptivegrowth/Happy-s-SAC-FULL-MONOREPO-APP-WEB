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
import { HeroSlider } from '@/components/hero-slider';

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
      {/* HERO SLIDER (3 imágenes webp horizontales auto-rotate) */}
      <HeroSlider />

      {/* Tira de beneficios debajo del slider */}
      <section className="border-b bg-slate-50/60">
        <div className="container grid grid-cols-2 gap-3 px-4 py-6 sm:grid-cols-4">
          <Stat icon={<Truck className="h-5 w-5" />} value="2-3 días" label="Envío en Lima" />
          <Stat icon={<ShieldCheck className="h-5 w-5" />} value="100% seguro" label="Yape · Plin · Tarjeta" />
          <Stat icon={<Sparkles className="h-5 w-5" />} value="+200 modelos" label="11 tallas disponibles" />
          <Stat icon={<Heart className="h-5 w-5" />} value="+30 mil" label="Familias felices" />
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

      {/* TOP / Más vendidos — sección destacada */}
      {destacados.length > 0 && (
        <section className="relative overflow-hidden bg-gradient-to-br from-happy-50 via-white to-corp-50 py-16">
          <div className="absolute -right-20 top-0 h-64 w-64 rounded-full bg-happy-200/40 blur-3xl" />
          <div className="absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-corp-200/30 blur-3xl" />

          <div className="container relative px-4">
            <div className="mb-10 text-center">
              <Badge className="mb-3 bg-gradient-to-r from-happy-500 to-danger text-white hover:from-happy-500">
                <Sparkles className="mr-1 h-3 w-3" /> Selección destacada
              </Badge>
              <h2 className="font-display text-4xl font-semibold text-corp-900 sm:text-5xl">
                🔥 Lo más TOP
              </h2>
              <p className="mt-2 text-slate-600">
                Los favoritos de las familias peruanas · {destacados.length} disfraces seleccionados
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {destacados.map((p, i) => (
                <ProductCard key={p.slug ?? i} p={p} priority={i < 4} />
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/productos"
                className="inline-flex items-center gap-2 rounded-full border-2 border-happy-500 bg-white px-7 py-3 font-bold text-happy-600 shadow-sm transition hover:bg-happy-500 hover:text-white"
              >
                Ver catálogo completo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {destacados.length === 0 && (
        <section className="container px-4 pb-20">
          <Card className="p-10 text-center text-sm text-slate-500">
            No hay productos destacados aún. Desde el ERP, en cada producto activá el toggle
            "⭐ Destacado" para que aparezca acá.
          </Card>
        </section>
      )}

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
