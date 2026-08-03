/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@happy/ui', '@happy/db', '@happy/lib'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'trkokphwmkedhxwjriod.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'disfraceshappys.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // Los server actions reciben las fotos por FormData. El límite por defecto
    // es 1MB, lo que hacía fallar la subida de fotos de disfraces (varios MB).
    // Lo subimos por encima del tope de la app (10MB) para dar margen.
    serverActions: { bodySizeLimit: '12mb' },
  },
  // Lint corre como task separado (pnpm turbo run lint), no durante el build.
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
