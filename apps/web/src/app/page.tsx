import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { ArrowRight, Truck, ShieldCheck, Sparkles, Heart, MessageCircle } from 'lucide-react';
import { createClient } from '@happy/db/server';

// Dinámico — env vars solo disponibles en runtime, no durante el build de Vercel.
export const dynamic = 'force-dynamic';

const CATS_HERO = [
  { slug: 'halloween',        label: 'Halloween',       emoji: '🎃', gradient: 'from-happy-500 to-corp-700' },
  { slug: 'fiestas-patrias',  label: 'Fiestas Patrias', emoji: '🇵🇪', gradient: 'from-danger to-happy-500' },
  { slug: 'navidad',          label: 'Navidad',         emoji: '🎅', gradient: 'from-corp-700 to-happy-600' },
  { slug: 'danzas-tipicas',   label: 'Danzas Típicas',  emoji: '💃', gradient: 'from-happy-600 to-corp-900' },
  { slug: 'superheroes',      label: 'Superhéroes',     emoji: '🦸', gradient: 'from-corp-700 to-corp-900' },
  { slug: 'princesas',        label: 'Princesas',       emoji: '👸', gradient: 'from-happy-400 to-danger' },
];

type Destacado = {
  producto_id: string;
  slug: string | null;
  titulo_web: string | null;
  productos?: {
    id: string;
    nombre: string;
    imagen_principal_url: string | null;
    productos_variantes?: { precio_publico: number | null }[];
  } | null;
};

async function loadDestacados(): Promise<Destacado[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb.from('productos_publicacion')
      .select('producto_id, slug, titulo_web, productos!inner(id, nombre, imagen_principal_url, productos_variantes(id, talla, precio_publico))')
      .eq('publicado', true)
      .eq('destacado_web', true)
      .order('orden_web')
      .limit(8);
    if (error) {
      console.warn('[home] loadDestacados error:', error.message);
      return [];
    }
    return (data ?? []) as unknown as Destacado[];
  } catch (e) {
    console.warn('[home] loadDestacados exception:', (e as Error).message);
    return [];
  }
}

export default async function Home() {
  const destacados = await loadDestacados();

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
            {destacados.map((p) => {
              const prod = p.productos;
              if (!prod) return null;
              const min = (prod.productos_variantes ?? [])
                .map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0).sort((a, b) => a - b)[0];
              return (
                <Link key={p.producto_id} href={`/productos/${p.slug ?? ''}`} className="group">
                  <Card className="overflow-hidden border-2 border-transparent transition hover:-translate-y-1 hover:border-happy-300 hover:shadow-glow">
                    <div className="relative aspect-square overflow-hidden bg-corp-50">
                      {prod.imagen_principal_url ? (
                        <Image src={prod.imagen_principal_url} alt={prod.nombre} fill className="object-cover transition group-hover:scale-105" sizes="(max-width: 768px) 100vw, 25vw" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">🎭</div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium leading-tight text-corp-900">{p.titulo_web ?? prod.nombre}</h3>
                      <p className="mt-2 font-display text-lg font-semibold text-happy-600">
                        Desde S/ {(min ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </Card>
                </Link>
              );
            })}
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
