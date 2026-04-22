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
