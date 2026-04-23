import Link from 'next/link';
import Image from 'next/image';
import { unstable_cache } from 'next/cache';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';

export const metadata = { title: 'Catálogo de disfraces' };
export const dynamic = 'force-dynamic';

const loadCatalogo = unstable_cache(
  async (q: string) => {
    const sb = await createClient();
    let query = sb.from('productos_publicacion')
      .select('producto_id, slug, titulo_web, precio_oferta, productos!inner(id, nombre, imagen_principal_url, productos_variantes(id, talla, precio_publico))')
      .eq('publicado', true)
      .order('orden_web')
      .limit(60);
    if (q) query = query.ilike('titulo_web', `%${q}%`);
    const { data } = await query;
    return data ?? [];
  },
  ['catalogo'],
  { revalidate: 300, tags: ['catalogo'] },
);

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const pubs = await loadCatalogo(sp.q ?? '');

  return (
    <div className="container px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-4xl font-semibold text-corp-900">Catálogo</h1>
        <p className="mt-1 text-slate-500">Encuentra el disfraz perfecto · Niños y adultos · 11 tallas</p>
      </header>

      {pubs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          No hay productos publicados aún. Desde el ERP en /web-catalogo activa “Publicar en web”.
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pubs.map((p) => {
            const prod = (p as unknown as { productos: { id: string; nombre: string; imagen_principal_url: string | null; productos_variantes: { talla: string; precio_publico: number | null }[] } }).productos;
            const min = prod.productos_variantes.map((v) => Number(v.precio_publico ?? 0)).filter((x) => x > 0).sort((a, b) => a - b)[0];
            const tallas = Array.from(new Set(prod.productos_variantes.map((v) => v.talla.replace('T', '')))).slice(0, 6);
            return (
              <Link key={p.producto_id} href={`/productos/${p.slug}`} className="group">
                <Card className="overflow-hidden border-2 border-transparent transition hover:-translate-y-1 hover:border-happy-300 hover:shadow-glow">
                  <div className="relative aspect-square overflow-hidden bg-corp-50">
                    {prod.imagen_principal_url ? (
                      <Image src={prod.imagen_principal_url} alt={prod.nombre} fill className="object-cover transition group-hover:scale-105" sizes="(max-width: 768px) 100vw, 25vw" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-5xl">🎭</div>
                    )}
                    {p.precio_oferta && <Badge variant="destructive" className="absolute left-2 top-2">Oferta</Badge>}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 font-medium leading-tight text-corp-900">{p.titulo_web ?? prod.nombre}</h3>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tallas.map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                    </div>
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
    </div>
  );
}
