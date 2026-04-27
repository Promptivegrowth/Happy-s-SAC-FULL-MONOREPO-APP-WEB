import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Sparkles, ArrowRight } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { loadPublicaciones } from '@/server/queries/publicaciones';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const sb = await createClient();
    const { data } = await sb
      .from('categorias')
      .select('nombre, seo_titulo, seo_descripcion')
      .eq('slug', slug)
      .maybeSingle();
    return {
      title: data?.seo_titulo ?? data?.nombre ?? 'Categoría',
      description: data?.seo_descripcion,
    };
  } catch {
    return { title: 'Categoría' };
  }
}

export default async function CategoriaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let cat: {
    id: string;
    nombre: string;
    descripcion: string | null;
    icono: string | null;
    imagen_url: string | null;
  } | null = null;
  let camp: { id: string; nombre: string; slug: string | null } | null = null;

  try {
    const sb = await createClient();
    // Buscar categoría y campaña con el mismo slug en paralelo
    const [{ data: catData }, { data: campData }] = await Promise.all([
      sb
        .from('categorias')
        .select('id, nombre, descripcion, icono, imagen_url, activo')
        .eq('slug', slug)
        .eq('activo', true)
        .maybeSingle(),
      sb.from('campanas').select('id, nombre, slug').eq('slug', slug).eq('activa', true).maybeSingle(),
    ]);
    cat = catData;
    camp = campData;
  } catch (e) {
    console.warn('[categoria] error:', (e as Error).message);
  }

  if (!cat) {
    // Si no hay categoría pero sí campaña con ese slug → redirigir mentalmente
    if (camp) {
      const { redirect } = await import('next/navigation');
      redirect(`/campanias/${slug}`);
    }
    notFound();
  }

  // Cargar productos de la categoría + (si hay campaña con mismo nombre) productos de la campaña
  const [pubsCategoria, pubsCampania] = await Promise.all([
    loadPublicaciones({ categoriaId: cat.id, limit: 60 }),
    camp ? loadPublicaciones({ campanaId: camp.id, limit: 60 }) : Promise.resolve([]),
  ]);

  // Mergear quitando duplicados (por slug)
  const slugsCategoria = new Set(pubsCategoria.map((p) => p.slug).filter(Boolean));
  const pubsCampaniaUnicos = pubsCampania.filter((p) => !slugsCategoria.has(p.slug));
  const pubs = [...pubsCategoria, ...pubsCampaniaUnicos];

  return (
    <div className="container px-4 py-10">
      <header className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-happy-100 text-3xl">
          {cat.icono ?? '🎭'}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-4xl font-semibold text-corp-900">{cat.nombre}</h1>
          {cat.descripcion && <p className="mt-1 text-slate-500">{cat.descripcion}</p>}
        </div>
      </header>

      {camp && (
        <Link
          href={`/campanias/${camp.slug ?? slug}`}
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border-2 border-happy-300 bg-gradient-to-r from-happy-50 to-corp-50 px-5 py-3 transition hover:shadow-glow"
        >
          <div className="flex items-center gap-3">
            <Badge className="bg-happy-500 hover:bg-happy-500">
              <Sparkles className="mr-1 h-3 w-3" /> Campaña activa
            </Badge>
            <span className="text-sm font-medium text-corp-900">
              {camp.nombre} · ver todos los productos en campaña
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-corp-700" />
        </Link>
      )}

      {pubs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Sin productos publicados en esta categoría aún.
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {pubs.length} producto{pubs.length === 1 ? '' : 's'}
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pubs.map((p, i) => (
              <ProductCard key={p.slug ?? i} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
