/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@happy/ui', '@happy/db', '@happy/lib'],
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
