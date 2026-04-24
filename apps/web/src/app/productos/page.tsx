import { Card } from '@happy/ui/card';
import { Input } from '@happy/ui/input';
import { Search } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { loadPublicaciones } from '@/server/queries/publicaciones';

export const metadata = { title: 'Catálogo de disfraces' };
export const dynamic = 'force-dynamic';

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const pubs = await loadPublicaciones({ q });

  return (
    <div className="container px-4 py-10">
      <header className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold text-corp-900">Catálogo</h1>
          <p className="mt-1 text-slate-500">Encuentra el disfraz perfecto · Niños y adultos · 11 tallas</p>
        </div>
        <form className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={q} placeholder="Buscar disfraces…" className="h-11 pl-9" />
        </form>
      </header>

      {pubs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          {q ? `No hay productos para "${q}".` : 'No hay productos publicados aún.'}
        </Card>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500">
            {pubs.length} producto{pubs.length === 1 ? '' : 's'} disponibles
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
