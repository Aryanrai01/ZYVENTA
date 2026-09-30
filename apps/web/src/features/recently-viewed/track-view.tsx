'use client';

import { useEffect } from 'react';
import { pushRecent, recentlyViewed } from './recently-viewed';

/** Records a product view in this browser (no server call, nothing personal stored). */
export function TrackRecentlyViewed({ slug }: { slug: string }) {
  useEffect(() => {
    recentlyViewed.set((slugs) => pushRecent(slugs, slug));
  }, [slug]);
  return null;
}
