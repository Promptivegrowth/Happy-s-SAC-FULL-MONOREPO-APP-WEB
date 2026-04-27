import { notFound } from 'next/navigation';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { ProductCard, type ProductCardData } from '@/components/product-card';
import { loadPublicaciones } from '@/server/queries/publicaciones';
import { Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

const GRUPOS: Record<string, { label: string; descripcion: string; emoji: string; generos: string[] | null }> = {
  ninos:      { label: 'Disfraces de Niño',     descripcion: 'Modelos pensados para varones de 0 a 14 años', emoji: '👦', generos: ['NINO', 'UNISEX'] },
  ninas:      { label: 'Disfraces de Niña',     descripcion: 'Modelos pensados para niñas de 0 a 14 años',   emoji: '👧', generos: ['NINA', 'UNISEX'] },
  adultos:    { label: 'Disfraces de Adultos',  descripcion: 'Para hombres, mujeres y eventos profesionales', emoji: '🧑', generos: ['MUJER', 'HOMBRE'] },
  accesorios: { label: 'Accesorios',            descripcion: 'Coronas, vinchas, pelucas, alitas y más complementos', emoji: '🎀', generos: null },
};

export async function generateMetadata({ params }: { params: Promise<{ grupo: string }> }) {
  const { grupo } = await params;
  const def = GRUPOS[grupo];
  return { title: def?.label ?? 'Disfraces' };
}

export default async function GrupoPage({
  params,
  searchParams,
}: {
  params: Promise<{ grupo: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { grupo } = await params;
  const sp = await searchParams;
  const def = GRUPOS[grupo];
  if (!def) notFound();

  const sb = await createClient();

  // Cargar publicaciones aplicando filtro de género en BD para minimizar dataset.
  // Para "accesorios" filtramos por categoría con código ACC.
  let pubs: ProductCardData[] = [];
  if (grupo === 'accesorios') {
    const { data: cat } = await sb.from('categorias').select('id').eq('codigo', 'ACC').maybeSingle();
    pubs = cat ? await loadPublicaciones({ categoriaId: cat.id, limit: 120, q: sp.q }) : [];
  } else {
    // loadPublicaciones no filtra por género, lo hacemos directo aquí
    const all = await loadPublicaciones({ limit: 200, q: sp.q });
    // Necesitamos el género de cada producto: una segunda query corta
    const slugs = all
      .map((p) => p.slug)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
    if (slugs.length === 0) {
      pubs = [];
    } else {
      const { data: gens } = await sb
        .from('productos_publicacion')
        .select('slug, productos(genero)')
        .in('slug', slugs);
      const generosPorSlug = new Map<string, string | null>();
      for (const g of gens ?? []) {
        const prod = (g as unknown as { productos?: { genero: string | null } | null }).productos;
        if (typeof g.slug === 'string') {
          generosPorSlug.set(g.slug, prod?.genero ?? null);
        }
      }
      pubs = all.filter((p) => {
        if (!p.slug) return false;
        const g = generosPorSlug.get(p.slug);
        if (def.generos === null) return true;
        // Sin género asignado o género incluido en el grupo
        return g == null || def.generos.includes(g);
      });
    }
  }

  return (
    <div>
      {/* Header del grupo con imagen de fondo sutil */}
      <section className="bg-gradient-to-br from-corp-50 via-white to-happy-50 py-10">
        <div className="container px-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <a href="/" className="hover:text-happy-600">Inicio</a>
            <span>›</span>
            <span className="text-slate-900">{def.label}</span>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-5xl">{def.emoji}</div>
            <div className="flex-1">
              <h1 className="font-display text-4xl font-semibold text-corp-900 sm:text-5xl">{def.label}</h1>
              <p className="mt-1 text-slate-600">{def.descripcion}</p>
            </div>
            <form className="hidden max-w-sm flex-1 sm:block">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input name="q" defaultValue={sp.q ?? ''} placeholder="Buscar disfraz…" className="h-11 pl-9" />
              </div>
            </form>
          </div>
        </div>
      </section>

      <div className="container px-4 py-8">
        {pubs.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">
            {sp.q
              ? `Sin resultados para "${sp.q}".`
              : `Aún no hay productos publicados en ${def.label.toLowerCase()}. Pronto agregaremos más.`}
          </Card>
        ) : (
          <>
            <p className="mb-4 text-sm text-slate-500">
              {pubs.length} producto{pubs.length === 1 ? '' : 's'} disponible{pubs.length === 1 ? '' : 's'}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {pubs.map((p, i) => (
                <ProductCard key={p.slug ?? i} p={p} priority={i < 4} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
