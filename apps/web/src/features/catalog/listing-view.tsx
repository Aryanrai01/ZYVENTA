import type { PaginationMeta, ProductCard, ProductFacets } from '@zyventa/shared';
import { PackageSearch, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';
import { ProductGrid } from '@/components/catalog/product-card';
import { EmptyState } from '@/components/feedback/empty-state';
import { Breadcrumbs, type Crumb } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { catalogService, type ProductFilters } from '@/services/catalog.service';
import { activeFilterCount } from './filters';
import { FilterPanel } from './filter-panel';
import { MobileFilters, SortSelect } from './listing-toolbar';
import { Pagination } from './pagination';

interface ListingViewProps {
  title: string;
  description?: ReactNode;
  breadcrumbs: Crumb[];
  filters: ProductFilters;
  /** Path the filters are applied to, e.g. /categories/fashion. */
  basePath: string;
  /** Filter keys carried by the path, left out of generated URLs. */
  omit?: (keyof ProductFilters)[];
  /** Extra content under the heading (sub-category chips). */
  aside?: ReactNode;
}

type Loaded =
  | { ok: true; items: ProductCard[]; pagination: PaginationMeta; facets: ProductFacets | null }
  | { ok: false };

const numberFormatter = new Intl.NumberFormat('en-IN');

async function load(filters: ProductFilters): Promise<Loaded> {
  const context = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { category: filters.category } : {}),
  };
  const [products, facets] = await Promise.allSettled([
    catalogService.products(filters, { next: { revalidate: 60, tags: ['products'] } }),
    catalogService.facets(context, { next: { revalidate: 120, tags: ['products'] } }),
  ]);
  if (products.status === 'rejected' || !products.value.pagination) return { ok: false };
  return {
    ok: true,
    items: products.value.data,
    pagination: products.value.pagination,
    facets: facets.status === 'fulfilled' ? facets.value : null,
  };
}

/** Shared listing layout for /products, /search and /categories/[slug]. */
export async function ListingView({
  title,
  description,
  breadcrumbs,
  filters,
  basePath,
  omit = [],
  aside,
}: ListingViewProps) {
  const result = await load(filters);
  const panelProps = {
    facets: result.ok ? result.facets : null,
    filters,
    basePath,
    omit,
  };
  const hasQuery = Boolean(filters.q);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Breadcrumbs items={breadcrumbs} />
      <div className="mt-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <div className="mt-1 text-muted-foreground">{description}</div> : null}
      </div>
      {aside ? <div className="mt-4">{aside}</div> : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-32 max-h-[calc(100dvh-9rem)] overflow-y-auto pr-2">
            <FilterPanel {...panelProps} />
          </div>
        </aside>

        <section aria-label="Products" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {result.ok
                ? `${numberFormatter.format(result.pagination.total)} ${result.pagination.total === 1 ? 'product' : 'products'}`
                : ''}
            </p>
            <div className="flex items-center gap-2">
              <MobileFilters {...panelProps} />
              <SortSelect filters={filters} basePath={basePath} omit={omit} hasQuery={hasQuery} />
            </div>
          </div>

          {!result.ok ? (
            <EmptyState
              icon={TriangleAlert}
              title="We couldn’t load products"
              description="Please try again in a moment."
              action={
                <Button asChild variant="outline">
                  <Link href={basePath as Route}>Try again</Link>
                </Button>
              }
            />
          ) : result.items.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={hasQuery ? `No results for “${filters.q ?? ''}”` : 'No products match'}
              description={
                activeFilterCount(filters) > 0
                  ? 'Try removing some filters.'
                  : 'Check the spelling or try a more general term.'
              }
              action={
                <Button asChild variant="outline">
                  <Link href="/products">Browse all products</Link>
                </Button>
              }
            />
          ) : (
            <>
              <ProductGrid products={result.items} priorityCount={4} />
              <Pagination
                meta={result.pagination}
                filters={filters}
                basePath={basePath}
                omit={omit}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export function ListingSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label="Loading products"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
        <div className="hidden space-y-3 lg:block">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card">
              <div className="aspect-square animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
