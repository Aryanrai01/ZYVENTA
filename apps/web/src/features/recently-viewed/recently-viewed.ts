import { PATTERNS, PRODUCT_CARDS_MAX } from '@zyventa/shared';
import { z } from 'zod';
import { createLocalStore } from '@/lib/local-store';

export const RECENTLY_VIEWED_MAX = 12;
const EMPTY: string[] = [];

export const recentlyViewed = createLocalStore(
  'zv_recently_viewed',
  z.array(z.string().regex(PATTERNS.slug)).max(PRODUCT_CARDS_MAX),
  EMPTY,
);

export const RECENTLY_VIEWED_EMPTY = EMPTY;

/** Most recent first, de-duplicated, capped. */
export function pushRecent(slugs: string[], slug: string): string[] {
  return [slug, ...slugs.filter((s) => s !== slug)].slice(0, RECENTLY_VIEWED_MAX);
}
