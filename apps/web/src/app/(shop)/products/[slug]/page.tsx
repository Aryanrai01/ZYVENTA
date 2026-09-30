import type { ProductCard, ProductDetail } from '@zyventa/shared';
import type { Metadata, Route } from 'next';
import { notFound } from 'next/navigation';
import { cache, Suspense } from 'react';
import { ProductRail } from '@/components/catalog/product-card';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { HomeSection } from '@/features/home/section';
import { ProductExperience } from '@/features/product/product-experience';
import { productJsonLd, serializeJsonLd } from '@/features/product/structured-data';
import { RecentlyViewedRail } from '@/features/recently-viewed/recently-viewed-rail';
import { ReviewsSection } from '@/features/reviews/reviews-section';
import { TrackRecentlyViewed } from '@/features/recently-viewed/track-view';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { publicEnv } from '@/lib/env';
import { catalogService } from '@/services/catalog.service';

type Props = { params: Promise<{ slug: string }> };

const getProduct = cache(async (slug: string): Promise<ProductDetail> => {
  try {
    return await catalogService.product(slug, {
      next: { revalidate: 60, tags: ['products', `product:${slug}`] },
    });
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 400)) {
      notFound();
    }
    throw error;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct((await params).slug);
  const image = product.images[0];
  return {
    title: product.seo.title,
    description: product.seo.description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.seo.title,
      description: product.seo.description,
      ...(image && !image.url.endsWith('.svg')
        ? { images: [{ url: image.url, alt: image.alt }] }
        : {}),
    },
  };
}

async function BoughtTogether({ slug }: { slug: string }) {
  let items: ProductCard[] = [];
  try {
    items = (
      await apiClient.get<ProductCard[]>(`/products/${encodeURIComponent(slug)}/bought-together`, {
        next: { revalidate: 3600 },
      })
    ).data;
  } catch {
    items = [];
  }
  if (items.length === 0) return null;
  return (
    <HomeSection id="bought-together" title="Frequently bought together">
      <ProductRail products={items} />
    </HomeSection>
  );
}

async function Related({ slug }: { slug: string }) {
  let related: ProductCard[] = [];
  try {
    related = await catalogService.related(slug, { next: { revalidate: 300 } });
  } catch {
    related = [];
  }
  if (related.length === 0) return null;
  return (
    <HomeSection id="related" title="Similar products">
      <ProductRail products={related} />
    </HomeSection>
  );
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  const crumbs = [
    { name: 'Home', href: '/' as Route },
    ...product.breadcrumbs.map((b) => ({ name: b.name, href: `/categories/${b.slug}` as Route })),
    { name: product.name },
  ];
  const specGroups = new Map<string, ProductDetail['specifications']>();
  for (const spec of product.specifications) {
    const group = spec.group || 'General';
    specGroups.set(group, [...(specGroups.get(group) ?? []), spec]);
  }

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD is built from API data and escaped for safe embedding (see serializeJsonLd).
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(productJsonLd(product, publicEnv.NEXT_PUBLIC_SITE_URL)),
        }}
      />
      <TrackRecentlyViewed slug={product.slug} />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Breadcrumbs items={crumbs} />
        <div className="mt-4">
          <Suspense>
            <ProductExperience product={product} />
          </Suspense>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-10">
            {product.highlights.length > 0 ? (
              <section aria-labelledby="highlights">
                <h2 id="highlights" className="text-lg font-semibold">
                  Highlights
                </h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
                  {product.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {product.description ? (
              <section aria-labelledby="description">
                <h2 id="description" className="text-lg font-semibold">
                  Description
                </h2>
                <div
                  className="rich-text mt-3 text-sm"
                  // Sanitised server-side against a strict allowlist (apps/api products/sanitize.ts).
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </section>
            ) : null}
          </div>

          {product.specifications.length > 0 ? (
            <section aria-labelledby="specifications" className="min-w-0">
              <h2 id="specifications" className="text-lg font-semibold">
                Specifications
              </h2>
              <div className="mt-3 overflow-hidden rounded-xl border bg-card">
                {[...specGroups].map(([group, specs]) => (
                  <table key={group} className="w-full text-sm">
                    <caption className="bg-muted px-4 py-2 text-left font-medium">{group}</caption>
                    <tbody>
                      {specs.map((spec) => (
                        <tr key={`${spec.name}-${spec.value}`} className="border-t">
                          <th
                            scope="row"
                            className="w-2/5 px-4 py-2 text-left font-normal text-muted-foreground"
                          >
                            {spec.name}
                          </th>
                          <td className="px-4 py-2">{spec.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <ReviewsSection slug={product.slug} productName={product.name} />
      <Suspense>
        <BoughtTogether slug={product.slug} />
      </Suspense>
      <Suspense>
        <Related slug={product.slug} />
      </Suspense>
      <RecentlyViewedRail excludeSlug={product.slug} />
    </>
  );
}
