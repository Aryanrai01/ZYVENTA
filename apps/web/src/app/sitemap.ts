import type { CategoryNode } from '@zyventa/shared';
import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';
import { catalogService } from '@/services/catalog.service';

export const revalidate = 3600;

const MAX_PRODUCT_PAGES = 50; // 50 × 60 = 3,000 URLs; split into sitemap indexes beyond that.

function flatten(nodes: CategoryNode[]): CategoryNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const entries: MetadataRoute.Sitemap = [
    { url: site, changeFrequency: 'daily', priority: 1 },
    { url: `${site}/products`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${site}/categories`, changeFrequency: 'weekly', priority: 0.7 },
  ];

  try {
    const categories = flatten(await catalogService.categories({ next: { revalidate } }));
    for (const category of categories) {
      entries.push({
        url: `${site}/categories/${category.slug}`,
        changeFrequency: 'daily',
        priority: category.level === 0 ? 0.8 : 0.6,
      });
    }

    for (let page = 1; page <= MAX_PRODUCT_PAGES; page += 1) {
      const result = await catalogService.products(
        { sort: 'newest', page, limit: 60 },
        { next: { revalidate } },
      );
      for (const product of result.data) {
        entries.push({
          url: `${site}/products/${product.slug}`,
          changeFrequency: 'weekly',
          priority: 0.7,
        });
      }
      if (!result.pagination?.hasNextPage) break;
    }
  } catch {
    // API unavailable: serve the static entries rather than failing the sitemap.
  }
  return entries;
}
