import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';
const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Baseline security headers for every response. The nonce-based Content-Security-Policy is
 * set per request in src/proxy.ts.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  // Trace files from the monorepo root so the standalone build includes @zyventa/shared.
  outputFileTracingRoot: monorepoRoot,
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' }],
  },
  async rewrites() {
    const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL!);
    const configuredPath = apiUrl.pathname.replace(/\/+$/, '');
    const apiPath = configuredPath.endsWith('/api/v1')
      ? configuredPath
      : `${configuredPath}/api/v1`;

    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl.origin}${apiPath}/:path*`,
      },
    ];
  },
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default nextConfig;
