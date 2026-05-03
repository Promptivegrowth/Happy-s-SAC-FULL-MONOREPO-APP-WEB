import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Card } from '@happy/ui/card';
import { Star, Truck, ShieldCheck, RefreshCcw, Award, MessageCircle } from 'lucide-react';
import { ProductoDetalleClient } from './detalle-client';
import { TrustBadges } from '@/components/trust-badges';
import { EnvioTimeline } from '@/components/envio-timeline';
import { ResenasSection, type ResenaItem } from '@/components/resenas-section';
import { ProductCard, type ProductCardData } from '@/components/product-card';
import { BLUR_DATA_URL } from '@/lib/image';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const sb = await createClient();
    const { data } = await sb
      .from('productos_publicacion')
      .select('titulo_web, descripcion_corta, productos(nombre)')
      .eq('slug', slug)
      .maybeSingle();
    const prod = (data as unknown as { productos: { nombre: string } } | null)?.productos;
    return {
      title: data?.titulo_web ?? prod?.nombre ?? 'Producto',
      description: data?.descripcion_corta ?? '',
    };
  } catch {
    return { title: 'Producto' };
  }
}

type ProductoDetalle = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  imagen_principal_url: string | null;
  piezas_descripcion: string | null;
  genero: string | null;
  categoria_id: string | null;
  categoria?: { nombre: string; slug: string };
  productos_variantes: {
    id: string;
    sku: string;
    talla: string;
    precio_publico: number | null;
    precio_mayorista_a: number | null;
    precio_mayorista_b: number | null;
    imagen_url: string | null;
  }[];
  productos_imagenes: { id: string; url: string; orden: number; alt_texto: string | null }[];
};

export default async function ProductoDetallePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await createClient();

  // Query principal: necesitamos el producto_id + categoria_id antes de poder
  // disparar las queries dependientes (rating, reseñas, relacionados).
  const { data: pub } = await sb
    .from('productos_publicacion')
    .select(
      `
      *,
      productos!inner(
        id, codigo, nombre, descripcion, imagen_principal_url, piezas_descripcion, genero, categoria_id,
        categoria:categorias!productos_categoria_id_fkey(nombre, slug),
        productos_variantes(id, sku, talla, precio_publico, precio_mayorista_a, precio_mayorista_b, imagen_url),
        productos_imagenes(id, url, orden, alt_texto)
      )
    `,
    )
    .eq('slug', slug)
    .eq('publicado', true)
    .maybeSingle();

  if (!pub) notFound();
  const prod = (pub as unknown as { productos: ProductoDetalle }).productos;

  // Disparar las queries dependientes EN PARALELO (rating, reseñas, relacionados, stock).
  const varianteIds = prod.productos_variantes.map((v) => v.id);
  const [{ data: rating }, { data: resenasData }, { data: relData }, { data: stocksData }] = await Promise.all([
    sb
      .from('v_productos_rating')
      .select('total_resenas, promedio_rating')
      .eq('producto_id', prod.id)
      .maybeSingle(),
    sb
      .from('productos_resenas')
      .select('id, autor_nombre, puntuacion, titulo, comentario, verificado, created_at')
      .eq('producto_id', prod.id)
      .eq('aprobada', true)
      .order('created_at', { ascending: false })
      .limit(10),
    prod.categoria_id
      ? sb
          .from('productos_publicacion')
          .select(
            'producto_id, slug, titulo_web, precio_oferta, etiquetas, productos!inner(id, nombre, imagen_principal_url, categoria_id, productos_variantes(precio_publico))',
          )
          .eq('publicado', true)
          .eq('productos.categoria_id', prod.categoria_id)
          .neq('producto_id', prod.id)
          .limit(8)
      : Promise.resolve({ data: [] as never[] }),
    varianteIds.length > 0
      ? sb
          .from('v_stock_variante_total')
          .select('variante_id, stock_total')
          .in('variante_id', varianteIds)
      : Promise.resolve({ data: [] as { variante_id: string; stock_total: number }[] }),
  ]);

  const stockMap = new Map<string, number>();
  for (const s of stocksData ?? []) {
    stockMap.set(s.variante_id as string, Number(s.stock_total ?? 0));
  }
  const stockTotal = Array.from(stockMap.values()).reduce((a, b) => a + b, 0);
  const agotado = stockTotal <= 0;

  const galeria = [
    prod.imagen_principal_url,
    ...prod.productos_imagenes.sort((a, b) => a.orden - b.orden).map((i) => i.url),
  ].filter(Boolean) as string[];

  const precios = prod.productos_variantes.map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0);
  const precioBase = precios.length ? Math.min(...precios) : 0;
  const precioOferta = pub.precio_oferta ? Number(pub.precio_oferta) : null;
  const descuentoPct: number = pub.descuento_porcentaje ?? 0;
  const tallasExcluidasDescuento: Set<string> = new Set(pub.descuento_excluir_tallas ?? []);

  const totalResenas = rating?.total_resenas ?? 0;
  const promedioRating = rating?.promedio_rating ? Number(rating.promedio_rating) : 0;

  const resenas: ResenaItem[] = (resenasData ?? []).map((r) => ({
    id: r.id,
    autor: r.autor_nombre ?? 'Cliente',
    rating: r.puntuacion,
    titulo: r.titulo,
    comentario: r.comentario,
    verificado: !!(r as unknown as { verificado: boolean }).verificado,
    fecha: new Date(r.created_at as string).toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' }),
  }));

  const relacionados: ProductCardData[] = ((relData ?? []) as unknown as Array<{
    producto_id: string;
    slug: string | null;
    titulo_web: string | null;
    precio_oferta: number | null;
    etiquetas: string[] | null;
    productos: {
      nombre: string;
      imagen_principal_url: string | null;
      productos_variantes: { precio_publico: number | null }[];
    };
  }>).map((r) => {
    const preciosRel = (r.productos.productos_variantes ?? [])
      .map((v) => Number(v.precio_publico ?? 0))
      .filter((x) => x > 0);
    return {
      slug: r.slug,
      titulo: r.titulo_web ?? r.productos.nombre,
      imagen: r.productos.imagen_principal_url,
      precio: preciosRel.length ? Math.min(...preciosRel) : null,
      precioOferta: r.precio_oferta ? Number(r.precio_oferta) : null,
      etiquetas: r.etiquetas,
    };
  });

  return (
    <article className="container px-4 py-10">
      <nav className="mb-6 text-sm text-slate-500">
        <Link href="/" className="hover:text-happy-600">Inicio</Link>
        <span className="mx-2">/</span>
        {prod.categoria && (
          <>
            <Link href={`/categoria/${prod.categoria.slug}`} className="hover:text-happy-600">
              {prod.categoria.nombre}
            </Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-slate-900">{prod.nombre}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Galería */}
        <div className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl border bg-slate-50">
            {galeria[0] ? (
              <Image
                src={galeria[0]}
                alt={prod.nombre}
                fill
                className="object-cover"
                sizes="(max-width:1024px) 100vw, 50vw"
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
                priority
              />
            ) : (
              <div className="flex h-full items-center justify-center text-7xl">🎭</div>
            )}
            {precioOferta && precioBase > 0 && (
              <Badge className="absolute right-3 top-3 bg-danger px-3 py-1.5 text-sm font-bold hover:bg-danger">
                -{Math.round((1 - precioOferta / precioBase) * 100)}%
              </Badge>
            )}
          </div>
          {galeria.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {galeria.slice(1, 5).map((g, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border bg-slate-50">
                  <Image
                    src={g}
                    alt={`${prod.nombre} foto ${i + 2}`}
                    fill
                    className="object-cover"
                    sizes="(max-width:1024px) 25vw, 12vw"
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info + cliente */}
        <div className="space-y-5">
          {pub.etiquetas?.length ? (
            <div className="flex flex-wrap gap-1">
              {pub.etiquetas.map((t: string) => (
                <Badge key={t} variant="default" className="bg-corp-700">{t}</Badge>
              ))}
            </div>
          ) : null}

          <div>
            <h1 className="font-display text-3xl font-semibold leading-tight text-corp-900 sm:text-4xl">
              {pub.titulo_web ?? prod.nombre}
            </h1>
            <p className="mt-1 text-xs text-slate-400">SKU base: {prod.codigo}</p>
          </div>

          {/* Rating */}
          <Link href="#resenas" className="flex items-center gap-2 text-sm">
            <div className="flex">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${i <= Math.round(promedioRating) && totalResenas > 0 ? 'fill-happy-500 text-happy-500' : 'text-slate-300'}`}
                />
              ))}
            </div>
            <span className="text-slate-600 hover:underline">
              {totalResenas === 0 ? 'Sé el primero en escribir una reseña' : `${promedioRating.toFixed(1)} · ${totalResenas} reseña${totalResenas === 1 ? '' : 's'}`}
            </span>
          </Link>

          {pub.descripcion_corta && <p className="text-slate-600">{pub.descripcion_corta}</p>}
          {prod.piezas_descripcion && (
            <div className="rounded-lg border bg-corp-50/40 p-3 text-sm">
              <strong className="text-corp-900">Incluye: </strong>
              <span className="text-slate-700">{prod.piezas_descripcion}</span>
            </div>
          )}

          <ProductoDetalleClient
            productoId={prod.id}
            nombre={pub.titulo_web ?? prod.nombre}
            imagen={prod.imagen_principal_url}
            precioOferta={precioOferta}
            descuentoPorcentaje={descuentoPct}
            variantes={prod.productos_variantes.map((v) => {
              const precio = Number(v.precio_publico ?? 0);
              const aplicaDescuento = descuentoPct > 0 && !tallasExcluidasDescuento.has(v.talla);
              return {
                id: v.id,
                sku: v.sku,
                talla: v.talla,
                precio,
                precioConDescuento: aplicaDescuento
                  ? Math.round(precio * (1 - descuentoPct / 100) * 100) / 100
                  : precio,
                aplicaDescuento,
                precioMayorista: Number(v.precio_mayorista_a ?? v.precio_mayorista_b ?? 0),
                stock: stockMap.get(v.id) ?? 0,
              };
            })}
            stockTotal={stockTotal}
            agotado={agotado}
          />

          <TrustBadges />

          <EnvioTimeline />

          <div className="grid grid-cols-2 gap-3 border-t pt-4 text-xs text-slate-600 sm:grid-cols-4">
            <Garantia icon={<Truck className="h-5 w-5" />} label="Envío rápido" sub="2-4 días" />
            <Garantia icon={<ShieldCheck className="h-5 w-5" />} label="Pago seguro" sub="Encriptado SSL" />
            <Garantia icon={<RefreshCcw className="h-5 w-5" />} label="Cambios fáciles" sub="7 días para cambio" />
            <Garantia icon={<Award className="h-5 w-5" />} label="Calidad premium" sub="Confección propia" />
          </div>
        </div>
      </div>

      {/* Descripción larga */}
      {pub.descripcion_larga && (
        <section className="prose prose-sm mt-16 max-w-3xl border-t pt-12">
          <h2 className="font-display text-2xl font-semibold text-corp-900">Descripción</h2>
          <div dangerouslySetInnerHTML={{ __html: pub.descripcion_larga }} />
        </section>
      )}

      {/* Productos relacionados */}
      {relacionados.length > 0 && (
        <section className="mt-16 border-t pt-12">
          <h2 className="mb-8 text-center font-display text-2xl font-semibold text-corp-900">
            También podría interesarte
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {relacionados.slice(0, 4).map((r, i) => (
              <ProductCard key={i} p={r} />
            ))}
          </div>
        </section>
      )}

      {/* Reseñas */}
      <div id="resenas">
        <ResenasSection
          productoId={prod.id}
          resenas={resenas}
          promedio={promedioRating}
          total={totalResenas}
        />
      </div>

      {/* CTA WhatsApp final */}
      <section className="mt-16 rounded-2xl bg-corp-gradient p-8 text-center text-white">
        <h2 className="font-display text-2xl font-semibold">¿Tienes dudas sobre este disfraz?</h2>
        <p className="mt-2 text-white/90">Te asesoramos por WhatsApp en minutos</p>
        <a
          href="https://wa.me/51916856842"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3 font-semibold shadow-xl transition hover:scale-105 hover:bg-emerald-400"
        >
          <MessageCircle className="h-5 w-5" />
          Chatear con un asesor
        </a>
      </section>
    </article>
  );
}

function Garantia({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 border-corp-100 p-3 text-center">
      <span className="text-corp-700">{icon}</span>
      <p className="font-medium text-corp-900">{label}</p>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </Card>
  );
}
