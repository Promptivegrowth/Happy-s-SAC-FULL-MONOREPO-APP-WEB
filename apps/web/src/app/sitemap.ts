import type { MetadataRoute } from 'next';
import { createClient } from '@happy/db/server';

const SITE_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://www.disfraceshappys.com.pe';

export const revalidate = 3600;  // regenera cada hora

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paginasFijas: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/disfraces/nino`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/disfraces/nina`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/disfraces/adulto`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/contacto`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/nosotros`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  try {
    const sb = await createClient();

    const [catsRes, pubRes] = await Promise.all([
      sb.from('categorias').select('slug, updated_at').eq('activo', true),
      sb
        .from('productos_publicacion')
        .select('slug, updated_at')
        .eq('publicado', true)
        .not('slug', 'is', null),
    ]);

    const categorias: MetadataRoute.Sitemap = ((catsRes.data ?? []) as { slug: string; updated_at: string | null }[])
      .filter((c) => c.slug)
      .map((c) => ({
        url: `${SITE_URL}/categoria/${c.slug}`,
        lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));

    const productos: MetadataRoute.Sitemap = ((pubRes.data ?? []) as { slug: string; updated_at: string | null }[])
      .filter((p) => p.slug)
      .map((p) => ({
        url: `${SITE_URL}/productos/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));

    return [...paginasFijas, ...categorias, ...productos];
  } catch {
    // Si Supabase falla no rompemos el sitemap — devolvemos solo las páginas fijas
    return paginasFijas;
  }
}
