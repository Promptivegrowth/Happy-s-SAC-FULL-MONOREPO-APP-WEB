import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@happy/db/server';
import { Card } from '@happy/ui/card';
import { Badge } from '@happy/ui/badge';
import { Calendar, Sparkles } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { loadPublicaciones } from '@/server/queries/publicaciones';
import { BLUR_DATA_URL } from '@/lib/image';
import { resolverEstilo, fondoCss, type EstiloCampana } from '@happy/lib/web/campana-estilo';

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
    estilo: EstiloCampana | null;
  } | null = null;

  try {
    const sb = await createClient();
    // Cast hasta regenerar tipos: `estilo` es de la mig 105.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as unknown as { from: (t: string) => any })
      .from('campanas')
      .select('id, codigo, nombre, descripcion, fecha_inicio, fecha_fin, banner_url, imagen_url, activa, estilo')
      .eq('slug', slug)
      .maybeSingle();
    camp = data;
  } catch (e) {
    console.warn('[campania] error:', (e as Error).message);
  }
  if (!camp) notFound();

  const pubs = await loadPublicaciones({ campanaId: camp.id, limit: 60 });
  const banner = camp.banner_url ?? camp.imagen_url;

  /*
   * El diseño lo decide quien carga la campaña en el ERP (mig 105): colores,
   * etiqueta, fechas, cómo va la foto. Lo que no se cargó sale como siempre.
   * La letra se oscurece sola sobre fondos claros, que con blanco no se leen.
   */
  const e = resolverEstilo(camp.estilo, camp.nombre);
  const colorLetra = e.textoOscuro ? '#1E1B4B' : '#FFFFFF';
  const pastilla = e.textoOscuro ? 'bg-black/10' : 'bg-white/20';

  function fmt(d: string | null) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' });
  }

  return (
    <>
      {/* Hero de la campaña */}
      <section
        className="relative overflow-hidden"
        style={{ background: fondoCss(e), color: colorLetra }}
      >
        {banner && (
          <>
            <Image
              src={banner}
              alt={camp.nombre}
              fill
              className={`object-cover ${e.imagenModo === 'suave' ? 'opacity-30' : ''}`}
              sizes="100vw"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              priority
            />
            {/*
              * Con la foto a pleno, un velo del color del fondo detrás del texto.
              * Sin él, el título queda encima de lo que haya en la foto y según
              * la imagen no se lee.
              */}
            {e.imagenModo === 'fondo' && (
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(90deg, ${e.colorInicio}E6 0%, ${e.colorInicio}99 40%, transparent 75%)` }}
              />
            )}
          </>
        )}
        <div className="container relative px-4 py-16 lg:py-24">
          {e.etiqueta && (
            <Badge className={`mb-4 ${pastilla} backdrop-blur-sm`} style={{ color: colorLetra }}>
              <Sparkles className="mr-1 h-3 w-3" /> {e.etiqueta}
            </Badge>
          )}
          <h1 className="font-display text-5xl font-semibold leading-tight md:text-6xl">{camp.nombre}</h1>
          {camp.descripcion && (
            <p className="mt-3 max-w-2xl text-lg opacity-90">{camp.descripcion}</p>
          )}
          {e.mostrarFechas && (camp.fecha_inicio || camp.fecha_fin) && (
            <p className={`mt-4 inline-flex items-center gap-2 rounded-full ${pastilla} px-4 py-1.5 text-sm backdrop-blur-sm`}>
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
                <ProductCard key={p.slug ?? i} p={p} priority={i < 4} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
