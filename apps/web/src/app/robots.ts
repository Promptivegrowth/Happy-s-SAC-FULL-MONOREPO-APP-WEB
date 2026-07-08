import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'https://www.disfraceshappys.com.pe';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Áreas privadas que no queremos indexar
        disallow: ['/checkout', '/cuenta', '/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
