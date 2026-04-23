import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const sb = await createClient();
    const { data } = await sb.from('categorias').select('nombre, seo_titulo, seo_descripcion').eq('slug', slug).maybeSingle();
    return { title: data?.seo_titulo ?? data?.nombre ?? 'Categoría', description: data?.seo_descripcion };
  } catch {
    return { title: 'Categoría' };
  }
}

type Pub = {
  producto_id: string;
  slug: string | null;
  titulo_web: string | null;
  productos?: {
    nombre: string;
    imagen_principal_url: string | null;
    productos_variantes?: { precio_publico: number | null }[];
  } | null;
};

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let cat: { id: string; nombre: string; descripcion: string | null; icono: string | null; imagen_url: string | null } | null = null;
  let pubs: Pub[] = [];

  try {
    const sb = await createClient();
    const { data } = await sb.from('categorias').select('id, nombre, descripcion, icono, imagen_url').eq('slug', slug).maybeSingle();
    cat = data;
    if (cat) {
      const { data: pubsData } = await sb.from('productos_publicacion')
        .select('producto_id, slug, titulo_web, productos!inner(id, nombre, imagen_principal_url, categoria_id, productos_variantes(precio_publico))')
        .eq('publicado', true)
        .eq('productos.categoria_id', cat.id)
        .order('orden_web')
        .limit(60);
      pubs = (pubsData ?? []) as unknown as Pub[];
    }
  } catch (e) {
    console.warn('[categoria] exception:', (e as Error).message);
  }

  if (!cat) notFound();

  return (
    <div className="container px-4 py-10">
      <header className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-happy-100 text-3xl">{cat.icono ?? '🎭'}</div>
        <div>
          <h1 className="font-display text-4xl font-semibold text-corp-900">{cat.nombre}</h1>
          {cat.descripcion && <p className="mt-1 text-slate-500">{cat.descripcion}</p>}
        </div>
      </header>

      {pubs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Sin productos publicados en esta categoría.
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pubs.map((p) => {
            const prod = p.productos;
            if (!prod) return null;
            const min = (prod.productos_variantes ?? []).map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0).sort((a, b) => a - b)[0];
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
                    <h3 className="line-clamp-2 font-medium text-corp-900">{p.titulo_web ?? prod.nombre}</h3>
                    <Badge variant="default" className="mt-2 text-xs">Desde S/ {(min ?? 0).toFixed(2)}</Badge>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
