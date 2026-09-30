'use client';

import { useQuery } from '@tanstack/react-query';
import { ProductRail } from '@/components/catalog/product-card';
import { HomeSection } from '@/features/home/section';
import { useLocalStore } from '@/lib/local-store';
import { recentlyViewedService } from '@/services/shopper.service';
import { RECENTLY_VIEWED_EMPTY, recentlyViewed } from './recently-viewed';

/** "Recently viewed" shelf from slugs kept in this browser; hidden until there is history. */
export function RecentlyViewedRail({ excludeSlug }: { excludeSlug?: string }) {
  const slugs = useLocalStore(recentlyViewed, RECENTLY_VIEWED_EMPTY).filter(
    (s) => s !== excludeSlug,
  );
  const { data = [] } = useQuery({
    queryKey: ['recently-viewed', slugs],
    queryFn: () => recentlyViewedService.cards(slugs),
    enabled: slugs.length > 0,
    staleTime: 5 * 60_000,
  });
  if (data.length === 0) return null;
  return (
    <HomeSection id="recently-viewed" title="Recently viewed">
      <ProductRail products={data} />
    </HomeSection>
  );
}
