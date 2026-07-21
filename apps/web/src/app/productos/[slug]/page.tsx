import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { Star, MessageCircle } from 'lucide-react';
import { ProductoDetalleClient } from './detalle-client';
import { TrustBadges } from '@/components/trust-badges';
import { EnvioTimeline } from '@/components/envio-timeline';
import { ResenasSection, type ResenaItem } from '@/components/resenas-section';
import { ProductCard, type ProductCardData } from '@/components/product-card';
import { WHATSAPP_NUMERO, WHATSAPP_NUMERO_HUMAN, CORREO_CONTACTO } from '@/lib/contacto';
import { TablaMedidas, type MedidaFila } from '@/components/tabla-medidas';
import { ordenTalla } from '@happy/lib';
import { GaleriaProducto } from '@/components/galeria-producto';
import { DescripcionFormateada } from '@/components/descripcion-formateada';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const sb = await createClient();
    const { data } = await sb
      .from('productos_publicacion')
      .select('titulo_web, descripcion_corta, seo_titulo, seo_descripcion, palabras_clave, productos(nombre)')
      .eq('slug', slug)
      .maybeSingle();
    type Pub = {
      titulo_web: string | null;
      descripcion_corta: string | null;
      seo_titulo: string | null;
      seo_descripcion: string | null;
      palabras_clave: string | null;
      productos: { nombre: string } | null;
    };
    const d = data as unknown as Pub | null;
    const prodNombre = d?.productos?.nombre ?? 'Producto';
    // Prioridad: seo_titulo (cargado por el gerente para SEO) > titulo_web > nombre
    const title = d?.seo_titulo ?? d?.titulo_web ?? prodNombre;
    // Prioridad: seo_descripcion > descripcion_corta
    const description = d?.seo_descripcion ?? d?.descripcion_corta ?? '';
    // palabras_clave: viene como string separado por comas — pasamos como meta keywords
    const keywords = d?.palabras_clave
      ? d.palabras_clave.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    return {
      title,
      description,
      ...(keywords && keywords.length > 0 ? { keywords } : {}),
      openGraph: {
        title,
        description,
        type: 'website',
      },
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
  familia_id: string | null;
  color_variante: string | null;
  categoria?: { nombre: string; slug: string };
  productos_variantes: {
    id: string;
    sku: string;
    talla: string;
    precio_publico: number | null;
    precio_mayorista_a: number | null;
    precio_mayorista_b: number | null;
    precio_industrial: number | null;
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
        id, codigo, nombre, descripcion, imagen_principal_url, piezas_descripcion, genero, categoria_id, familia_id, color_variante,
        categoria:categorias!productos_categoria_id_fkey(nombre, slug),
        productos_variantes(id, sku, talla, precio_publico, precio_mayorista_a, precio_mayorista_b, precio_industrial, imagen_url),
        productos_imagenes(id, url, orden, alt_texto)
      )
    `,
    )
    .eq('slug', slug)
    .eq('publicado', true)
    .maybeSingle();

  if (!pub) notFound();
  const prod = (pub as unknown as { productos: ProductoDetalle }).productos;

  // Disparar las queries dependientes EN PARALELO (rating, reseñas, relacionados, stock, colores de familia).
  const varianteIds = prod.productos_variantes.map((v) => v.id);
  const [{ data: rating }, { data: resenasData }, { data: relData }, { data: stocksData }, { data: familiaData }] = await Promise.all([
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
    // Stock SOLO del almacén La Quinta (regla de negocio confirmada
    // 2026-07-10/12). OJO: NO consultar stock_actual/almacenes directo —
    // esas tablas tienen RLS que bloquea al rol anon de la web y la query
    // devolvía 0 filas (todo aparecía "agotado", bug grave del 07-12).
    // La vista v_stock_variante_web (mig 63) agrega el stock de TDA-LQ y
    // tiene GRANT para anon.
    varianteIds.length > 0
      ? (sb as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              in: (c: string, v: string[]) => PromiseLike<{ data: { variante_id: string; stock_total: number }[] | null }>;
            };
          };
        })
          .from('v_stock_variante_web')
          .select('variante_id, stock_total')
          .in('variante_id', varianteIds)
      : Promise.resolve({ data: [] as { variante_id: string; stock_total: number }[] }),
    // Colores hermanos de la familia (mig 65): otros productos publicados
    // con el mismo familia_id. Cada color es SU propio producto/publicación;
    // acá solo armamos el selector de color que navega entre ellos.
    prod.familia_id
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sb as unknown as { from: (t: string) => any })
          .from('productos_publicacion')
          .select('producto_id, slug, publicado, productos!inner(id, nombre, color_variante, imagen_principal_url, familia_id)')
          .eq('publicado', true)
          .eq('productos.familia_id', prod.familia_id)
          .limit(30)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Selector de color: solo tiene sentido si hay 2+ colores publicados.
  type FamiliaRow = {
    producto_id: string;
    slug: string | null;
    productos: { nombre: string; color_variante: string | null; imagen_principal_url: string | null } | null;
  };
  const coloresFamilia = ((familiaData ?? []) as FamiliaRow[])
    .filter((f) => f.slug && f.productos)
    .map((f) => ({
      productoId: f.producto_id,
      slug: f.slug as string,
      etiqueta: f.productos!.color_variante?.trim() || f.productos!.nombre,
      imagen: f.productos!.imagen_principal_url,
      actual: f.producto_id === prod.id,
    }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const stockMap = new Map<string, number>();
  for (const s of stocksData ?? []) {
    // Normalizar: query nueva devuelve `cantidad`, la vieja `stock_total`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cant = Number((s as any).cantidad ?? (s as any).stock_total ?? 0);
    stockMap.set((s as { variante_id: string }).variante_id, Math.max(0, cant));
  }

  // Cargar medidas de la ficha técnica vigente para la tabla desplegable
  // Cliente pidió (post-2026-07-08): botón "Tabla de medidas" con datos
  // por talla. Si no hay ficha vigente, el botón no se muestra (queda [] ).
  let medidasFilas: MedidaFila[] = [];
  try {
    const { data: fichaVigente } = await sb
      .from('productos_fichas_tecnicas')
      .select('id')
      .eq('producto_id', prod.id)
      .eq('vigente', true)
      .order('revision', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fichaVigente?.id) {
      const { data: meds } = await sb
        .from('fichas_medidas')
        .select('id, codigo, descripcion, tolerancia_cm, orden, valores:fichas_medidas_valores(talla, valor)')
        .eq('ficha_id', fichaVigente.id)
        .order('orden');
      type M = {
        id: string; codigo: string | null; descripcion: string;
        tolerancia_cm: number | null;
        valores: { talla: string; valor: string | number | null }[] | null;
      };
      medidasFilas = ((meds ?? []) as unknown as M[]).map((m) => {
        const map: Record<string, string> = {};
        for (const v of m.valores ?? []) {
          if (v.valor != null && v.valor !== '') map[v.talla] = String(v.valor);
        }
        return {
          descripcion: m.descripcion,
          codigo: m.codigo,
          tolerancia_cm: m.tolerancia_cm != null ? Number(m.tolerancia_cm) : null,
          valoresPorTalla: map,
        };
      });
      // Solo filas con al menos un valor cargado. Si el cliente definió las
      // medidas en la ficha pero aún no guardó los números por talla, antes
      // salía un cuadro lleno de "–" (reporte 20/07/2026). Sin valores no
      // hay fila; sin filas no hay botón.
      medidasFilas = medidasFilas.filter((m) => Object.keys(m.valoresPorTalla).length > 0);
    }
  } catch {
    /* si falla, medidasFilas queda vacío y el botón no aparece */
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
        {/* Galería con zoom (cliente pidió lightbox al hacer click) */}
        <GaleriaProducto
          imagenes={galeria}
          nombre={pub.titulo_web ?? prod.nombre}
          descuentoBadge={
            precioOferta && precioBase > 0
              ? `-${Math.round((1 - precioOferta / precioBase) * 100)}%`
              : null
          }
        />

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

          {/* Selector de color (familia de producto, mig 65). Cada chip
              navega a la publicación del color hermano. */}
          {coloresFamilia.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-medium text-corp-900">
                Color:{' '}
                <span className="font-semibold text-happy-600">
                  {coloresFamilia.find((c) => c.actual)?.etiqueta ?? prod.color_variante ?? ''}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {coloresFamilia.map((c) => (
                  <Link
                    key={c.productoId}
                    href={`/productos/${c.slug}`}
                    className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${
                      c.actual
                        ? 'border-happy-500 bg-happy-50 font-semibold text-happy-700 ring-1 ring-happy-500'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-happy-400 hover:bg-happy-50'
                    }`}
                    aria-current={c.actual ? 'page' : undefined}
                  >
                    {c.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.imagen}
                        alt={c.etiqueta}
                        className="h-7 w-7 rounded-full border object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs">🎭</span>
                    )}
                    {c.etiqueta}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <ProductoDetalleClient
            productoId={prod.id}
            nombre={pub.titulo_web ?? prod.nombre}
            imagen={prod.imagen_principal_url}
            precioOferta={precioOferta}
            descuentoPorcentaje={descuentoPct}
            variantes={[...prod.productos_variantes].sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla)).map((v) => {
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
                precioMayorista: Number(v.precio_mayorista_a ?? 0),
                // Precio de fábrica (>= 100 unid.): precio_industrial, el MISMO
                // campo que usa el POS para su escalón industrial — el cliente
                // carga sus precios ahí. precio_mayorista_b queda de fallback
                // por si algún producto viejo solo tiene ese. Si ambos están
                // vacíos queda 0 y el escalón cae a mayorista (reporte 20/07/2026:
                // el carrito con 116 und seguía cobrando mayorista porque
                // mayorista_b estaba vacío en todas las faldas).
                precioFabrica: Number(v.precio_industrial ?? 0) > 0
                  ? Number(v.precio_industrial)
                  : Number(v.precio_mayorista_b ?? 0),
                stock: stockMap.get(v.id) ?? 0,
              };
            })}
            stockTotal={stockTotal}
            agotado={agotado}
          />

          {medidasFilas.length > 0 && (
            <TablaMedidas
              medidas={medidasFilas}
              // Orden lógico de tallas (2, 4, 6… S, AD) — sin ordenar salían
              // como vinieran de la BD: "10, 12, 14, 2, 4, 6, 8".
              tallas={Array.from(new Set(prod.productos_variantes.map((v) => v.talla))).sort(
                (a, b) => ordenTalla(a) - ordenTalla(b),
              )}
            />
          )}

          <TrustBadges />

          <EnvioTimeline />

          {/* Bloque "Envío rápido / Pago seguro / Cambios fáciles / Calidad
              premium" removido por pedido del cliente (post-2026-07-08).
              Se consideró información redundante con TrustBadges + EnvioTimeline. */}
        </div>
      </div>

      {/* Descripción larga — con formato automático (secciones, alertas, párrafos) */}
      {pub.descripcion_larga && (
        <section className="mt-16 max-w-3xl border-t pt-12">
          <h2 className="mb-5 font-display text-2xl font-semibold text-corp-900">Descripción</h2>
          <DescripcionFormateada texto={pub.descripcion_larga} />
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
          href="https://wa.me/51903064120"
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

