import type { Response } from 'express';

/**
 * Public, shared-cacheable response (CDN / Next.js fetch cache). Only for anonymous catalogue
 * data that is identical for every visitor — never for anything user-specific.
 */
export function publicCache(res: Response, maxAgeSeconds: number): void {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${String(maxAgeSeconds)}, stale-while-revalidate=${String(maxAgeSeconds * 4)}`,
  );
  res.vary('Accept-Encoding');
}
