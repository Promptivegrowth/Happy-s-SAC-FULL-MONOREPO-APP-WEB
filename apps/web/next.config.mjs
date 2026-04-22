/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@happy/ui', '@happy/db', '@happy/lib'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'disfraceshappys.com' },
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion'],
  },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
