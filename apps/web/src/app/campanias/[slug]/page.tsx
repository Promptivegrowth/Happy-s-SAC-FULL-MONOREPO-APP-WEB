import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Calendar, Sparkles } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { loadPublicaciones } from '@/server/queries/publicaciones';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const sb = await createClient();
    const { data } = await sb.from('campanas').select('nombre, descripcion').eq('slug', slug).maybeSingle();
    return {
      title: data?.nombre ?? 'Campaña',
      description: data?.descripcion ?? undefined,
    };
  } catch {
    return { title: 'Campaña' };
  }
}

export default async function CampaniaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let camp: {
    id: string;
    codigo: string;
    nombre: string;
    descripcion: string | null;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    banner_url: string | null;
    imagen_url: string | null;
    activa: boolean;
  } | null = null;

  try {
    const sb = await createClient();
    const { data } = await sb
      .from('campanas')
      .select('id, codigo, nombre, descripcion, fecha_inicio, fecha_fin, banner_url, imagen_url, activa')
      .eq('slug', slug)
      .maybeSingle();
    camp = data;
  } catch (e) {
    console.warn('[campania] error:', (e as Error).message);
  }
  if (!camp) notFound();

  const pubs = await loadPublicaciones({ campanaId: camp.id, limit: 60 });
  const banner = camp.banner_url ?? camp.imagen_url;

  function fmt(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
  }

  return (
    <>
      {/* Hero de la campaña */}
      <section className="relative overflow-hidden bg-gradient-to-br from-happy-500 via-danger to-corp-700 text-white">
        {banner && (
          <Image
            src={banner}
            alt={camp.nombre}
            fill
            className="object-cover opacity-30"
            sizes="100vw"
            priority
          />
        )}
        <div className="container relative px-4 py-16 lg:py-24">
          <Badge className="mb-4 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30">
            <Sparkles className="mr-1 h-3 w-3" /> Campaña activa
          </Badge>
          <h1 className="font-display text-5xl font-semibold leading-tight md:text-6xl">{camp.nombre}</h1>
          {camp.descripcion && (
            <p className="mt-3 max-w-2xl text-lg text-white/90">{camp.descripcion}</p>
          )}
          {(camp.fecha_inicio || camp.fecha_fin) && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm backdrop-blur-sm">
              <Calendar className="h-4 w-4" />
              {camp.fecha_inicio && camp.fecha_fin
                ? `Del ${fmt(camp.fecha_inicio)} al ${fmt(camp.fecha_fin)}`
                : camp.fecha_fin
                  ? `Hasta el ${fmt(camp.fecha_fin)}`
                  : `Desde el ${fmt(camp.fecha_inicio)}`}
            </p>
          )}
        </div>
      </section>

      {/* Productos */}
      <div className="container px-4 py-12">
        {pubs.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">
            Aún no hay productos asignados a esta campaña. En el ERP, asigna productos a la campaña <strong>{camp.codigo}</strong> y publícalos.
          </Card>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-500">
              {pubs.length} producto{pubs.length === 1 ? '' : 's'} en esta campaña
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {pubs.map((p, i) => (
                <ProductCard key={p.slug ?? i} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
