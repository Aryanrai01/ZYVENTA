'use client';

import { useQuery } from '@tanstack/react-query';
import { ProductRail } from '@/components/catalog/product-card';
import { HomeSection } from '@/features/home/section';
import { useLocalStore } from '@/lib/local-store';
import { engagementService } from '@/services/commerce.service';
import { RECENTLY_VIEWED_EMPTY, recentlyViewed } from './recently-viewed';

/** "Recommended for you": based on the categories of what this browser viewed recently. */
export function RecommendedRail() {
  const slugs = useLocalStore(recentlyViewed, RECENTLY_VIEWED_EMPTY).slice(0, 12);
  const { data = [] } = useQuery({
    queryKey: ['recommended', slugs],
    queryFn: () => engagementService.recommended(slugs),
    enabled: slugs.length > 0,
    staleTime: 5 * 60_000,
  });
  if (data.length === 0) return null;
  return (
    <HomeSection
      id="recommended"
      title="Recommended for you"
      subtitle="Based on what you’ve been browsing"
    >
      <ProductRail products={data} />
    </HomeSection>
  );
}
