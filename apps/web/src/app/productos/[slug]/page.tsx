import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@happy/db/server';
import { Badge } from '@happy/ui/badge';
import { ProductoDetalleClient } from './detalle-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await createClient();
  const { data } = await sb.from('productos_publicacion').select('titulo_web, descripcion_corta, productos(nombre)').eq('slug', slug).single();
  const prod = (data as unknown as { productos: { nombre: string } } | null)?.productos;
  return {
    title: data?.titulo_web ?? prod?.nombre ?? 'Producto',
    description: data?.descripcion_corta ?? '',
  };
}

export default async function ProductoDetallePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sb = await createClient();
  const { data: pub } = await sb.from('productos_publicacion')
    .select(`
      *,
      productos!inner(
        id, codigo, nombre, descripcion, imagen_principal_url, piezas_descripcion, genero,
        categoria:categorias(nombre, slug),
        productos_variantes(id, sku, talla, precio_publico, precio_mayorista_a, precio_mayorista_b, imagen_url),
        productos_imagenes(id, url, orden, alt_texto)
      )
    `)
    .eq('slug', slug)
    .eq('publicado', true)
    .single();

  if (!pub) notFound();
  const prod = (pub as unknown as {
    productos: {
      id: string; codigo: string; nombre: string; descripcion: string | null; imagen_principal_url: string | null;
      piezas_descripcion: string | null; genero: string | null;
      categoria?: { nombre: string; slug: string };
      productos_variantes: { id: string; sku: string; talla: string; precio_publico: number | null; precio_mayorista_a: number | null; precio_mayorista_b: number | null; imagen_url: string | null }[];
      productos_imagenes: { id: string; url: string; orden: number; alt_texto: string | null }[];
    };
  }).productos;

  const galeria = [
    prod.imagen_principal_url,
    ...prod.productos_imagenes.sort((a, b) => a.orden - b.orden).map((i) => i.url),
  ].filter(Boolean) as string[];

  return (
    <article className="container px-4 py-10">
      <nav className="mb-4 text-sm text-slate-500">
        <a href="/" className="hover:text-happy-600">Inicio</a>
        <span className="mx-2">/</span>
        {prod.categoria && <>
          <a href={`/categoria/${prod.categoria.slug}`} className="hover:text-happy-600">{prod.categoria.nombre}</a>
          <span className="mx-2">/</span>
        </>}
        <span className="text-slate-900">{prod.nombre}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Galería */}
        <div className="space-y-3">
          <div className="relative aspect-square overflow-hidden rounded-2xl border bg-slate-50">
            {galeria[0] ? (
              <Image src={galeria[0]} alt={prod.nombre} fill className="object-cover" sizes="(max-width:1024px) 100vw, 50vw" priority />
            ) : (
              <div className="flex h-full items-center justify-center text-7xl">🎭</div>
            )}
          </div>
          {galeria.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {galeria.slice(1, 5).map((g, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-lg border bg-slate-50">
                  <Image src={g} alt={`${prod.nombre} foto ${i + 2}`} fill className="object-cover" sizes="20vw" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info + cliente */}
        <div>
          {pub.etiquetas?.length ? (
            <div className="mb-3 flex flex-wrap gap-1">
              {pub.etiquetas.map((t: string) => <Badge key={t}>{t}</Badge>)}
            </div>
          ) : null}
          <h1 className="font-display text-3xl font-semibold leading-tight">{pub.titulo_web ?? prod.nombre}</h1>
          {pub.descripcion_corta && <p className="mt-2 text-slate-600">{pub.descripcion_corta}</p>}
          {prod.piezas_descripcion && (
            <p className="mt-3 rounded-lg border bg-slate-50 p-3 text-sm">
              <strong>Incluye: </strong>{prod.piezas_descripcion}
            </p>
          )}

          <ProductoDetalleClient
            productoId={prod.id}
            nombre={pub.titulo_web ?? prod.nombre}
            imagen={prod.imagen_principal_url}
            variantes={prod.productos_variantes.map((v) => ({
              id: v.id,
              sku: v.sku,
              talla: v.talla,
              precio: Number(v.precio_publico ?? 0),
              precioMayorista: Number(v.precio_mayorista_a ?? v.precio_mayorista_b ?? 0),
            }))}
          />

          {pub.descripcion_larga && (
            <div className="prose prose-sm mt-10 max-w-none">
              <h3>Descripción</h3>
              <div dangerouslySetInnerHTML={{ __html: pub.descripcion_larga }} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
