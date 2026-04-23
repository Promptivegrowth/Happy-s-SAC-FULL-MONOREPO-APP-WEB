import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@happy/ui/button';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { ArrowRight, Truck, ShieldCheck, Sparkles, Heart } from 'lucide-react';
import { createClient } from '@happy/db/server';

export const dynamic = 'force-dynamic';

const CATS_HERO = [
  { slug: 'halloween', label: 'Halloween', emoji: '🎃', gradient: 'from-orange-500 to-purple-600' },
  { slug: 'fiestas-patrias', label: 'Fiestas Patrias', emoji: '🇵🇪', gradient: 'from-red-500 to-white' },
  { slug: 'navidad', label: 'Navidad', emoji: '🎅', gradient: 'from-emerald-500 to-red-500' },
  { slug: 'danzas-tipicas', label: 'Danzas Típicas', emoji: '💃', gradient: 'from-amber-500 to-rose-500' },
  { slug: 'superheroes', label: 'Superhéroes', emoji: '🦸', gradient: 'from-blue-600 to-indigo-700' },
  { slug: 'princesas', label: 'Princesas', emoji: '👸', gradient: 'from-pink-400 to-purple-500' },
];

async function loadDestacados() {
  const sb = await createClient();
  const { data } = await sb.from('productos_publicacion')
    .select('producto_id, slug, titulo_web, productos(id, nombre, imagen_principal_url, productos_variantes(id, talla, precio_publico))')
    .eq('publicado', true)
    .eq('destacado_web', true)
    .order('orden_web')
    .limit(8);
  return data ?? [];
}

export default async function Home() {
  const destacados = await loadDestacados();

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-happy-50 via-white to-pink-50">
        <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-happy-200/40 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-purple-200/40 blur-3xl" />
        <div className="container relative px-4 py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <Badge className="mb-4 bg-happy-500/10 text-happy-700">
                <Sparkles className="mr-1 h-3 w-3" /> Temporada Halloween 2026
              </Badge>
              <h1 className="font-display text-5xl font-semibold leading-tight md:text-6xl">
                Disfraces que <span className="bg-gradient-to-r from-happy-500 via-carnival-pink to-carnival-purple bg-clip-text text-transparent">alegran fiestas</span> en todo el Perú
              </h1>
              <p className="mt-4 max-w-xl text-lg text-slate-600">
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
                  <Button variant="outline" size="lg">
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
                    <div className="text-5xl">{c.emoji}</div>
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
            <h2 className="font-display text-3xl font-semibold">Explora por temporada</h2>
            <p className="mt-1 text-slate-500">Encuentra el disfraz perfecto para cada celebración</p>
          </div>
          <Link href="/productos" className="hidden text-sm font-medium text-happy-600 hover:underline md:inline">
            Ver todas las categorías →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {CATS_HERO.map((c) => (
            <Link key={c.slug} href={`/categoria/${c.slug}`}>
              <Card className="group flex aspect-square flex-col items-center justify-center gap-2 transition hover:-translate-y-1 hover:shadow-glow">
                <div className="text-4xl transition group-hover:scale-110">{c.emoji}</div>
                <span className="text-sm font-medium">{c.label}</span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* DESTACADOS */}
      <section className="container px-4 pb-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold">Más vendidos esta semana 🔥</h2>
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
              const prod = (p as unknown as { productos: { id: string; nombre: string; imagen_principal_url: string | null; productos_variantes: { precio_publico: number | null }[] } }).productos;
              const min = prod.productos_variantes.map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0).sort((a, b) => a - b)[0];
              return (
                <Link key={p.producto_id} href={`/productos/${p.slug}`} className="group">
                  <Card className="overflow-hidden transition hover:-translate-y-1 hover:shadow-glow">
                    <div className="relative aspect-square overflow-hidden bg-slate-100">
                      {prod.imagen_principal_url ? (
                        <Image src={prod.imagen_principal_url} alt={prod.nombre} fill className="object-cover transition group-hover:scale-105" sizes="(max-width: 768px) 100vw, 25vw" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-5xl">🎭</div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-medium leading-tight">{p.titulo_web ?? prod.nombre}</h3>
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
      <section className="bg-gradient-to-r from-happy-500 via-carnival-pink to-carnival-purple py-14 text-white">
        <div className="container px-4 text-center">
          <h2 className="font-display text-3xl font-semibold">¿Compra al por mayor o personalizada?</h2>
          <p className="mt-2 opacity-90">Hablemos por WhatsApp — atención directa con nuestro equipo</p>
          <a href="https://wa.me/51916856842" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-happy-600 shadow-lg transition hover:scale-105">
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
      <p className="font-display text-lg font-semibold">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
